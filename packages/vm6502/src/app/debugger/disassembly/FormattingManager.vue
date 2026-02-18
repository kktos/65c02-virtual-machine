<template>
	<Dialog :open="isOpen" @update:open="(val) => emit('update:isOpen', val)">
		<DialogContent class="sm:max-w-4xl bg-gray-800 border-gray-700 text-gray-200">
			<DialogHeader>
				<DialogTitle class="text-gray-100">Formatting Rules</DialogTitle>
				<DialogDescription class="text-gray-400">
					Manage data formatting rules across all groups.
				</DialogDescription>
			</DialogHeader>

			<!-- Search and Filter -->
			<div class="flex justify-between items-center my-4 gap-4">
				<Input
					v-model="searchTerm"
					placeholder="Search address..."
					class="flex-1 bg-gray-700 border-gray-600 text-gray-200 placeholder:text-gray-400"
				/>
				<select
					v-model="selectedGroup"
					class="h-10 w-[200px] rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800"
				>
					<option value="">All Groups</option>
					<option v-for="group in uniqueGroups" :key="group" :value="group">
						{{ group }}
					</option>
				</select>
				<Button @click="beginAddRule" class="h-10 bg-blue-600 hover:bg-blue-500 text-white shrink-0">
					<PlusCircle class="h-4 w-4 mr-2" />
					Add Rule
				</Button>
			</div>

			<div class="overflow-y-auto max-h-[60vh] border border-gray-700 rounded-md">
				<Table>
					<TableHeader class="sticky top-0 bg-gray-800">
						<TableRow class="border-gray-700 hover:bg-gray-700/50">
							<TableHead @click="handleSort('address')" class="cursor-pointer hover:bg-gray-700/50">
								<div class="flex items-center gap-2 text-gray-300">
									Address
									<ArrowUp v-if="sortKey === 'address' && sortDirection === 'asc'" class="h-4 w-4" />
									<ArrowDown v-if="sortKey === 'address' && sortDirection === 'desc'" class="h-4 w-4" />
								</div>
							</TableHead>
							<TableHead class="text-gray-300">Type</TableHead>
							<TableHead class="text-gray-300">Length</TableHead>
							<TableHead @click="handleSort('group')" class="cursor-pointer hover:bg-gray-700/50">
								<div class="flex items-center gap-2 text-gray-300">
									Group
									<ArrowUp v-if="sortKey === 'group' && sortDirection === 'asc'" class="h-4 w-4" />
									<ArrowDown v-if="sortKey === 'group' && sortDirection === 'desc'" class="h-4 w-4" />
								</div>
							</TableHead>
							<TableHead class="w-[100px] text-gray-300 text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						<!-- New/Editing Rule Row -->
						<TableRow v-if="editingRule" class="bg-gray-700/50 hover:bg-black/50">
							<TableCell class="align-top">
								<div>
									<Input
										v-model="editingRule.address"
										placeholder="$C000"
										class="h-8 bg-gray-900 border-gray-600 font-mono"
										:class="{ 'border-red-500': validationErrors.address }"
										:disabled="!editingRule.isNew"
									/>
									<p class="text-red-400 text-xs mt-1 h-4" :class="{ 'invisible': !validationErrors.address }">
										{{ validationErrors.address || 'Error' }}
									</p>
								</div>
							</TableCell>
							<TableCell class="align-top">
								<select v-model="editingRule.type" class="h-8 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-200 focus:outline-none">
									<option>byte</option>
									<option>word</option>
									<option>string</option>
								</select>
							</TableCell>
							<TableCell class="align-top">
								<div>
									<Input
										v-model.number="editingRule.length"
										type="number"
										min="1"
										class="h-8 bg-gray-900 border-gray-600"
										:class="{ 'border-red-500': validationErrors.length }"
									/>
									<p class="text-red-400 text-xs mt-1 h-4" :class="{ 'invisible': !validationErrors.length }">
										{{ validationErrors.length || 'Error' }}
									</p>
								</div>
							</TableCell>
							<TableCell class="align-top">
								<Input v-model="editingRule.group" placeholder="user" class="h-8 bg-gray-900 border-gray-600" />
							</TableCell>
							<TableCell class="text-right align-top">
								<div class="flex items-center justify-end gap-1 mt-1">
									<button @click="saveEdit" class="p-1 text-green-400 hover:bg-gray-600 rounded" title="Save">
										<Check class="h-4 w-4" />
									</button>
									<button @click="cancelEdit" class="p-1 text-red-400 hover:bg-gray-600 rounded" title="Cancel">
										<X class="h-4 w-4" />
									</button>
								</div>
							</TableCell>
						</TableRow>

						<!-- Display Rows -->
						<TableRow
							v-for="rule in filteredRules"
							:key="`${rule.address}-${rule.group}`"
							class="border-gray-700 hover:bg-gray-700/50"
							:class="{ 'hidden': editingRule && !editingRule.isNew && editingRule.originalAddress === rule.address && editingRule.originalGroup === rule.group }"
						>
							<TableCell class="font-mono text-indigo-300">{{ formatAddress(rule.address) }}</TableCell>
							<TableCell class="text-gray-200">{{ rule.type }}</TableCell>
							<TableCell class="text-gray-400">{{ rule.length }}</TableCell>
							<TableCell class="text-gray-200">{{ rule.group }}</TableCell>
							<TableCell class="text-right">
								<div class="flex items-center justify-end gap-1">
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

						<TableRow v-if="filteredRules.length === 0 && !editingRule">
							<TableCell colspan="5" class="text-center text-gray-500 py-8">No formatting rules found.</TableCell>
						</TableRow>
					</TableBody>
				</Table>
			</div>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ArrowDown, ArrowUp, Check, Pencil, PlusCircle, Trash2, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type DataBlock, useFormatting } from "@/composables/useFormatting";
import { formatAddress } from "@/lib/hex.utils";

defineProps<{
	isOpen: boolean;
}>();

const emit = defineEmits<(e: "update:isOpen", value: boolean) => void>();

const { formattingRules, removeFormat, addFormat } = useFormatting();

const searchTerm = ref("");
const selectedGroup = ref("");

type SortKey = 'address' | 'group';
const sortKey = ref<SortKey>('address');
const sortDirection = ref<'asc' | 'desc'>('asc');

const editingRule = ref<(DataBlock & { isNew?: boolean; originalAddress?: number; originalGroup?: string }) | null>(null);

const validationErrors = ref({
	address: "",
	length: "",
});

const beginAddRule = () => {
	editingRule.value = {
		address: "" as any, // Temporary allow string for input
		type: "byte",
		length: 1,
		group: "user",
		isNew: true,
	};
};

const beginEdit = (rule: DataBlock) => {
	editingRule.value = {
		...JSON.parse(JSON.stringify(rule)), // Deep copy
		isNew: false,
		originalAddress: rule.address,
		originalGroup: rule.group,
	};
};

const cancelEdit = () => {
	editingRule.value = null;
	validationErrors.value = { address: "", length: "" };
};
const handleSort = (key: SortKey) => {
	if (sortKey.value === key) {
		sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
	} else {
		sortKey.value = key;
		sortDirection.value = 'asc';
	}
};

const allRules = computed(() => {
	const rules: DataBlock[] = [];
	for (const map of formattingRules.value.values()) {
		for (const block of map.values()) {
			rules.push(block);
		}
	}
	return rules;
});

const uniqueGroups = computed(() => {
	const groups = new Set<string>();
	allRules.value.forEach((r) => { groups.add(r.group || "user"); });
	return Array.from(groups).sort();
});

const filteredRules = computed(() => {
	let rules = allRules.value;

	if (selectedGroup.value) {
		rules = rules.filter((r) => (r.group || "user") === selectedGroup.value);
	}

	if (searchTerm.value) {
		const lowerQuery = searchTerm.value.toLowerCase();
		rules = rules.filter((r) => formatAddress(r.address).toLowerCase().includes(lowerQuery));
	}

	return rules.sort((a, b) => {
		const valA = sortKey.value === 'address' ? a.address : (a.group || '');
		const valB = sortKey.value === 'address' ? b.address : (b.group || '');
		const modifier = sortDirection.value === 'asc' ? 1 : -1;
		return valA > valB ? modifier : valA < valB ? -modifier : 0;
	});
});

const handleDelete = (rule: DataBlock) => {
	if (confirm(`Remove formatting at ${formatAddress(rule.address)}?`)) {
		removeFormat(rule.address, rule.group);
	}
};

const saveEdit = () => {
	if (!editingRule.value) return;

	validationErrors.value = { address: "", length: "" };
	let hasErrors = false;

	const rule = editingRule.value;
	const addressHex = String(rule.address).replace('$', '');
	const address = parseInt(addressHex, 16);

	if (Number.isNaN(address) || address < 0 || address > 0xffffff) {
		validationErrors.value.address = "Invalid hex address (e.g., C000).";
		hasErrors = true;
	}

	const length = Number(rule.length);
	if (!Number.isInteger(length) || length <= 0) {
		validationErrors.value.length = "Must be a positive integer.";
		hasErrors = true;
	}

	if (hasErrors) return;

	const group = rule.group?.trim() || "user";

	// If it's an edit and the primary key (address/group) has changed, we need to remove the old one.
	if (
		!rule.isNew &&
		rule.originalAddress !== undefined &&
		rule.originalGroup !== undefined &&
		(rule.originalAddress !== address || rule.originalGroup !== group)
	) {
		removeFormat(rule.originalAddress, rule.originalGroup);
	}

	addFormat(address, rule.type, length, group);

	editingRule.value = null;
};

</script>
