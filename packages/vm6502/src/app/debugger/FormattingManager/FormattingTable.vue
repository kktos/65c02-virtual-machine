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
							sort-key="address"
							:current-key="sortKey"
							:direction="sortDirection"
							@sort="handleSort('address')"
						>
							Address
						</SortableTableHeader>
						<TableHead class="text-gray-300">Type</TableHead>
						<TableHead class="text-gray-300">Length</TableHead>
						<TableHead class="text-gray-300">Preview</TableHead>
						<SortableTableHeader
							sort-key="group"
							:current-key="sortKey"
							:direction="sortDirection"
							@sort="handleSort('group')"
						>
							Group
						</SortableTableHeader>
						<TableHead class="w-[100px] text-gray-300 text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<!-- New Rule Row (Add Mode) -->
					<FormattingEditRow v-if="editingRule && editingRule.isNew" />

					<!-- Rules Rows -->
					<template v-for="rule in paginatedRules" :key="`${rule.address}-${rule.group}`">
						<!-- Inline Edit Row -->
						<FormattingEditRow
							v-if="
								editingRule &&
								!editingRule.isNew &&
								editingRule.originalAddress === rule.address &&
								editingRule.originalGroup === rule.group
							"
						/>

						<!-- Display Row -->
						<TableRow
							v-else
							@click="gotoRule(rule)"
							class="cursor-pointer border-gray-700 hover:bg-gray-700 h-[41px]"
							:class="{ 'bg-blue-900/30 hover:bg-blue-900/40': selectedRules.has(getRuleId(rule)) }"
						>
							<TableCell class="px-4" @click.stop>
								<input
									type="checkbox"
									:checked="selectedRules.has(getRuleId(rule))"
									@change="toggleSelection(getRuleId(rule))"
									class="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
								/>
							</TableCell>
							<TableCell class="font-mono text-indigo-300">
								<div class="flex flex-col leading-none gap-0.5">
									<span>{{ formatAddress(rule.address) }}</span>
									<span
										v-if="formatSymbol(rule.address)"
										class="text-xs font-sans truncate max-w-[120px]"
										:style="{ color: settings.disassembly.syntax.label }"
										:title="formatSymbol(rule.address)!"
									>
										{{ formatSymbol(rule.address) }}
									</span>
								</div>
							</TableCell>
							<TableCell class="text-gray-200">{{ rule.type }}</TableCell>
							<TableCell class="text-gray-400">{{ rule.length }}</TableCell>
							<TableCell
								class="font-mono text-xs text-gray-400 truncate max-w-[150px]"
								:title="getPreview(rule)"
								>{{ getPreview(rule) }}</TableCell
							>
							<TableCell class="text-gray-200">{{ rule.group }}</TableCell>
							<TableCell class="text-right">
								<div class="flex items-center justify-end gap-1" @click.stop>
									<button
										@click="beginEdit(rule)"
										class="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-600 rounded"
										title="Edit"
									>
										<Pencil class="h-4 w-4" />
									</button>
								</div>
							</TableCell>
						</TableRow>
					</template>

					<TableRow v-if="filteredRules.length === 0 && !editingRule">
						<TableCell colspan="7" class="text-center text-gray-500 py-8"
							>No formatting rules found.</TableCell
						>
					</TableRow>
				</TableBody>
			</Table>
		</div>
		<div class="shrink-0 flex items-center justify-end mt-3 text-sm text-gray-400">
			<div>
				<span v-if="selectedRules.size > 0" class="mr-4">Selected: {{ selectedRules.size }}</span>
				<span class="mr-4">Showing {{ paginatedRules.length }} of {{ filteredRules.length }} total </span>
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
import { ChevronLeft, ChevronRight, Pencil } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type DataBlock, useFormatting } from "@/composables/useDataFormattings";
import { useSymbols } from "@/composables/useSymbols";
import { formatAddress } from "@/lib/hex.utils";
import FormattingEditRow from "./FormattingEditRow.vue";
import { useFormattingEditing } from "@/composables/useFormattingEditing";
import { useTableSort } from "@/composables/useTableSort";
import { usePagination } from "@/composables/usePagination";
import SortableTableHeader from "@/components/SortableTableHeader.vue";
import { useSettings } from "@/composables/useSettings";

const props = defineProps<{
	searchTerm: string;
	selectedGroup: string;
	itemsPerPage: number;
}>();

const emit = defineEmits<{
	(e: "gotoAddress", address: number): void;
}>();

const { findFormattings } = useFormatting();
const { editingRule, getPreview, beginAddRule: _beginAddRule, beginEdit } = useFormattingEditing();
const { findSymbolWithOffset } = useSymbols();
const { settings } = useSettings();

const formatSymbol = (address: number) => {
	const match = findSymbolWithOffset(address);
	if (!match) return null;
	const { symbol, offset } = match;
	if (offset === 0) return symbol.label;
	return `${symbol.label}${offset > 0 ? "+" : ""}${offset}`;
};

const selectedRules = ref(new Set<number>());
const getRuleId = (rule: DataBlock) => rule.id as number;

type SortKey = "address" | "group";
const { sortKey, sortDirection, handleSort, resolveAndCompare } = useTableSort<SortKey>("address");

const tableContainerRef = ref<HTMLElement | null>(null);

const isAllSelected = computed(() => {
	if (!filteredRules.value || filteredRules.value.length === 0) return false;
	return filteredRules.value.every((r) => selectedRules.value.has(getRuleId(r)));
});

const toggleSelectAll = () => {
	if (isAllSelected.value) {
		selectedRules.value.clear();
	} else {
		filteredRules.value.forEach((r) => selectedRules.value.add(getRuleId(r)));
	}
};

const toggleSelection = (ruleId: number) => {
	if (selectedRules.value.has(ruleId)) {
		selectedRules.value.delete(ruleId);
	} else {
		selectedRules.value.add(ruleId);
	}
};

const clearSelection = () => {
	selectedRules.value.clear();
};

const beginAddRule = () => {
	_beginAddRule();
	if (tableContainerRef.value) tableContainerRef.value.scrollTop = 0;
};

watch([() => props.searchTerm, () => props.selectedGroup], () => {
	// Reset page and selection when filters change
	selectedRules.value.clear();
	currentPage.value = 1;
});

const gotoRule = (rule: { address: number }) => {
	if (editingRule.value) return;
	emit("gotoAddress", rule.address);
};

const filteredRules = computed(() => {
	const rules = findFormattings(props.searchTerm, props.selectedGroup);
	return rules.sort((a, b) =>
		resolveAndCompare(a, b, (item, key) => (key === "address" ? item.address : item.group || "")),
	);
});

const {
	currentPage,
	totalPages,
	paginatedItems: paginatedRules,
} = usePagination(filteredRules, () => props.itemsPerPage);

defineExpose({
	beginAddRule,
	selectedRules,
	clearSelection,
});
</script>
