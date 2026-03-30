<template>
	<FloatingWindow
		title="Formatting Rules"
		id="formatting_manager"
		:options="{
			defaultWidth: 900,
			defaultHeight: 60,
			minWidth: 480,
			minHeight: 400,
			contentScrollable: false,
		}"
		@resize="onResize"
		@open="onOpen"
	>
		<template #icon>
			<Binary class="h-4 w-4 text-gray-300" />
		</template>
		<div class="flex flex-col h-full text-gray-200 p-4">
			<div class="text-gray-400 mb-4 -mt-2 text-xs">Manage data formatting rules across all groups.</div>
			<!-- Search and Filter -->
			<div class="flex justify-between items-center mb-4 gap-4">
				<Input
					ref="searchInput"
					v-model="searchTerm"
					placeholder="Search label or address..."
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
				<Button @click="triggerAddRule" class="h-10 bg-blue-600 hover:bg-blue-500 text-white shrink-0">
					<PlusCircle class="h-4 w-4" />
				</Button>
			</div>

			<FormattingTable
				ref="formattingTableRef"
				:search-term="searchTerm"
				:selected-group="selectedGroup"
				:items-per-page="itemsPerPage"
				class="flex-1 min-h-0"
				@goto-address="handleGotoAddress"
			/>
		</div>
	</FloatingWindow>
</template>

<script setup lang="ts">
import { PlusCircle, Download, Upload, Binary, Trash2 } from "lucide-vue-next";
import { computed, nextTick, ref } from "vue";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import FloatingWindow from "@/components/FloatingWindow.vue";
import { Input } from "@/components/ui/input";
import { useFormatting } from "@/composables/useDataFormattings";
import { useDiskStorage } from "@/composables/useDiskStorage";
import { useFileDownload } from "@/composables/useFileDownload";
import FormattingTable from "@/app/debugger/FormattingManager/FormattingTable.vue";

const emit = defineEmits<{
	(e: "gotoAddress", address: number): void;
}>();

const { getFormattingGroups, generateTextFromFormattings, addFormattingsFromText, removeManyFormattings, diskKey } =
	useFormatting();
const { downloadFile } = useFileDownload();

const searchTerm = ref("");
const selectedGroup = ref("");
const formattingTableRef = ref<InstanceType<typeof FormattingTable> | null>(null);
const searchInput = ref<any>(null);
const selectedCount = computed(() => formattingTableRef.value?.selectedRules.size ?? 0);

const ROW_HEIGHT = 41;
const itemsPerPage = ref(10);
const onResize = ({ height }: { width: number; height: number }) => {
	itemsPerPage.value = Math.max(1, Math.floor((height - 5 * ROW_HEIGHT) / ROW_HEIGHT));
};

const importFileInput = ref<HTMLInputElement | null>(null);

const triggerAddRule = () => {
	formattingTableRef.value?.beginAddRule();
};

const handleGotoAddress = (address: number) => {
	emit("gotoAddress", address);
};

const uniqueGroups = computed(() => {
	const list = getFormattingGroups();
	const groups = list.map((ns) => ns[0]);
	return groups.sort();
});

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

const handleBulkDelete = async () => {
	const rulesToDelete = formattingTableRef.value?.selectedRules;
	if (!rulesToDelete || rulesToDelete.size === 0) return;

	if (confirm(`Are you sure you want to delete ${rulesToDelete.size} selected rule(s)?`)) {
		await removeManyFormattings(rulesToDelete);
		formattingTableRef.value?.clearSelection();
	}
};

const onOpen = () => {
	nextTick(() => {
		const el = searchInput.value?.$el ?? searchInput.value;
		el?.focus?.();
	});
};
</script>
