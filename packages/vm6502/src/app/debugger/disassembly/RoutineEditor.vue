<template>
	<FloatingWindow
		ref="windowRef"
		id="routine-editor"
		title="Routine Editor"
		:default-x="x"
		:default-y="y"
		:default-width="480"
		:default-height="320"
		:min-width="320"
		:min-height="200"
		:content-scrollable="false"
		@close="close"
		@wheel.stop
	>
		<template #icon>
			<FileCode2 class="w-4 h-4" />
		</template>
		<div class="flex flex-grow min-h-0">
			<!-- Left panel: Routine list -->
			<div class="w-1/3 border-r border-gray-700 flex flex-col bg-gray-900/50">
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
							:class="{ 'bg-cyan-800/50 text-cyan-300': name === selectedRoutineName }"
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
			</div>

			<!-- Right panel: Text editor -->
			<div class="w-2/3 flex flex-col">
				<textarea
					v-if="selectedRoutineName"
					v-model="editableContent"
					class="w-full flex-grow text-gray-200 text-xs font-mono p-2 border-none focus:outline-none resize-none bg-transparent"
					:placeholder="`Editing routine '${selectedRoutineName}'...`"
				></textarea>
				<div v-else class="flex items-center justify-center h-full text-gray-500 text-sm">
					Select a routine to edit.
				</div>
			</div>
		</div>
	</FloatingWindow>
</template>

<script lang="ts" setup>
import { ref, watch, computed, nextTick, onMounted } from "vue";
import { useRoutines } from "@/composables/useRoutines";
import { FileCode2, Plus, Trash2 } from "lucide-vue-next";
import FloatingWindow from "@/components/FloatingWindow.vue";

const { getRoutineNames, getRoutine, setRoutine, deleteRoutine, routineExists } = useRoutines();

const props = defineProps<{
	isOpen: boolean;
	x: number;
	y: number;
}>();

const emit = defineEmits<{
	(e: "update:isOpen", value: boolean): void;
}>();

const windowRef = ref<InstanceType<typeof FloatingWindow> | null>(null);
const routineNames = computed(() => getRoutineNames().sort());
const selectedRoutineName = ref<string | null>(null);
const editableContent = ref("");

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
			setRoutine(newName, content);
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
	editableContent.value = content ? content.join("\n") : "";
};

let debounceTimer: number | null = null;
watch(editableContent, (newContent) => {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = window.setTimeout(() => {
		if (selectedRoutineName.value) {
			const lines = newContent.split("\n");
			setRoutine(selectedRoutineName.value, lines);
		}
	}, 500);
});

watch(routineNames, (newNames) => {
	if (selectedRoutineName.value && !newNames.includes(selectedRoutineName.value)) {
		selectedRoutineName.value = null;
		editableContent.value = "";
	}
});

const close = () => emit("update:isOpen", false);

watch(
	() => props.isOpen,
	(newVal) => {
		if (newVal) {
			windowRef.value?.open();
		} else {
			windowRef.value?.close();
		}
	},
);

onMounted(() => {
	if (props.isOpen) windowRef.value?.open();
});
</script>
