<template>
	<Dialog :open="modelValue" @update:open="(value) => emit('update:modelValue', value)">
		<DialogContent
			overlayClass="bg-transparent"
			:showCloseButton="false"
			class="sm:max-w-lg bg-gray-900 border-gray-700 text-gray-200"
		>
			<DialogTitle><DialogDescription /></DialogTitle>
			<input
				ref="inputRef"
				v-model="command"
				@keydown.enter="execute"
				type="text"
				placeholder="Enter command (e.g., A=$10)..."
				class="w-full bg-gray-950 text-green-400 font-mono p-1 rounded border border-gray-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
			/>
			<div v-if="error" class="mt-2 text-red-400 text-sm">{{ error }}</div>
			<div v-if="success" class="mt-2 text-green-400 text-sm">{{ success }}</div>

			<DialogFooter class="text-xs text-gray-500 sm:justify-start">
				Press <kbd class="bg-gray-800 px-1 rounded">Enter</kbd> to execute,
				<kbd class="bg-gray-800 px-1 rounded">Esc</kbd> to close.
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { inject, nextTick, ref, watch, type Ref } from "vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { REG_A_OFFSET } from "../../virtualmachine/cpu/shared-memory";
import type { VirtualMachine } from "../../virtualmachine/virtualmachine.class";
import DialogTitle from "@/components/ui/dialog/DialogTitle.vue";

const props = defineProps<{
	modelValue: boolean;
}>();

const emit = defineEmits<{
	(e: "update:modelValue", value: boolean): void;
}>();

const vm = inject<Ref<VirtualMachine | null>>("vm");
const command = ref("");
const error = ref("");
const success = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

watch(
	() => props.modelValue,
	(newVal) => {
		if (newVal) {
			// on open
			nextTick(() => {
				inputRef.value?.focus();
			});
		} else {
			// on close, reset state
			error.value = "";
			success.value = "";
		}
	},
);

type Command = {
	paramCount: number;
	fn: (params: string[]) => void;
};

const COMMAND_LIST: Record<string, Command> = { "A=": { paramCount: 1, fn: (params: string[]) => {} } };

const execute = () => {
	if (!vm?.value) {
		error.value = "Virtual Machine not initialized.";
		return;
	}

	const cmd = command.value.trim();
	if (!cmd) return;

	error.value = "";
	success.value = "";

	// Parse command: A=<value>
	const setARegex = /^A=(\$?)([0-9A-Fa-f]+)$/i;
	const match = cmd.match(setARegex) as [unknown, string, string];

	if (match) {
		const isHex = match[1] === "$";
		const valStr = match[2];
		const value = parseInt(valStr, isHex ? 16 : 10);

		if (Number.isNaN(value)) {
			error.value = "Invalid value";
			return;
		}

		if (value > 0xff) {
			error.value = "Value exceeds 8-bit range (0-255)";
			return;
		}

		// Set Register A
		vm.value.sharedRegisters.setUint8(REG_A_OFFSET, value);
		success.value = `Register A set to $${value.toString(16).toUpperCase().padStart(2, "0")}`;
		command.value = "";
	} else {
		error.value = "Unknown command";
	}
};

// Global shortcut handling is done in App.vue or here.
// If we want the shortcut to work globally, this component needs to be mounted.
// Since it is v-if'd in App.vue, we should move the shortcut listener to App.vue
// OR use v-show in App.vue.
// However, the requirement was "global keyboard shortcut".
// Let's handle the shortcut in App.vue to ensure it catches events even if this component is not rendered.
</script>
