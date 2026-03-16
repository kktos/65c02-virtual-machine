<template>
	<FloatingWindow
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
		@open="onOpen"
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
					ref="searchInput"
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
					:disabled="!selectedCount"
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

			<SymbolTable
				ref="symbolTableRef"
				class="flex-1 min-h-0"
				:search-term="searchTerm"
				:selected-namespace="selectedNamespace"
				:should-display-disk="shouldDisplayDisk"
				:items-per-page="itemsPerPage"
				@goto-address="gotoSymbol"
			/>
		</div>
	</FloatingWindow>
</template>

<script setup lang="ts">
import { Download, PlusCircle, Tags, Trash2, Upload } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import FloatingWindow from "@/components/FloatingWindow.vue";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { useSymbols } from "@/composables/useSymbols";
import { useFileDownload } from "@/composables/useFileDownload";
import { useDiskStorage } from "@/composables/useDiskStorage";
import { useKeyModifier } from "@vueuse/core";
import SymbolTable from "./SymbolTable.vue";

const emit = defineEmits<{
	(e: "gotoAddress", address: number): void;
}>();

const isCtrlPressed = useKeyModifier("Control");
const shouldDisplayDisk = ref(false);

const { removeManySymbols, getNamespaceList, addSymbolsFromText, generateTextFromSymbols, diskKey } = useSymbols();
const { downloadFile } = useFileDownload();

const searchTerm = ref("");
const selectedNamespace = ref("");
const symbolTableRef = ref<InstanceType<typeof SymbolTable> | null>(null);
const selectedCount = computed(() => symbolTableRef.value?.selectedSymbols.size ?? 0);
const searchInput = ref<any>(null);

const ROW_HEIGHT = 41; // Height of a table row in pixels.

const itemsPerPage = ref(0);
const onResize = ({ height }: { width: number; height: number }) => {
	// Estimate available height for rows, accounting for controls and headers.
	itemsPerPage.value = Math.max(1, Math.floor((height - 4 * ROW_HEIGHT) / ROW_HEIGHT));
};

watch([searchTerm, selectedNamespace], () => {
	// Reset selection when filters change
	symbolTableRef.value?.clearSelection();
});

const importFileInput = ref<HTMLInputElement | null>(null);

const uniqueNamespaces = computed(() => {
	const nsList = getNamespaceList();
	const names = nsList.map((ns) => ns[0]);
	return names.sort();
});
const gotoSymbol = (address: number) => {
	emit("gotoAddress", address);
};

const beginAddSymbol = () => {
	symbolTableRef.value?.beginAddSymbol();
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

const handleBulkDelete = async () => {
	const symbolsToDelete = symbolTableRef.value?.selectedSymbols;
	if (!symbolsToDelete || symbolsToDelete.size === 0) return;
	if (confirm(`Are you sure you want to delete ${symbolsToDelete.size} selected symbol(s)?`)) {
		await removeManySymbols(symbolsToDelete);
		symbolTableRef.value?.clearSelection();
	}
};

const onOpen = () => {
	shouldDisplayDisk.value = !!isCtrlPressed.value;
	nextTick(() => {
		const el = searchInput.value?.$el ?? searchInput.value;
		el?.focus?.();
	});
};
</script>
