<template>
	<FloatingWindow
		id="routine_editor"
		title="Routine Editor"
		:options="{
			defaultWidth: 480,
			defaultHeight: 320,
			minWidth: 320,
			minHeight: 200,
			contentScrollable: false,
		}"
		@wheel.stop
	>
		<template #icon>
			<FileCode2 class="w-4 h-4" />
		</template>
		<ResizablePanelGroup direction="horizontal" auto-save-id="routineEditorPanelLayout">
			<ResizablePanel :default-size="15" class="flex flex-col">
				<div class="flex-grow overflow-y-auto">
					<ul v-if="routineNames.length > 0 || isCreating">
						<li
							v-if="isCreating"
							class="px-3 py-2 text-xs cursor-pointer hover:bg-gray-700 flex items-center h-8"
						>
							<input
								ref="createInputRef"
								v-model="renamingInput"
								@blur="finishCreation"
								@keydown.enter="finishCreation"
								@keydown.esc="cancelCreation"
								class="w-full bg-gray-800 text-white px-1 border border-cyan-500 outline-none rounded h-6"
								placeholder="ROUTINE NAME"
							/>
						</li>
						<li
							v-for="name in routineNames"
							:key="name"
							@click="selectRoutine(name)"
							@dblclick="startRenaming(name)"
							class="px-3 py-2 text-xs cursor-pointer hover:bg-gray-700 flex items-center h-8"
							:class="{ 'bg-indigo-800/50': name === selectedRoutineName }"
						>
							<input
								v-if="renamingRoutineName === name"
								ref="renameInputRef"
								v-model="renamingInput"
								@blur="finishRenaming"
								@keydown.enter="finishRenaming"
								@keydown.esc="cancelRenaming"
								@click.stop
								class="w-full bg-gray-800 text-white px-1 border border-cyan-500 outline-none rounded h-6"
							/>
							<span v-else class="truncate w-full">{{ name }}</span>
						</li>
					</ul>
					<div v-else class="px-3 py-2 text-xs text-gray-500 italic">No routines defined.</div>
				</div>
				<!-- Toolbar -->
				<div class="p-2 border-t border-gray-700 flex justify-end gap-2 bg-gray-900">
					<button
						@click="createRoutine"
						class="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
						title="New Routine"
					>
						<Plus class="w-4 h-4" />
					</button>
					<button
						@click="deleteSelectedRoutine"
						class="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
						title="Delete Routine"
						:disabled="!selectedRoutineName"
					>
						<Trash2 class="w-4 h-4" />
					</button>
				</div>
			</ResizablePanel>

			<ResizableHandle />

			<ResizablePanel>
				<div v-if="selectedRoutineName" class="flex flex-col h-full">
					<div class="flex items-center gap-2 p-2 border-b border-gray-700 bg-gray-900/30">
						<span class="text-xs text-gray-500 font-mono select-none">ARGS:</span>
						<input
							v-model="editableArgs"
							class="flex-grow bg-transparent text-yellow-200 text-xs font-mono outline-none placeholder-gray-700"
							placeholder="e.g. @addr @val"
						/>
					</div>
					<div class="flex-grow min-h-0 overflow-hidden">
						<Codemirror
							v-model="editableContent"
							:placeholder="`Editing routine '${selectedRoutineName}'...`"
							:extensions="extensions"
							:autofocus="true"
							:indent-with-tab="true"
							:tab-size="2"
							class="h-full text-xs"
							style="font-family: monospace"
						/>
					</div>
				</div>
				<div v-else class="flex items-center justify-center h-full text-gray-500 text-sm">
					Select a routine to edit.
				</div>
			</ResizablePanel>
		</ResizablePanelGroup>
	</FloatingWindow>
</template>

<script lang="ts" setup>
import { ref, watch, computed, nextTick } from "vue";
import { Codemirror } from "vue-codemirror";
import { vsCodeDark } from "@fsegurai/codemirror-theme-vscode-dark";
import { useRoutines } from "@/composables/useRoutines";
import { FileCode2, Plus, Trash2 } from "lucide-vue-next";
import FloatingWindow from "@/components/FloatingWindow.vue";
import { shellRoutine } from "@/lib/codemirror/routine";
import ResizableHandle from "../../components/ui/resizable/ResizableHandle.vue";
import ResizablePanel from "../../components/ui/resizable/ResizablePanel.vue";
import ResizablePanelGroup from "../../components/ui/resizable/ResizablePanelGroup.vue";

const { getRoutineNames, getRoutine, setRoutine, deleteRoutine, routineExists } = useRoutines();

const routineNames = computed(() => getRoutineNames().sort());
const selectedRoutineName = ref<string | null>(null);
const editableContent = ref("");
const editableArgs = ref("");

const extensions = [shellRoutine(), vsCodeDark];

// Renaming state
const renamingRoutineName = ref<string | null>(null);
const renamingInput = ref("");
const renameInputRef = ref<HTMLInputElement | null>(null);
const isCreating = ref(false);
const createInputRef = ref<HTMLInputElement | null>(null);

const createRoutine = () => {
	cancelRenaming();
	selectedRoutineName.value = null;
	editableContent.value = "";
	editableArgs.value = "";
	isCreating.value = true;
	renamingInput.value = "";
	nextTick(() => createInputRef.value?.focus());
};

const finishCreation = () => {
	if (!isCreating.value) return;
	const name = renamingInput.value.trim();
	if (!name) {
		cancelCreation();
		return;
	}
	if (routineExists(name)) {
		alert(`Routine '${name}' already exists.`);
		nextTick(() => createInputRef.value?.focus());
		return;
	}
	setRoutine(name, []);
	selectRoutine(name);
	isCreating.value = false;
};

const cancelCreation = () => {
	isCreating.value = false;
	renamingInput.value = "";
};

const deleteSelectedRoutine = () => {
	if (selectedRoutineName.value) {
		if (confirm(`Delete routine '${selectedRoutineName.value}'?`)) {
			deleteRoutine(selectedRoutineName.value);
			selectedRoutineName.value = null;
			editableContent.value = "";
			editableArgs.value = "";
		}
	}
};

const startRenaming = (name: string) => {
	cancelCreation();
	renamingRoutineName.value = name;
	renamingInput.value = name;
	nextTick(() => renameInputRef.value?.focus());
};

const finishRenaming = () => {
	if (!renamingRoutineName.value) return;
	const oldName = renamingRoutineName.value;
	const newName = renamingInput.value.trim();

	if (newName && newName !== oldName) {
		if (routineExists(newName)) {
			alert(`Routine '${newName}' already exists.`);
		} else {
			const content = getRoutine(oldName) || [];
			setRoutine(newName, content.lines, content.args);
			deleteRoutine(oldName);
			selectRoutine(newName);
		}
	}
	renamingRoutineName.value = null;
};

const cancelRenaming = () => {
	renamingRoutineName.value = null;
};

const selectRoutine = (name: string) => {
	selectedRoutineName.value = name;
	const content = getRoutine(name);
	editableContent.value = content ? content.lines.join("\n") : "";
	editableArgs.value = content ? content.args.join(" ") : "";
};

let debounceTimer: number | null = null;
watch([editableContent, editableArgs], () => {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = window.setTimeout(() => {
		if (selectedRoutineName.value) {
			const lines = editableContent.value.split("\n");
			const args = editableArgs.value
				.trim()
				.split(/\s+/)
				.filter((s) => s.length > 0);
			setRoutine(selectedRoutineName.value, lines, args);
		}
	}, 500);
});

watch(routineNames, (newNames) => {
	if (selectedRoutineName.value && !newNames.includes(selectedRoutineName.value)) {
		selectedRoutineName.value = null;
		editableContent.value = "";
		editableArgs.value = "";
	}
});
</script>

<style scoped>
:deep(.cm-editor) {
	height: 100%;
}
</style>
