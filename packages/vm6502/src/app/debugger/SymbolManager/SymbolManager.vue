<template>
	<FloatingWindow
		ref="windowRef"
		id="symbol_manager"
		title="Symbol Manager"
		:options="{
			defaultWidth: 960,
			defaultHeight: 700,
			minWidth: 480,
			minHeight: 400,
			contentScrollable: false,
		}"
		@resize="onResize"
	>
		<template #icon>
			<Tags class="h-4 w-4 text-gray-300" />
		</template>

		<div class="p-4 flex flex-col h-full bg-gray-800/95 text-gray-200">
			<p class="text-xs text-gray-400 -mt-2 mb-4">
				Browse, search, and manage symbols across all namespaces. Click a symbol to navigate.
			</p>

			<div class="flex justify-between items-center mb-4 gap-4">
				<Input
					v-model="searchTerm"
					placeholder="Search by label or address..."
					class="flex-1 bg-gray-700 border-gray-600 text-gray-200 placeholder:text-gray-400"
				/>
				<select
					v-model="selectedNamespace"
					class="h-10 w-[200px] rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
				>
					<option value="">All Namespaces</option>
					<option v-for="ns in uniqueNamespaces" :key="ns" :value="ns">
						{{ ns }}
					</option>
				</select>
				<input type="file" ref="importFileInput" class="hidden" accept=".sym,.txt" @change="handleImportFile" />
				<ButtonGroup>
					<Button
						variant="outline"
						size="icon"
						@click="triggerImport"
						class="h-10 bg-gray-600 hover:bg-gray-500 text-white shrink-0"
						title="Import from file"
					>
						<Upload class="h-4 w-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						@click="handleExport"
						class="h-10 bg-gray-600 hover:bg-gray-500 text-white shrink-0"
						title="Export to file"
					>
						<Download class="h-4 w-4" />
					</Button>
				</ButtonGroup>
				<Button
					:disabled="!selectedSymbols.size"
					@click="handleBulkDelete"
					variant="destructive"
					size="icon"
					class="h-10 text-white shrink-0 bg-red-600 hover:bg-red-500"
					title="Delete Selected"
				>
					<Trash2 class="h-4 w-4" />
				</Button>
				<Button
					@click="beginAddSymbol"
					size="icon"
					class="h-10 bg-blue-600 hover:bg-blue-500 text-white shrink-0"
				>
					<PlusCircle class="h-4 w-4" />
				</Button>
			</div>

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
						<template
							v-for="symbol in paginatedSymbols"
							:key="`${symbol.addr}-${symbol.ns}-${symbol.disk}`"
						>
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
								<TableCell class="font-semibold text-yellow-400">
									<div class="flex items-center gap-2">
										<span>{{ symbol.label }}</span>
										<div v-if="symbol.src" :title="symbol.src">
											<FileText class="h-3 w-3 text-gray-500 hover:text-gray-300" />
										</div>
									</div>
								</TableCell>
								<TableCell class="font-mono text-indigo-300">{{
									formatAddress(symbol.addr)
								}}</TableCell>
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

			<div class="flex items-center justify-end mt-3 text-sm text-gray-400">
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
	</FloatingWindow>
</template>

<script setup lang="ts">
import {
	Download,
	FileText,
	OctagonPause,
	Pencil,
	PlusCircle,
	Tags,
	Trash2,
	Upload,
	ChevronLeft,
	ChevronRight,
} from "lucide-vue-next";
import { computed, inject, type Ref, ref, watch } from "vue";
import FloatingWindow from "@/components/FloatingWindow.vue";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useSymbols, type SymbolEntry } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useFileDownload } from "@/composables/useFileDownload";
import { useDiskStorage } from "@/composables/useDiskStorage";
import { useKeyModifier } from "@vueuse/core";
import { useTableSort } from "@/composables/useTableSort";
import SortableTableHeader from "@/components/SortableTableHeader.vue";
import { useSymbolEditing } from "@/composables/useSymbolEditing";
import SymbolEditRow from "./SymbolEditRow.vue";

const emit = defineEmits<{
	(e: "gotoAddress", address: number): void;
}>();

const windowRef = ref<InstanceType<typeof FloatingWindow> | null>(null);
const currentPage = ref(1);
const isCtrlPressed = useKeyModifier("Control");
const shouldDisplayDisk = ref(false);

const vm = inject<Ref<VirtualMachine>>("vm");
const { removeManySymbols, findSymbols, getNamespaceList, addSymbolsFromText, generateTextFromSymbols, diskKey } =
	useSymbols();
const { pcBreakpoints, toggleBreakpoint } = useBreakpoints();
const { editingSymbol, beginAddSymbol: _beginAddSymbol, beginEdit } = useSymbolEditing();
const { downloadFile } = useFileDownload();

const searchTerm = ref("");
const selectedNamespace = ref("");
const selectedSymbols = ref(new Set<number>());

const tableContainerRef = ref<HTMLElement | null>(null);

const ROW_HEIGHT = 41; // Height of a table row in pixels.

const itemsPerPage = ref(0);
const onResize = ({ height }: { width: number; height: number }) => {
	itemsPerPage.value = Math.max(1, Math.floor((height - 5 * ROW_HEIGHT) / ROW_HEIGHT));
};

watch([searchTerm, selectedNamespace], () => {
	selectedSymbols.value.clear();
	currentPage.value = 1;
});

type SortKey = keyof SymbolEntry;
const { sortKey, sortDirection, handleSort, resolveAndCompare } = useTableSort<SortKey>("addr");

const importFileInput = ref<HTMLInputElement | null>(null);

const filteredSymbols = computed(() => {
	const symbols = findSymbols(searchTerm.value, selectedNamespace.value);
	return symbols.sort((a, b) =>
		resolveAndCompare(a, b, (item, key) => (item[key] !== undefined ? (item[key] as string | number) : "")),
	);
});

const uniqueNamespaces = computed(() => {
	const nsList = getNamespaceList();
	const names = nsList.map((ns) => ns[0]);
	return names.sort();
});

const isAllSelected = computed(() => {
	if (!filteredSymbols.value || filteredSymbols.value.length === 0) return false;
	return filteredSymbols.value.every((s) => selectedSymbols.value.has(s.id!));
});

const totalPages = computed(() => {
	return Math.ceil((filteredSymbols.value?.length || 0) / itemsPerPage.value);
});

watch(totalPages, (newTotal) => {
	if (currentPage.value > newTotal) {
		currentPage.value = Math.max(1, newTotal);
	}
});

const paginatedSymbols = computed(() => {
	const start = (currentPage.value - 1) * itemsPerPage.value;
	const end = start + itemsPerPage.value;
	return filteredSymbols.value?.slice(start, end) || [];
});
const gotoSymbol = (symbol: { addr: number }) => {
	if (editingSymbol.value) return; // Prevent navigation while editing
	emit("gotoAddress", symbol.addr);
};

const beginAddSymbol = () => {
	_beginAddSymbol();
	if (tableContainerRef.value) tableContainerRef.value.scrollTop = 0;
};

const triggerImport = () => {
	importFileInput.value?.click();
};

const handleImportFile = async (event: Event) => {
	const input = event.target as HTMLInputElement;
	if (!input.files || input.files.length === 0) return;
	const file = input.files[0] as File;
	const text = await file.text();
	await addSymbolsFromText(text);
	input.value = ""; // Reset input
};

const handleExport = async () => {
	const { loadDisk } = useDiskStorage();
	const disk = await loadDisk(diskKey);
	if (!disk) return;
	const name = disk.name.split(".").slice(0, -1).join(".") || disk.name;

	const content = await generateTextFromSymbols();
	downloadFile(`${name}.sym`, "text/plain;charset=utf-8", content);
};

const toggleSymbolBreakpoint = (symbol: { addr: number }) => {
	toggleBreakpoint({ type: "pc", address: symbol.addr }, vm?.value);
};

const isBreakpointActive = (addr: number) => {
	return pcBreakpoints.value.has(addr) && pcBreakpoints.value.get(addr);
};

const handleBulkDelete = async () => {
	const count = selectedSymbols.value.size;
	if (count === 0) return;
	if (confirm(`Are you sure you want to delete ${count} selected symbol(s)?`)) {
		await removeManySymbols(selectedSymbols.value);
		selectedSymbols.value.clear();
	}
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

const open = () => {
	windowRef.value?.open();
	shouldDisplayDisk.value = !!isCtrlPressed.value;
};

defineExpose({ open });
</script>
