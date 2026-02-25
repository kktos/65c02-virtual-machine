<template>
	<Dialog :open="modelValue" @update:open="(value) => emit('update:modelValue', value)">
		<DialogContent
			overlayClass="bg-transparent"
			:showCloseButton="false"
			class="sm:max-w-lg bg-gray-900 border-gray-700 text-gray-200"
		>
			<DialogTitle><DialogDescription /></DialogTitle>
			<div class="relative">
				<input
					ref="inputRef"
					v-model="command"
					@keydown.enter="execute"
					@keydown.up="handleHistoryNav"
					@keydown.down="handleHistoryNav"
					type="text"
					:disabled="isLoading"
					placeholder="Enter command (e.g., A=$10)..."
					class="w-full bg-gray-950 text-green-400 font-mono p-1 rounded border border-gray-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none disabled:opacity-50"
				/>
				<Loader2
					v-if="isLoading"
					class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400"
				/>
			</div>
			<div v-if="error" class="mt-2 text-red-400 text-sm font-mono whitespace-pre-wrap">{{ error }}</div>
			<div
				v-if="success"
				class="mt-2 text-green-400 text-sm font-mono whitespace-pre-wrap max-h-80 overflow-y-auto"
			>
				{{ success }}
			</div>

			<div v-if="progress > 0" class="w-full bg-gray-700 rounded-full h-1.5 mt-2">
				<div class="bg-cyan-600 h-1.5 rounded-full" :style="{ width: progress + '%' }"></div>
			</div>

			<DialogFooter class="text-xs text-gray-500 sm:justify-start pt-2">
				Press <kbd class="bg-gray-800 px-1 rounded">Enter</kbd> to execute,
				<kbd class="bg-gray-800 px-1 rounded">Esc</kbd> to close.
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { inject, nextTick, ref, watch, type Ref } from "vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-vue-next";
import type { VirtualMachine } from "../../virtualmachine/virtualmachine.class";
import DialogTitle from "@/components/ui/dialog/DialogTitle.vue";
import { useCommands } from "@/composables/useCommands";

const props = defineProps<{
	modelValue: boolean;
}>();

const emit = defineEmits<{
	(e: "update:modelValue", value: boolean): void;
}>();

const vm = inject<Ref<VirtualMachine | null>>("vm");
const command = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const { error, success, isLoading, progress, executeCommand, commandHistory, shouldClose } = useCommands();
const historyIndex = ref(-1);

watch(
	() => props.modelValue,
	(newVal) => {
		if (newVal) {
			// on open
			nextTick(() => {
				inputRef.value?.focus();
				historyIndex.value = commandHistory.value.length;
			});
		} else {
			// on close, reset state
			error.value = "";
			success.value = "";
			isLoading.value = false;
			progress.value = 0;
		}
	},
);

const handleHistoryNav = (e: KeyboardEvent) => {
	if (e.key === "ArrowUp") {
		e.preventDefault();
		if (historyIndex.value > 0) {
			historyIndex.value--;
			command.value = commandHistory.value[historyIndex.value] as string;
		}
	} else if (e.key === "ArrowDown") {
		e.preventDefault();
		if (historyIndex.value < commandHistory.value.length - 1) {
			historyIndex.value++;
			command.value = commandHistory.value[historyIndex.value] as string;
		} else {
			historyIndex.value = commandHistory.value.length;
			command.value = "";
		}
	}
};

const execute = async () => {
	if (await executeCommand(command.value, vm?.value || null)) {
		if (shouldClose.value) {
			emit("update:modelValue", false);
		}
		command.value = "";
		progress.value = 0;
		historyIndex.value = commandHistory.value.length;
		inputRef.value?.focus();
	}
};
</script>
