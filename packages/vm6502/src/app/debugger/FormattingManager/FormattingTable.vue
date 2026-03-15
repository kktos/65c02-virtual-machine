<template>
	<div class="flex flex-col h-full">
		<div ref="tableContainerRef" class="flex-1 overflow-y-auto border border-gray-700 rounded-md min-h-0">
			<Table>
				<TableHeader class="sticky top-0 bg-gray-800">
					<TableRow class="border-gray-700 hover:bg-gray-700/50">
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
							class="cursor-pointer border-gray-700 hover:bg-gray-700"
						>
							<TableCell class="font-mono text-indigo-300">{{ formatAddress(rule.address) }}</TableCell>
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
									<button
										@click="handleDelete(rule)"
										class="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded"
										title="Delete"
									>
										<Trash2 class="h-4 w-4" />
									</button>
								</div>
							</TableCell>
						</TableRow>
					</template>

					<TableRow v-if="filteredRules.length === 0 && !editingRule" class="hover:bg-transparent">
						<TableCell colspan="6" class="text-center text-gray-500 py-8"
							>No formatting rules found.</TableCell
						>
					</TableRow>
				</TableBody>
			</Table>
		</div>
		<div class="shrink-0 flex items-center justify-end mt-3 text-sm text-gray-400">
			<div>
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
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type DataBlock, useFormatting } from "@/composables/useDataFormattings";
import { formatAddress } from "@/lib/hex.utils";
import FormattingEditRow from "./FormattingEditRow.vue";
import { useFormattingEditing } from "@/composables/useFormattingEditing";
import { useTableSort } from "@/composables/useTableSort";
import { usePagination } from "@/composables/usePagination";
import SortableTableHeader from "@/components/SortableTableHeader.vue";

const props = defineProps<{
	searchTerm: string;
	selectedGroup: string;
	itemsPerPage: number;
}>();

const emit = defineEmits<{
	(e: "gotoAddress", address: number): void;
}>();

const { findFormattings, removeFormat } = useFormatting();
const { editingRule, getPreview, beginAddRule: _beginAddRule, beginEdit } = useFormattingEditing();

type SortKey = "address" | "group";
const { sortKey, sortDirection, handleSort, resolveAndCompare } = useTableSort<SortKey>("address");

const tableContainerRef = ref<HTMLElement | null>(null);

const beginAddRule = () => {
	_beginAddRule();
	if (tableContainerRef.value) tableContainerRef.value.scrollTop = 0;
};

watch([() => props.searchTerm, () => props.selectedGroup], () => {
	// Reset page when filters change
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

const handleDelete = (rule: DataBlock) => {
	if (confirm(`Remove formatting at ${formatAddress(rule.address)}?`)) {
		removeFormat(rule.address, rule.group);
	}
};

defineExpose({
	beginAddRule,
});
</script>
