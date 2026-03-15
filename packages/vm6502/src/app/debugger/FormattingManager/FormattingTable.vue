<template>
	<div ref="tableContainerRef" class="flex-1 overflow-y-auto border border-gray-700 rounded-md">
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
				<template v-for="rule in filteredRules" :key="`${rule.address}-${rule.group}`">
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
					<TableRow v-else @click="gotoRule(rule)" class="cursor-pointer border-gray-700 hover:bg-gray-700">
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
					<TableCell colspan="6" class="text-center text-gray-500 py-8">No formatting rules found.</TableCell>
				</TableRow>
			</TableBody>
		</Table>
	</div>
</template>

<script setup lang="ts">
import { Pencil, Trash2 } from "lucide-vue-next";
import { computed, ref } from "vue";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type DataBlock, useFormatting } from "@/composables/useDataFormattings";
import { formatAddress } from "@/lib/hex.utils";
import FormattingEditRow from "./FormattingEditRow.vue";
import { useFormattingEditing } from "@/composables/useFormattingEditing";
import { useTableSort } from "@/composables/useTableSort";
import SortableTableHeader from "@/components/SortableTableHeader.vue";

const props = defineProps<{
	searchTerm: string;
	selectedGroup: string;
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

const handleDelete = (rule: DataBlock) => {
	if (confirm(`Remove formatting at ${formatAddress(rule.address)}?`)) {
		removeFormat(rule.address, rule.group);
	}
};

defineExpose({
	beginAddRule,
});
</script>
