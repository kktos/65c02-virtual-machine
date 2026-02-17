<template>
	<Dialog :open="isOpen" @update:open="(val) => emit('update:isOpen', val)">
		<DialogContent class="sm:max-w-3xl bg-gray-800 border-gray-700 text-gray-200">
			<DialogHeader>
				<DialogTitle class="text-gray-100">Symbol Manager</DialogTitle>
				<DialogDescription class="text-gray-400">
					Browse, search, and manage symbols across all namespaces. Click a symbol to navigate.
				</DialogDescription>
			</DialogHeader>

			<div class="flex gap-4 my-4">
				<Input
					v-model="searchTerm"
					placeholder="Search by label..."
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
			</div>

			<div class="overflow-y-auto max-h-[60vh] border border-gray-700 rounded-md">
				<Table>
					<TableHeader class="sticky top-0 bg-gray-800">
						<TableRow class="border-gray-700 hover:bg-gray-700/50">
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
							<TableHead @click="handleSort('namespace')" class="cursor-pointer hover:bg-gray-700/50">
								<div class="flex items-center gap-2 text-gray-300">
									Namespace
									<ArrowUp v-if="sortKey === 'namespace' && sortDirection === 'asc'" class="h-4 w-4" />
									<ArrowDown v-if="sortKey === 'namespace' && sortDirection === 'desc'" class="h-4 w-4" />
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
						<template v-if="filteredSymbols.length > 0">
							<TableRow
								v-for="symbol in filteredSymbols"
								:key="`${symbol.address}-${symbol.namespace}`"
								@click="gotoSymbol(symbol)"
								class="cursor-pointer border-gray-700 hover:bg-gray-700"
								:class="{ 'bg-gray-700/50': editingId === `${symbol.address}-${symbol.namespace}` }"
							>
								<TableCell class="font-semibold text-yellow-400">
									<div v-if="editingId === `${symbol.address}-${symbol.namespace}`" @click.stop>
										<Input
											v-model="editLabelModel"
											class="h-7 bg-gray-900 border-gray-600 text-yellow-400"
											@keydown.enter="saveEdit(symbol)"
											@keydown.esc="cancelEdit"
											autoFocus
										/>
									</div>
									<span v-else>{{ symbol.label }}</span>
								</TableCell>
								<TableCell class="font-mono text-indigo-300">{{ formatAddress(symbol.address) }}</TableCell>
								<TableCell class="truncate" :title="symbol.namespace">{{ symbol.namespace }}</TableCell>
								<TableCell>{{ symbol.scope }}</TableCell>
								<TableCell>
									<div class="flex items-center gap-1" @click.stop>
										<template v-if="editingId === `${symbol.address}-${symbol.namespace}`">
											<!-- Placeholder to keep alignment during edit -->
											<div class="w-6"></div>
											<button
												@click="saveEdit(symbol)"
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
										</template>
										<template v-else>
											<button
												@click="toggleSymbolBreakpoint(symbol)"
												class="p-1 hover:bg-gray-600 rounded"
												:title="isBreakpointActive(symbol.address) ? 'Remove Breakpoint' : 'Add Breakpoint'"
											>
												<OctagonPause class="h-4 w-4" :class="isBreakpointActive(symbol.address) ? 'fill-red-500 text-red-500' : 'text-gray-400'" />
											</button>
											<button @click="startEdit(symbol)" class="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-600 rounded" title="Edit">
												<Pencil class="h-4 w-4" />
											</button>
											<button @click="handleDelete(symbol)" class="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded" title="Delete">
												<Trash2 class="h-4 w-4" />
											</button>
										</template>
									</div>
								</TableCell>
							</TableRow>
						</template>
						<template v-else>
							<TableRow>
								<TableCell colspan="4" class="text-center text-gray-500 py-8"> No symbols found. </TableCell>
							</TableRow>
						</template>
					</TableBody>
				</Table>
			</div>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ArrowDown, ArrowUp, Check, OctagonPause, Pencil, Trash2, X } from "lucide-vue-next";
import { computed, inject, type Ref, ref } from "vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useSymbols } from "@/composables/useSymbols";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const props = defineProps<{
	isOpen: boolean;
}>();

const emit = defineEmits<{
	(e: "update:isOpen", value: boolean): void;
	(e: "gotoAddress", address: number): void;
}>();

const vm = inject<Ref<VirtualMachine>>("vm");
const { addSymbol, removeSymbol } = useSymbols();
const { pcBreakpoints, toggleBreakpoint } = useBreakpoints();

const searchTerm = ref("");
const selectedNamespace = ref("");
const editingId = ref<string | null>(null);
const editLabelModel = ref("");

type SortKey = 'label' | 'address' | 'namespace' | 'scope';
const sortKey = ref<SortKey>('address');
const sortDirection = ref<'asc' | 'desc'>('asc');

const handleSort = (key: SortKey) => {
	if (sortKey.value === key) {
		sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
	} else {
		sortKey.value = key;
		sortDirection.value = 'asc';
	}
};

const allSymbols = computed(() => {
	const symbols = vm?.value?.machineConfig?.symbols;
	if (!symbols) return [];

	const flatList: { label: string; address: number; namespace: string; scope: string }[] = [];
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
					});
				}
			}
		}
	}
	return flatList;
});

const uniqueNamespaces = computed(() => {
	const namespaces = new Set<string>();
	allSymbols.value.forEach((s) => { namespaces.add(s.namespace); });
	return Array.from(namespaces).sort();
});

const filteredSymbols = computed(() => {
	let symbols = allSymbols.value;

	if (selectedNamespace.value) {
		symbols = symbols.filter((s) => s.namespace === selectedNamespace.value);
	}

	if (searchTerm.value) {
		const lowerQuery = searchTerm.value.toLowerCase();
		symbols = symbols.filter((s) => s.label.toLowerCase().includes(lowerQuery));
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

			return sortDirection.value === 'asc' ? comparison : -comparison;
		});
	}
	return sortedSymbols;
});

const formatAddress = (addr: number) => {
	const bank = ((addr >> 16) & 0xff).toString(16).toUpperCase().padStart(2, "0");
	const offset = (addr & 0xffff).toString(16).toUpperCase().padStart(4, "0");
	return `$${bank}:${offset}`;
};

const gotoSymbol = (symbol: { address: number }) => {
	if (editingId.value) return; // Prevent navigation while editing
	emit("gotoAddress", symbol.address);
	emit("update:isOpen", false);
};

const startEdit = (symbol: { label: string; address: number; namespace: string }) => {
	editingId.value = `${symbol.address}-${symbol.namespace}`;
	editLabelModel.value = symbol.label;
};

const saveEdit = (symbol: { address: number; namespace: string; scope: string }) => {
	if (editLabelModel.value.trim()) {
		addSymbol(symbol.address, editLabelModel.value, symbol.namespace, symbol.scope);
	}
	editingId.value = null;
};

const cancelEdit = () => {
	editingId.value = null;
};

const handleDelete = (symbol: { label: string; address: number; namespace: string }) => {
	if (confirm(`Are you sure you want to delete symbol "${symbol.label}"?`)) {
		removeSymbol(symbol.address, symbol.namespace);
	}
};

const toggleSymbolBreakpoint = (symbol: { address: number }) => {
	toggleBreakpoint({ type: 'pc', address: symbol.address }, vm?.value);
};

const isBreakpointActive = (address: number) => {
	return pcBreakpoints.value.has(address) && pcBreakpoints.value.get(address);
};
</script>
