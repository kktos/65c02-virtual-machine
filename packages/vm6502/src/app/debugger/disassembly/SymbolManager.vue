<template>
	<Dialog :open="isOpen" @update:open="(val) => emit('update:isOpen', val)">
		<DialogContent class="sm:max-w-3xl h-[80vh] flex flex-col bg-gray-800 border-gray-700 text-gray-200">
			<DialogHeader>
				<DialogTitle class="text-gray-100"
					><Tags class="h-8 w-8 inline-block mr-2 align-middle" />Symbol Manager</DialogTitle
				>
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

			<div ref="tableContainerRef" class="flex-1 overflow-y-auto border border-gray-700 rounded-md">
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
							<TableHead @click="handleSort('ns')" class="cursor-pointer hover:bg-gray-700/50">
								<div class="flex items-center gap-2 text-gray-300">
									Namespace
									<ArrowUp v-if="sortKey === 'ns' && sortDirection === 'asc'" class="h-4 w-4" />
									<ArrowDown v-if="sortKey === 'ns' && sortDirection === 'desc'" class="h-4 w-4" />
								</div>
							</TableHead>
							<TableHead @click="handleSort('label')" class="cursor-pointer hover:bg-gray-700/50">
								<div class="flex items-center gap-2 text-gray-300">
									Label
									<ArrowUp v-if="sortKey === 'label' && sortDirection === 'asc'" class="h-4 w-4" />
									<ArrowDown v-if="sortKey === 'label' && sortDirection === 'desc'" class="h-4 w-4" />
								</div>
							</TableHead>
							<TableHead @click="handleSort('addr')" class="cursor-pointer hover:bg-gray-700/50">
								<div class="flex items-center gap-2 text-gray-300">
									Address
									<ArrowUp v-if="sortKey === 'addr' && sortDirection === 'asc'" class="h-4 w-4" />
									<ArrowDown v-if="sortKey === 'addr' && sortDirection === 'desc'" class="h-4 w-4" />
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
						<TableRow
							v-if="editingSymbol && editingSymbol.isNew"
							class="bg-gray-700/50 hover:bg-gray-700/50"
						>
							<TableCell />
							<TableCell class="align-top">
								<Input
									v-model="editingSymbol.ns"
									placeholder="user"
									class="h-8 bg-gray-900 border-gray-600"
								/>
							</TableCell>
							<TableCell class="align-top">
								<div>
									<Input
										v-model="editingSymbol.label"
										placeholder="LABEL_NAME"
										class="h-8 bg-gray-900 border-gray-600"
										:class="{ 'border-red-500': validationErrors.label }"
									/>
									<p
										class="text-red-400 text-xs mt-1 h-4"
										:class="{ invisible: !validationErrors.label }"
									>
										{{ validationErrors.label || "Error" }}
									</p>
								</div>
							</TableCell>
							<TableCell class="align-top">
								<div>
									<Input
										v-model="editingSymbol.addr"
										placeholder="$C000"
										class="h-8 bg-gray-900 border-gray-600 font-mono w-20"
										:class="{ 'border-red-500': validationErrors.addr }"
									/>
									<p
										class="text-red-400 text-xs mt-1 h-4"
										:class="{ invisible: !validationErrors.addr }"
									>
										{{ validationErrors.addr || "Error" }}
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

						<!-- Symbol Rows -->
						<template v-for="symbol in paginatedSymbols" :key="`${symbol.addr}-${symbol.ns}`">
							<!-- Inline Edit Row -->
							<TableRow
								v-if="
									editingSymbol &&
									!editingSymbol.isNew &&
									editingSymbol.originalAddress === symbol.addr &&
									editingSymbol.originalNamespace === symbol.ns
								"
								class="bg-gray-700/50 hover:bg-gray-700/50"
							>
								<TableCell />
								<TableCell class="align-top px-0 w-[130px]">
									<Input
										v-model="editingSymbol.ns"
										placeholder="user"
										class="h-8 bg-gray-900 border-gray-600"
									/>
								</TableCell>
								<TableCell class="align-top px-0">
									<!-- <div> -->
									<Input
										v-model="editingSymbol.label"
										placeholder="LABEL_NAME"
										class="h-8 bg-gray-900 border-gray-600 w-[258px]"
										:class="{ 'border-red-500': validationErrors.label }"
									/>
									<p
										class="text-red-400 text-xs mt-1 h-4 pl-2"
										:class="{ invisible: !validationErrors.label }"
									>
										{{ validationErrors.label || "Error" }}
									</p>
									<!-- </div> -->
								</TableCell>
								<TableCell class="align-top px-0 w-[131px]">
									<div>
										<Input
											v-model="editingSymbol.addr"
											placeholder="$C000"
											class="h-8 bg-gray-900 border-gray-600 font-mono"
											:class="{ 'border-red-500': validationErrors.addr }"
										/>
										<p
											class="text-red-400 text-xs mt-1 h-4"
											:class="{ invisible: !validationErrors.addr }"
										>
											{{ validationErrors.addr || "Error" }}
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
								@click="gotoSymbol(symbol)"
								class="cursor-pointer border-gray-700 hover:bg-gray-700/80"
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
							<TableCell colspan="6" class="text-center text-gray-500 py-8">
								No symbols found.
							</TableCell>
						</TableRow>
					</TableBody>
				</Table>
			</div>

			<div class="flex items-center justify-between mt-3 text-sm text-gray-400">
				<select
					v-model="itemsPerPage"
					class="h-8 rounded-md border border-gray-600 bg-gray-700 px-2 text-sm text-gray-200 focus:outline-none"
				>
					<option :value="25">25 per page</option>
					<option :value="50">50 per page</option>
					<option :value="100">100 per page</option>
					<option :value="200">200 per page</option>
				</select>
				<div>
					<span v-if="selectedSymbols.size > 0" class="mr-4">Selected: {{ selectedSymbols.size }}</span>
					<span>Total: {{ filteredSymbols?.length ?? 0 }}</span>
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
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import {
	ArrowDown,
	ArrowUp,
	ChevronLeft,
	ChevronRight,
	Check,
	Download,
	FileText,
	OctagonPause,
	Pencil,
	PlusCircle,
	Tags,
	Trash2,
	Upload,
	X,
} from "lucide-vue-next";
import { computed, inject, type Ref, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useSymbols, type SymbolEntry } from "@/composables/useSymbols";
import { formatAddress, toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useFileDownload } from "@/composables/useFileDownload";
import { useDiskStorage } from "@/composables/useDiskStorage";

const props = defineProps<{
	isOpen: boolean;
}>();

const emit = defineEmits<{
	(e: "update:isOpen", value: boolean): void;
	(e: "gotoAddress", address: number): void;
}>();

const vm = inject<Ref<VirtualMachine>>("vm");
const {
	addSymbol,
	removeSymbol,
	updateSymbol,
	findSymbols,
	getNamespaceList,
	addSymbolsFromText,
	generateTextFromSymbols,
	diskKey,
} = useSymbols();
const { pcBreakpoints, toggleBreakpoint } = useBreakpoints();
const { downloadFile } = useFileDownload();

const searchTerm = ref("");
const selectedNamespace = ref("");
const selectedSymbols = ref(new Set<number>());
const currentPage = ref(1);
const itemsPerPage = ref(50);

watch([searchTerm, selectedNamespace], () => {
	selectedSymbols.value.clear();
	currentPage.value = 1;
});

watch(itemsPerPage, () => {
	currentPage.value = 1;
});

const availableScopes = computed(() => {
	return vm?.value?.getScopes() ?? ["main"];
});

type SortKey = keyof SymbolEntry;
const sortKey = ref<SortKey>("addr");
const sortDirection = ref<"asc" | "desc">("asc");

type EditableSymbol = {
	id: number;
	label: string;
	addr: string | number; // string during input
	ns: string;
	scope: string;
	src?: string;
	isNew?: boolean;
	originalAddress?: number;
	originalNamespace?: string;
};
const editingSymbol = ref<EditableSymbol | null>(null);
const tableContainerRef = ref<HTMLElement | null>(null);
const importFileInput = ref<HTMLInputElement | null>(null);

const validationErrors = ref({
	addr: "",
	label: "",
});

const handleSort = (key: SortKey) => {
	if (sortKey.value === key) {
		sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
	} else {
		sortKey.value = key;
		sortDirection.value = "asc";
	}
	currentPage.value = 1;
};

const uniqueNamespaces = computed(() => {
	const nsList = getNamespaceList();
	const names = nsList.map((ns) => ns[0]);
	return names.sort();
});

const isAllSelected = computed(() => {
	if (!filteredSymbols.value || filteredSymbols.value.length === 0) return false;
	return filteredSymbols.value.every((s) => selectedSymbols.value.has(s.id!));
});

const filteredSymbols = computed(() => {
	const symbols = findSymbols(searchTerm.value, selectedNamespace.value);
	const key = sortKey.value;
	if (key) {
		symbols.sort((a, b) => {
			const valA = a[key] as string | number;
			const valB = b[key] as string | number;
			const comparison = valA > valB ? 1 : valA < valB ? -1 : 0;
			return sortDirection.value === "asc" ? comparison : -comparison;
		});
	}

	return symbols;
});

const totalPages = computed(() => {
	return Math.ceil((filteredSymbols.value?.length || 0) / itemsPerPage.value);
});

const paginatedSymbols = computed(() => {
	const start = (currentPage.value - 1) * itemsPerPage.value;
	const end = start + itemsPerPage.value;
	return filteredSymbols.value?.slice(start, end) || [];
});

watch(totalPages, (newTotal) => {
	if (currentPage.value > newTotal) {
		currentPage.value = Math.max(1, newTotal);
	}
});

const gotoSymbol = (symbol: { addr: number }) => {
	if (editingSymbol.value) return; // Prevent navigation while editing
	emit("gotoAddress", symbol.addr);
	emit("update:isOpen", false);
};

const beginAddSymbol = () => {
	editingSymbol.value = {
		label: "",
		addr: "", // Start with empty string for input
		ns: "user",
		scope: "main",
		isNew: true,
		id: 0,
	};
	if (tableContainerRef.value) tableContainerRef.value.scrollTop = 0;
};

const beginEdit = (symbol: SymbolEntry) => {
	editingSymbol.value = {
		...JSON.parse(JSON.stringify(symbol)), // deep copy
		addr: toHex(symbol.addr, 6), // show hex string in input
		isNew: false,
		originalAddress: symbol.addr,
		originalNamespace: symbol.ns,
	};
};

const saveEdit = async () => {
	if (!editingSymbol.value) return;

	validationErrors.value = { addr: "", label: "" };
	let hasErrors = false;

	const symbol = editingSymbol.value;
	const addressHex = String(symbol.addr).replace("$", "");
	const address = parseInt(addressHex, 16);
	const namespace = symbol.ns?.trim() || "user";

	if (Number.isNaN(address) || address < 0 || address > 0xffffff) {
		validationErrors.value.addr = "Invalid hex address (e.g., C000).";
		hasErrors = true;
	}

	const label = symbol.label.trim();
	if (!label) {
		validationErrors.value.label = "Label cannot be empty.";
		hasErrors = true;
	}

	if (hasErrors) return;

	const scope = symbol.scope?.trim() || "main";

	if (symbol.isNew) {
		try {
			await addSymbol(address, label, namespace, scope);
		} catch (e) {
			validationErrors.value.label = "Duplicate label.";
			hasErrors = true;
		}
	} else {
		await updateSymbol(editingSymbol.value.id, address, label, namespace, scope);
	}

	if (hasErrors) return;

	editingSymbol.value = null;
};

const cancelEdit = () => {
	editingSymbol.value = null;
	validationErrors.value = { addr: "", label: "" };
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

const handleBulkDelete = () => {
	const count = selectedSymbols.value.size;
	if (count === 0) return;
	if (confirm(`Are you sure you want to delete ${count} selected symbol(s)?`)) {
		for (const id of selectedSymbols.value) {
			removeSymbol(id);
		}
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
</script>
