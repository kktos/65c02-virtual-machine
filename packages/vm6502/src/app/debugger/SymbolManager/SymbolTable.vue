<template>
	<div class="flex flex-col h-full">
		<div ref="tableContainerRef" class="flex-1 overflow-y-auto border border-gray-700 rounded-md min-h-0">
			<Table>
				<TableHeader class="sticky top-0 bg-gray-800">
					<TableRow class="border-gray-700 hover:bg-gray-700/50">
						<TableHead class="w-12 px-4">
							<input
								type="checkbox"
								:checked="isAllSelected"
								@change="toggleSelectAll"
								class="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
								title="Select All/None"
							/>
						</TableHead>
						<SortableTableHeader
							sort-key="ns"
							:current-key="sortKey"
							:direction="sortDirection"
							@sort="handleSort('ns')"
						>
							Namespace
						</SortableTableHeader>
						<SortableTableHeader
							sort-key="label"
							:current-key="sortKey"
							:direction="sortDirection"
							@sort="handleSort('label')"
						>
							Label
						</SortableTableHeader>
						<SortableTableHeader
							sort-key="addr"
							:current-key="sortKey"
							:direction="sortDirection"
							@sort="handleSort('addr')"
						>
							Address
						</SortableTableHeader>
						<SortableTableHeader
							sort-key="scope"
							:current-key="sortKey"
							:direction="sortDirection"
							@sort="handleSort('scope')"
						>
							Scope
						</SortableTableHeader>
						<SortableTableHeader
							v-if="shouldDisplayDisk"
							sort-key="disk"
							:current-key="sortKey"
							:direction="sortDirection"
							@sort="handleSort('disk')"
						>
							Disk
						</SortableTableHeader>
						<TableHead class="w-[100px] text-gray-300">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<!-- New Symbol Row (Add Mode) -->
					<SymbolEditRow
						v-if="editingSymbol && editingSymbol.isNew"
						:should-display-disk="shouldDisplayDisk"
					/>

					<!-- Symbol Rows -->
					<template v-for="symbol in paginatedSymbols" :key="`${symbol.addr}-${symbol.ns}-${symbol.disk}`">
						<!-- Inline Edit Row -->
						<SymbolEditRow
							v-if="
								editingSymbol &&
								!editingSymbol.isNew &&
								editingSymbol.originalAddress === symbol.addr &&
								editingSymbol.originalNamespace === symbol.ns
							"
							:should-display-disk="shouldDisplayDisk"
						/>

						<!-- Display Row -->
						<TableRow
							v-else
							@click="gotoSymbol(symbol)"
							class="cursor-pointer border-gray-700 hover:bg-gray-700/80 h-[41px]"
							:class="{ 'bg-blue-900/30 hover:bg-blue-900/40': selectedSymbols.has(symbol.id!) }"
						>
							<TableCell class="px-4" @click.stop>
								<input
									type="checkbox"
									:checked="selectedSymbols.has(symbol.id!)"
									@change="toggleSelection(symbol.id!)"
									class="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
								/>
							</TableCell>
							<TableCell class="truncate" :title="symbol.ns">{{ symbol.ns }}</TableCell>
							<TableCell class="font-semibold" :style="{ color: settings.disassembly.syntax.label }">
								<div class="flex items-center gap-2">
									<span>{{ symbol.label }}</span>
									<div v-if="symbol.src" :title="symbol.src">
										<FileText class="h-3 w-3 text-gray-500 hover:text-gray-300" />
									</div>
								</div>
							</TableCell>
							<TableCell class="font-mono text-indigo-300">{{ formatAddress(symbol.addr) }}</TableCell>
							<TableCell>{{ symbol.scope }}</TableCell>
							<TableCell v-if="shouldDisplayDisk" class="truncate" :title="symbol.disk">
								{{ symbol.disk }}
							</TableCell>
							<TableCell>
								<div class="flex items-center justify-end gap-1" @click.stop>
									<button
										@click="toggleSymbolBreakpoint(symbol)"
										class="p-1 hover:bg-gray-600 rounded"
										:title="
											isBreakpointActive(symbol.addr) ? 'Remove Breakpoint' : 'Add Breakpoint'
										"
									>
										<OctagonPause
											class="h-4 w-4"
											:class="
												isBreakpointActive(symbol.addr)
													? 'fill-red-500 text-red-500'
													: 'text-gray-400'
											"
										/>
									</button>
									<button
										@click="beginEdit(symbol)"
										class="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-600 rounded"
										title="Edit"
									>
										<Pencil class="h-4 w-4" />
									</button>
								</div>
							</TableCell>
						</TableRow>
					</template>

					<TableRow v-if="filteredSymbols?.length === 0 && !editingSymbol">
						<TableCell :colspan="shouldDisplayDisk ? 7 : 6" class="text-center text-gray-500 py-8">
							No symbols found.
						</TableCell>
					</TableRow>
				</TableBody>
			</Table>
		</div>
		<div class="shrink-0 flex items-center justify-end mt-3 text-sm text-gray-400">
			<div>
				<span v-if="selectedSymbols.size > 0" class="mr-4">Selected: {{ selectedSymbols.size }}</span>
				<span>Showing {{ paginatedSymbols.length }} of {{ filteredSymbols?.length ?? 0 }} total </span>
			</div>
			<div class="flex items-center gap-2" v-if="totalPages > 1">
				<button
					class="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
					:disabled="currentPage === 1"
					@click="currentPage--"
				>
					<ChevronLeft class="h-4 w-4" />
				</button>
				<span class="text-sm text-gray-400 min-w-[80px] text-center">
					Page {{ currentPage }} of {{ totalPages }}
				</span>
				<button
					class="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
					:disabled="currentPage === totalPages"
					@click="currentPage++"
				>
					<ChevronRight class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, FileText, OctagonPause, Pencil } from "lucide-vue-next";
import { computed, inject, type Ref, ref, watch } from "vue";
import SortableTableHeader from "@/components/SortableTableHeader.vue";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useSymbols, type SymbolEntry } from "@/composables/useSymbols";
import { useTableSort } from "@/composables/useTableSort";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import SymbolEditRow from "./SymbolEditRow.vue";
import { useSymbolEditing } from "@/composables/useSymbolEditing";
import { usePagination } from "@/composables/usePagination";
import { useSettings } from "@/composables/useSettings";

const props = defineProps<{
	searchTerm: string;
	selectedNamespace: string;
	shouldDisplayDisk: boolean;
	itemsPerPage: number;
}>();

const emit = defineEmits<{
	(e: "gotoAddress", address: number): void;
}>();

const vm = inject<Ref<VirtualMachine>>("vm");
const { findSymbols } = useSymbols();
const { pcBreakpoints, toggleBreakpoint } = useBreakpoints();
const { editingSymbol, beginAddSymbol: _beginAddSymbol, beginEdit } = useSymbolEditing();
const { settings } = useSettings();

const selectedSymbols = ref(new Set<number>());
const tableContainerRef = ref<HTMLElement | null>(null);

watch([() => props.searchTerm, () => props.selectedNamespace], () => {
	selectedSymbols.value.clear();
	currentPage.value = 1;
});

type SortKey = keyof SymbolEntry;
const { sortKey, sortDirection, handleSort, resolveAndCompare } = useTableSort<SortKey>("addr");

const filteredSymbols = computed(() => {
	const symbols = findSymbols(props.searchTerm, props.selectedNamespace);
	return symbols.sort((a, b) =>
		resolveAndCompare(a, b, (item, key) => (item[key] !== undefined ? (item[key] as string | number) : "")),
	);
});

const {
	currentPage,
	totalPages,
	paginatedItems: paginatedSymbols,
} = usePagination(filteredSymbols, () => props.itemsPerPage);

const isAllSelected = computed(() => {
	if (!filteredSymbols.value || filteredSymbols.value.length === 0) return false;
	return filteredSymbols.value.every((s) => selectedSymbols.value.has(s.id!));
});

const gotoSymbol = (symbol: { addr: number }) => {
	if (editingSymbol.value) return; // Prevent navigation while editing
	emit("gotoAddress", symbol.addr);
};

const beginAddSymbol = () => {
	_beginAddSymbol();
	if (tableContainerRef.value) tableContainerRef.value.scrollTop = 0;
};

const toggleSymbolBreakpoint = (symbol: { addr: number }) => {
	toggleBreakpoint({ type: "pc", address: symbol.addr }, vm?.value);
};

const isBreakpointActive = (addr: number) => {
	return pcBreakpoints.value.has(addr) && pcBreakpoints.value.get(addr);
};

const toggleSelectAll = () => {
	if (isAllSelected.value) {
		selectedSymbols.value.clear();
	} else {
		filteredSymbols.value.forEach((s) => selectedSymbols.value.add(s.id!));
	}
};

const toggleSelection = (symbolId: number) => {
	if (selectedSymbols.value.has(symbolId)) {
		selectedSymbols.value.delete(symbolId);
	} else {
		selectedSymbols.value.add(symbolId);
	}
};

const clearSelection = () => {
	selectedSymbols.value.clear();
};

defineExpose({ beginAddSymbol, selectedSymbols, clearSelection });
</script>
