<template>
	<Dialog :open="isOpen" @update:open="(val) => emit('update:isOpen', val)">
		<DialogContent class="sm:max-w-4xl h-[80vh] flex flex-col bg-gray-800 border-gray-700 text-gray-200">
			<DialogHeader>
				<DialogTitle class="text-gray-100"
					><Binary class="h-8 w-8 inline-block mr-2 align-middle" />Formatting Rules</DialogTitle
				>
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
				<Button @click="beginAddRule" class="h-10 bg-blue-600 hover:bg-blue-500 text-white shrink-0">
					<PlusCircle class="h-4 w-4" />
				</Button>
			</div>

			<div ref="tableContainerRef" class="flex-1 overflow-y-auto border border-gray-700 rounded-md">
				<Table>
					<TableHeader class="sticky top-0 bg-gray-800">
						<TableRow class="border-gray-700 hover:bg-gray-700/50">
							<TableHead @click="handleSort('address')" class="cursor-pointer hover:bg-gray-700/50">
								<div class="flex items-center gap-2 text-gray-300">
									Address
									<ArrowUp v-if="sortKey === 'address' && sortDirection === 'asc'" class="h-4 w-4" />
									<ArrowDown
										v-if="sortKey === 'address' && sortDirection === 'desc'"
										class="h-4 w-4"
									/>
								</div>
							</TableHead>
							<TableHead class="text-gray-300">Type</TableHead>
							<TableHead class="text-gray-300">Length</TableHead>
							<TableHead class="text-gray-300">Preview</TableHead>
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
						<!-- New Rule Row (Add Mode) -->
						<TableRow v-if="editingRule && editingRule.isNew" class="bg-gray-700/50 hover:bg-gray-700/50">
							<TableCell class="align-top">
								<div>
									<Input
										v-model="editingRule.address"
										placeholder="$C000"
										class="h-8 bg-gray-900 border-gray-600 font-mono"
										:class="{ 'border-red-500': validationErrors.address }"
									/>
									<p
										class="text-red-400 text-xs mt-1 h-4"
										:class="{ invisible: !validationErrors.address }"
									>
										{{ validationErrors.address || "Error" }}
									</p>
								</div>
							</TableCell>
							<TableCell class="align-top">
								<select
									v-model="editingRule.type"
									class="h-8 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-200 focus:outline-none"
								>
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
									<p
										class="text-red-400 text-xs mt-1 h-4"
										:class="{ invisible: !validationErrors.length }"
									>
										{{ validationErrors.length || "Error" }}
									</p>
								</div>
							</TableCell>
							<TableCell class="align-top pt-3">
								<div class="font-mono text-xs text-gray-400 truncate max-w-[150px]">
									{{ editingRule.address ? getPreview(editingRule) : "" }}
								</div>
							</TableCell>
							<TableCell class="align-top">
								<Input
									v-model="editingRule.group"
									placeholder="user"
									class="h-8 bg-gray-900 border-gray-600"
								/>
							</TableCell>
							<TableCell class="text-right align-top">
								<div class="flex items-center justify-end gap-1 mt-1">
									<button
										@click="saveEdit"
										class="p-1 text-green-400 hover:bg-gray-600 rounded"
										title="Save"
									>
										<Check class="h-4 w-4" />
									</button>
									<button
										@click="cancelEdit"
										class="p-1 text-red-400 hover:bg-gray-600 rounded"
										title="Cancel"
									>
										<X class="h-4 w-4" />
									</button>
								</div>
							</TableCell>
						</TableRow>

						<!-- Rules Rows -->
						<template v-for="rule in filteredRules" :key="`${rule.address}-${rule.group}`">
							<!-- Inline Edit Row -->
							<TableRow
								v-if="
									editingRule &&
									!editingRule.isNew &&
									editingRule.originalAddress === rule.address &&
									editingRule.originalGroup === rule.group
								"
								class="bg-gray-700/50 hover:bg-gray-700/50"
							>
								<TableCell class="align-top">
									<div>
										<Input
											v-model="editingRule.address"
											placeholder="$C000"
											class="h-8 bg-gray-900 border-gray-600 font-mono"
											:class="{ 'border-red-500': validationErrors.address }"
										/>
										<p
											class="text-red-400 text-xs mt-1 h-4"
											:class="{ invisible: !validationErrors.address }"
										>
											{{ validationErrors.address || "Error" }}
										</p>
									</div>
								</TableCell>
								<TableCell class="align-top">
									<select
										v-model="editingRule.type"
										class="h-8 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-200 focus:outline-none"
									>
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
										<p
											class="text-red-400 text-xs mt-1 h-4"
											:class="{ invisible: !validationErrors.length }"
										>
											{{ validationErrors.length || "Error" }}
										</p>
									</div>
								</TableCell>
								<TableCell class="align-top pt-3">
									<div class="font-mono text-xs text-gray-400 truncate max-w-[150px]">
										{{ getPreview(editingRule) }}
									</div>
								</TableCell>
								<TableCell class="align-top">
									<Input
										v-model="editingRule.group"
										placeholder="user"
										class="h-8 bg-gray-900 border-gray-600"
									/>
								</TableCell>
								<TableCell class="text-right align-top">
									<div class="flex items-center justify-end gap-1 mt-1">
										<button
											@click="saveEdit"
											class="p-1 text-green-400 hover:bg-gray-600 rounded"
											title="Save"
										>
											<Check class="h-4 w-4" />
										</button>
										<button
											@click="cancelEdit"
											class="p-1 text-red-400 hover:bg-gray-600 rounded"
											title="Cancel"
										>
											<X class="h-4 w-4" />
										</button>
									</div>
								</TableCell>
							</TableRow>

							<!-- Display Row -->
							<TableRow
								v-else
								@click="gotoRule(rule)"
								class="cursor-pointer border-gray-700 hover:bg-gray-700"
							>
								<TableCell class="font-mono text-indigo-300">{{
									formatAddress(rule.address)
								}}</TableCell>
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
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ArrowDown, ArrowUp, Binary, Check, Pencil, PlusCircle, Trash2, X, Download, Upload } from "lucide-vue-next";
import { computed, inject, type Ref, ref } from "vue";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type DataBlock, useFormatting } from "@/composables/useDataFormattings";
import { formatAddress, toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useDiskStorage } from "@/composables/useDiskStorage";
import { useFileDownload } from "@/composables/useFileDownload";

defineProps<{
	isOpen: boolean;
}>();

const emit = defineEmits<{
	(e: "update:isOpen", value: boolean): void;
	(e: "gotoAddress", address: number): void;
}>();

const vm = inject<Ref<VirtualMachine>>("vm");
const {
	findFormattings,
	removeFormat,
	addFormatting,
	getFormattingGroups,
	generateTextFromFormattings,
	addFormattingsFromText,
	diskKey,
} = useFormatting();
const { downloadFile } = useFileDownload();

const searchTerm = ref("");
const selectedGroup = ref("");

type SortKey = "address" | "group";
const sortKey = ref<SortKey>("address");
const sortDirection = ref<"asc" | "desc">("asc");

const editingRule = ref<(DataBlock & { isNew?: boolean; originalAddress?: number; originalGroup?: string }) | null>(
	null,
);

const tableContainerRef = ref<HTMLElement | null>(null);
const validationErrors = ref({
	address: "",
	length: "",
});
const importFileInput = ref<HTMLInputElement | null>(null);

const beginAddRule = () => {
	editingRule.value = {
		address: "" as any, // Temporary allow string for input
		type: "byte",
		length: 1,
		group: "user",
		isNew: true,
	};
	if (tableContainerRef.value) tableContainerRef.value.scrollTop = 0;
};

const beginEdit = (rule: DataBlock) => {
	editingRule.value = {
		...JSON.parse(JSON.stringify(rule)), // Deep copy
		isNew: false,
		originalAddress: rule.address,
		originalGroup: rule.group,
	};
};

const getPreview = (rule: { address: number | string; length: number | string; type: string }) => {
	if (!vm?.value) return "";

	let addr = Number(rule.address);
	if (typeof rule.address === "string") {
		const clean = rule.address.replace("$", "");
		addr = parseInt(clean, 16);
	}
	if (Number.isNaN(addr)) return "";

	const len = Number(rule.length) || 1;
	const maxLen = Math.min(len, 25);
	let result = "";

	switch (rule.type) {
		case "byte": {
			const bytes: string[] = [];
			for (let i = 0; i < maxLen; i++) {
				const byte = vm.value.readDebug(addr + i) ?? 0;
				bytes.push(`$${toHex(byte, 2)}`);
			}
			result = bytes.join(" ");
			break;
		}
		case "word": {
			const bytes: string[] = [];
			for (let i = 0; i < maxLen; i++) {
				const byte1 = vm.value.readDebug(addr + i++) ?? 0;
				const byte2 = vm.value.readDebug(addr + i) ?? 0;
				bytes.push(`$${toHex((byte2 << 8) | byte1, 4)}`);
			}
			result = bytes.join(" ");
			break;
		}
		case "string": {
			let str = "";
			for (let i = 0; i < maxLen; i++) {
				const byte = vm.value.readDebug(addr + i) ?? 0;
				str += byte >= 32 ? String.fromCharCode(byte & 0x7f) : ".";
			}
			result = `"${str}"`;
			break;
		}
	}

	if (len > maxLen) result += "...";
	return result;
};

const gotoRule = (rule: { address: number }) => {
	if (editingRule.value) return;
	emit("gotoAddress", rule.address);
	emit("update:isOpen", false);
};

const cancelEdit = () => {
	editingRule.value = null;
	validationErrors.value = { address: "", length: "" };
};
const handleSort = (key: SortKey) => {
	if (sortKey.value === key) {
		sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
	} else {
		sortKey.value = key;
		sortDirection.value = "asc";
	}
};

const uniqueGroups = computed(() => {
	const list = getFormattingGroups();
	const groups = list.map((ns) => ns[0]);
	return groups.sort();
});

const filteredRules = computed(() => {
	const rules = findFormattings(searchTerm.value, selectedGroup.value);
	return rules.sort((a, b) => {
		const valA = sortKey.value === "address" ? a.address : a.group || "";
		const valB = sortKey.value === "address" ? b.address : b.group || "";
		const modifier = sortDirection.value === "asc" ? 1 : -1;
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
	const addressHex = String(rule.address).replace("$", "");
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

	addFormatting(address, rule.type, length, group);

	editingRule.value = null;
};

const triggerImport = () => {
	importFileInput.value?.click();
};

const handleImportFile = async (event: Event) => {
	const input = event.target as HTMLInputElement;
	if (!input.files || input.files.length === 0) return;
	const file = input.files[0] as File;
	const text = await file.text();
	await addFormattingsFromText(text);
	input.value = "";
};

const handleExport = async () => {
	const { loadDisk } = useDiskStorage();
	const disk = await loadDisk(diskKey.value);
	if (!disk) return;
	const name = disk.name.split(".").slice(0, -1).join(".") || disk.name;

	const content = await generateTextFromFormattings();
	downloadFile(`${name}.fmt`, "text/plain;charset=utf-8", content);
};
</script>
