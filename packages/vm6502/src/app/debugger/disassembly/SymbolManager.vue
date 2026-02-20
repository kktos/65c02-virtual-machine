<template>
	<Dialog :open="isOpen" @update:open="(val) => emit('update:isOpen', val)">
		<DialogContent class="sm:max-w-3xl bg-gray-800 border-gray-700 text-gray-200">
			<DialogHeader>
				<DialogTitle class="text-gray-100"><Tags class="h-8 w-8 inline-block mr-2 align-middle" />Symbol Manager</DialogTitle>
				<DialogDescription class="text-gray-400">
					Browse, search, and manage symbols across all namespaces. Click a symbol to navigate.
				</DialogDescription>
			</DialogHeader>

			<div class="flex justify-between items-center my-4 gap-4">
				<Input
					v-model="searchTerm"
					placeholder="Search by label or address..."
					class="flex-1 bg-gray-700 border-gray-600 text-gray-200 placeholder:text-gray-400"
				/>
				<select
					v-model="selectedNamespace"
					class="h-10 w-[200px] rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800"
				>
					<option value="">All Namespaces</option>
					<option v-for="ns in uniqueNamespaces" :key="ns" :value="ns">
						{{ ns }}
					</option>
				</select>
				<Button @click="beginAddSymbol" class="h-10 bg-blue-600 hover:bg-blue-500 text-white shrink-0">
					<PlusCircle class="h-4 w-4 mr-2" />
					Add Symbol
				</Button>
			</div>

			<div ref="tableContainerRef" class="overflow-y-auto max-h-[60vh] border border-gray-700 rounded-md">
				<Table>
					<TableHeader class="sticky top-0 bg-gray-800">
						<TableRow class="border-gray-700 hover:bg-gray-700/50">
							<TableHead @click="handleSort('namespace')" class="cursor-pointer hover:bg-gray-700/50">
								<div class="flex items-center gap-2 text-gray-300">
									Namespace
									<ArrowUp v-if="sortKey === 'namespace' && sortDirection === 'asc'" class="h-4 w-4" />
									<ArrowDown v-if="sortKey === 'namespace' && sortDirection === 'desc'" class="h-4 w-4" />
								</div>
							</TableHead>
							<TableHead @click="handleSort('label')" class="cursor-pointer hover:bg-gray-700/50">
								<div class="flex items-center gap-2 text-gray-300">
									Label
									<ArrowUp v-if="sortKey === 'label' && sortDirection === 'asc'" class="h-4 w-4" />
									<ArrowDown v-if="sortKey === 'label' && sortDirection === 'desc'" class="h-4 w-4" />
								</div>
							</TableHead>
							<TableHead @click="handleSort('address')" class="cursor-pointer hover:bg-gray-700/50">
								<div class="flex items-center gap-2 text-gray-300">
									Address
									<ArrowUp v-if="sortKey === 'address' && sortDirection === 'asc'" class="h-4 w-4" />
									<ArrowDown v-if="sortKey === 'address' && sortDirection === 'desc'" class="h-4 w-4" />
								</div>
							</TableHead>
							<TableHead @click="handleSort('scope')" class="cursor-pointer hover:bg-gray-700/50">
								<div class="flex items-center gap-2 text-gray-300">
									Scope
									<ArrowUp v-if="sortKey === 'scope' && sortDirection === 'asc'" class="h-4 w-4" />
									<ArrowDown v-if="sortKey === 'scope' && sortDirection === 'desc'" class="h-4 w-4" />
								</div>
							</TableHead>
							<TableHead class="w-[100px] text-gray-300">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						<!-- New Symbol Row (Add Mode) -->
						<TableRow v-if="editingSymbol && editingSymbol.isNew" class="bg-gray-700/50 hover:bg-gray-700/50">
							<TableCell class="align-top">
								<Input v-model="editingSymbol.namespace" placeholder="user" class="h-8 bg-gray-900 border-gray-600" />
							</TableCell>
							<TableCell class="align-top">
								<div>
									<Input
										v-model="editingSymbol.label"
										placeholder="LABEL_NAME"
										class="h-8 bg-gray-900 border-gray-600"
										:class="{ 'border-red-500': validationErrors.label }"
									/>
									<p class="text-red-400 text-xs mt-1 h-4" :class="{ invisible: !validationErrors.label }">
										{{ validationErrors.label || "Error" }}
									</p>
								</div>
							</TableCell>
							<TableCell class="align-top">
								<div>
									<Input
										v-model="editingSymbol.address"
										placeholder="$C000"
										class="h-8 bg-gray-900 border-gray-600 font-mono w-20"
										:class="{ 'border-red-500': validationErrors.address }"
									/>
									<p class="text-red-400 text-xs mt-1 h-4" :class="{ invisible: !validationErrors.address }">
										{{ validationErrors.address || "Error" }}
									</p>
								</div>
							</TableCell>
							<TableCell class="align-top">
								<select
									v-model="editingSymbol.scope"
									class="h-8 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-200 focus:outline-none"
								>
									<option v-for="scope in availableScopes" :key="scope" :value="scope">
										{{ scope }}
									</option>
								</select>
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

						<!-- Symbol Rows -->
						<template v-for="symbol in filteredSymbols" :key="`${symbol.address}-${symbol.namespace}`">
							<!-- Inline Edit Row -->
							<TableRow
								v-if="
									editingSymbol &&
									!editingSymbol.isNew &&
									editingSymbol.originalAddress === symbol.address &&
									editingSymbol.originalNamespace === symbol.namespace
								"
								class="bg-gray-700/50 hover:bg-gray-700/50"
							>
								<TableCell class="align-top px-0 w-[130px]">
									<Input v-model="editingSymbol.namespace" placeholder="user" class="h-8 bg-gray-900 border-gray-600" />
								</TableCell>
								<TableCell class="align-top px-0">
									<!-- <div> -->
									<Input
										v-model="editingSymbol.label"
										placeholder="LABEL_NAME"
										class="h-8 bg-gray-900 border-gray-600 w-[258px]"
										:class="{ 'border-red-500': validationErrors.label }"
									/>
									<p class="text-red-400 text-xs mt-1 h-4 pl-2" :class="{ invisible: !validationErrors.label }">
										{{ validationErrors.label || "Error" }}
									</p>
									<!-- </div> -->
								</TableCell>
								<TableCell class="align-top px-0 w-[131px]">
									<div>
										<Input
											v-model="editingSymbol.address"
											placeholder="$C000"
											class="h-8 bg-gray-900 border-gray-600 font-mono"
											:class="{ 'border-red-500': validationErrors.address }"
										/>
										<p class="text-red-400 text-xs mt-1 h-4" :class="{ invisible: !validationErrors.address }">
											{{ validationErrors.address || "Error" }}
										</p>
									</div>
								</TableCell>
								<TableCell class="align-top px-0 w-[78px]">
									<select
										v-model="editingSymbol.scope"
										class="h-8 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-200 focus:outline-none"
									>
										<option v-for="scope in availableScopes" :key="scope" :value="scope">
											{{ scope }}
										</option>
									</select>
								</TableCell>
								<TableCell class="align-top px-0">
									<div class="flex items-center justify-end gap-1 mt-1 mr-2">
										<button @click="saveEdit" class="p-1 text-green-400 hover:bg-gray-600 rounded" title="Save">
											<Check class="h-4 w-4" />
										</button>
										<button @click="cancelEdit" class="p-1 text-red-400 hover:bg-gray-600 rounded" title="Cancel">
											<X class="h-4 w-4" />
										</button>
									</div>
								</TableCell>
							</TableRow>

							<!-- Display Row -->
							<TableRow v-else @click="gotoSymbol(symbol)" class="cursor-pointer border-gray-700 hover:bg-gray-700">
								<TableCell class="truncate" :title="symbol.namespace">{{ symbol.namespace }}</TableCell>
								<TableCell class="font-semibold text-yellow-400">
									<div class="flex items-center gap-2">
										<span>{{ symbol.label }}</span>
										<div v-if="symbol.source" :title="symbol.source">
											<FileText class="h-3 w-3 text-gray-500 hover:text-gray-300" />
										</div>
									</div>
								</TableCell>
								<TableCell class="font-mono text-indigo-300">{{ formatAddress(symbol.address) }}</TableCell>
								<TableCell>{{ symbol.scope }}</TableCell>
								<TableCell>
									<div class="flex items-center justify-end gap-1" @click.stop>
										<button
											@click="toggleSymbolBreakpoint(symbol)"
											class="p-1 hover:bg-gray-600 rounded"
											:title="isBreakpointActive(symbol.address) ? 'Remove Breakpoint' : 'Add Breakpoint'"
										>
											<OctagonPause
												class="h-4 w-4"
												:class="isBreakpointActive(symbol.address) ? 'fill-red-500 text-red-500' : 'text-gray-400'"
											/>
										</button>
										<button @click="beginEdit(symbol)" class="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-600 rounded" title="Edit">
											<Pencil class="h-4 w-4" />
										</button>
										<button
											@click="handleDelete(symbol)"
											class="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded"
											title="Delete"
										>
											<Trash2 class="h-4 w-4" />
										</button>
									</div>
								</TableCell>
							</TableRow>
						</template>

						<TableRow v-if="filteredSymbols.length === 0 && !editingSymbol">
							<TableCell colspan="5" class="text-center text-gray-500 py-8"> No symbols found. </TableCell>
						</TableRow>
					</TableBody>
				</Table>
			</div>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ArrowDown, ArrowUp, Check, FileText, OctagonPause, Pencil, PlusCircle, Tags, Trash2, X } from "lucide-vue-next";
import { computed, inject, type Ref, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useSymbols } from "@/composables/useSymbols";
import { formatAddress, toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const props = defineProps<{
	isOpen: boolean;
}>();

const emit = defineEmits<{
	(e: "update:isOpen", value: boolean): void;
	(e: "gotoAddress", address: number): void;
}>();

const vm = inject<Ref<VirtualMachine>>("vm");
const { addSymbol, removeSymbol, updateSymbol, getSymbolForNSLabel, symbolDict } = useSymbols();
const { pcBreakpoints, toggleBreakpoint } = useBreakpoints();

const searchTerm = ref("");
const selectedNamespace = ref("");

const availableScopes = computed(() => {
	return vm?.value?.getScopes() ?? ["main"];
});

type SortKey = "label" | "address" | "namespace" | "scope";
const sortKey = ref<SortKey>("address");
const sortDirection = ref<"asc" | "desc">("asc");

type EditableSymbol = {
	label: string;
	address: string | number; // string during input
	namespace: string;
	scope: string;
	source?: string;
	isNew?: boolean;
	originalAddress?: number;
	originalNamespace?: string;
};
const editingSymbol = ref<EditableSymbol | null>(null);
const tableContainerRef = ref<HTMLElement | null>(null);

const validationErrors = ref({
	address: "",
	label: "",
});

const handleSort = (key: SortKey) => {
	if (sortKey.value === key) {
		sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
	} else {
		sortKey.value = key;
		sortDirection.value = "asc";
	}
};

const allSymbols = computed(() => {
	const symbols = symbolDict.value;
	if (!symbols) return [];

	const flatList: {
		label: string;
		address: number;
		namespace: string;
		scope: string;
		source?: string;
	}[] = [];
	for (const addrStr in symbols) {
		const address = parseInt(addrStr, 10);
		const namespaces = symbols[address];
		if (namespaces) {
			for (const ns in namespaces) {
				const symbolData = namespaces[ns];
				if (symbolData) {
					flatList.push({
						label: symbolData.label,
						address,
						namespace: ns,
						scope: symbolData.scope ?? "main",
						source: symbolData.source,
					});
				}
			}
		}
	}
	return flatList;
});

const uniqueNamespaces = computed(() => {
	const namespaces = new Set<string>();
	allSymbols.value.forEach((s) => {
		namespaces.add(s.namespace);
	});
	return Array.from(namespaces).sort();
});

const filteredSymbols = computed(() => {
	let symbols = allSymbols.value;

	if (selectedNamespace.value) {
		symbols = symbols.filter((s) => s.namespace === selectedNamespace.value);
	}

	if (searchTerm.value) {
		const lowerQuery = searchTerm.value.toLowerCase();
		const addressQuery = parseInt(searchTerm.value, 16);
		symbols = symbols.filter((s) => s.address === addressQuery || s.label.toLowerCase().includes(lowerQuery));
	}

	// Sorting - create a mutable copy
	const sortedSymbols = [...symbols];
	const key = sortKey.value;
	if (key) {
		sortedSymbols.sort((a, b) => {
			const valA = a[key];
			const valB = b[key];

			let comparison = 0;
			if (valA > valB) comparison = 1;
			else if (valA < valB) comparison = -1;

			return sortDirection.value === "asc" ? comparison : -comparison;
		});
	}
	return sortedSymbols;
});

const gotoSymbol = (symbol: { address: number }) => {
	if (editingSymbol.value) return; // Prevent navigation while editing
	emit("gotoAddress", symbol.address);
	emit("update:isOpen", false);
};

const beginAddSymbol = () => {
	editingSymbol.value = {
		label: "",
		address: "", // Start with empty string for input
		namespace: "user",
		scope: "main",
		isNew: true,
	};
	if (tableContainerRef.value) tableContainerRef.value.scrollTop = 0;
};

const beginEdit = (symbol: { label: string; address: number; namespace: string; scope: string }) => {
	editingSymbol.value = {
		...JSON.parse(JSON.stringify(symbol)), // deep copy
		address: toHex(symbol.address, 6), // show hex string in input
		isNew: false,
		originalAddress: symbol.address,
		originalNamespace: symbol.namespace,
	};
};

const saveEdit = () => {
	if (!editingSymbol.value) return;

	validationErrors.value = { address: "", label: "" };
	let hasErrors = false;

	const symbol = editingSymbol.value;
	const addressHex = String(symbol.address).replace("$", "");
	const address = parseInt(addressHex, 16);
	const namespace = symbol.namespace?.trim() || "user";

	if (Number.isNaN(address) || address < 0 || address > 0xffffff) {
		validationErrors.value.address = "Invalid hex address (e.g., C000).";
		hasErrors = true;
	}

	const label = symbol.label.trim();
	if (!label) {
		validationErrors.value.label = "Label cannot be empty.";
		hasErrors = true;
	}

	const existingSymbol = getSymbolForNSLabel(namespace, label);
	if (symbol.originalNamespace !== namespace && existingSymbol) {
		validationErrors.value.label = "Duplicate label.";
		hasErrors = true;
	}

	if (hasErrors) return;

	const scope = symbol.scope?.trim() || "main";

	if (symbol.isNew) {
		addSymbol(address, label, namespace, scope);
	} else {
		// biome-ignore lint/style/noNonNullAssertion: <update so value are set>
		updateSymbol(symbol.originalAddress!, symbol.originalNamespace!, {
			scope,
			namespace,
			address,
			label,
		});
	}

	/*
	// If it's an edit and the primary key (address/namespace) has changed, remove the old one.
	if (!symbol.isNew && symbol.originalAddress !== undefined && symbol.originalNamespace !== undefined && (symbol.originalAddress !== address || symbol.originalNamespace !== namespace)) {
		removeSymbol(symbol.originalAddress, symbol.originalNamespace);
	}

	addSymbol(address, label, namespace, scope);
	*/

	editingSymbol.value = null;
};

const cancelEdit = () => {
	editingSymbol.value = null;
	validationErrors.value = { address: "", label: "" };
};

const handleDelete = (symbol: { label: string; address: number; namespace: string }) => {
	if (confirm(`Are you sure you want to delete symbol "${symbol.label}"?`)) {
		removeSymbol(symbol.address, symbol.namespace);
	}
};

const toggleSymbolBreakpoint = (symbol: { address: number }) => {
	toggleBreakpoint({ type: "pc", address: symbol.address }, vm?.value);
};

const isBreakpointActive = (address: number) => {
	return pcBreakpoints.value.has(address) && pcBreakpoints.value.get(address);
};
</script>
