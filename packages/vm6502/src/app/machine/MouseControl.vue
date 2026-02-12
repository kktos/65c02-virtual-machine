<template>
	<div v-if="hasMouse" class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
		<button
			ref="trigger"
			@click="toggleLock"
			class="group flex items-center justify-center w-10 h-10 rounded border transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
			:class="element ? 'bg-green-700 border-green-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'"
			:title="element ? 'Mouse captured (Press ESC to release)' : 'Click to capture mouse'"
		>
			<MousePointer2 class="h-5 w-5" />
		</button>
	</div>
</template>

<script lang="ts" setup>
import { useEventListener, usePointerLock } from "@vueuse/core";
import { MousePointer2 } from "lucide-vue-next";
import { computed, inject, type Ref, ref, watch } from "vue";
import type { MachineInputDevice } from "@/types/machine.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");
const trigger = ref<HTMLElement | null>(null);

// Use VueUse's pointer lock composable
const { lock, element } = usePointerLock(trigger);

const mouseConfig = ref<MachineInputDevice | null>(null);
const hasMouse = computed(() => !!mouseConfig.value);

// Internal state for the emulated mouse (0-1023 range for Apple II)
const mouseX = ref(0);
const mouseY = ref(0);

watch(() => vm?.value, async (newVm) => {
	if (newVm) {
		await newVm.ready;
		mouseConfig.value = newVm.machineConfig.inputs?.find((d) => d.type === "mouse") ?? null;
	}
}, { immediate: true });

const toggleLock = (payload: PointerEvent) => {
	if (element.value) {
		// Already locked. User must press ESC to release. Do nothing.
	} else {
		lock(payload);
	}
};

// --- Event Listeners ---

useEventListener(document, "mousemove", (e: MouseEvent) => {
	if (!element.value || !mouseConfig.value || !vm?.value) return;

	// Update internal state with relative movement
	mouseX.value = Math.max(0, Math.min(1023, mouseX.value + e.movementX));
	mouseY.value = Math.max(0, Math.min(1023, mouseY.value + e.movementY));

	// Find axis controls and update VM
	// We normalize 0-1023 to 0.0-1.0 float for the VM
	const axisX = mouseConfig.value.controls.find(c => c.id === 'axis_x');
	if (axisX && axisX.index !== undefined) vm.value.setAnalogInput(axisX.index, mouseX.value / 1023);

	const axisY = mouseConfig.value.controls.find(c => c.id === 'axis_y');
	if (axisY && axisY.index !== undefined) vm.value.setAnalogInput(axisY.index, mouseY.value / 1023);

});

const handleButton = (e: MouseEvent, pressed: boolean) => {
	if (!element.value || !mouseConfig.value || !vm?.value) return;

	// Map DOM buttons (0=Left, 2=Right) to our config IDs
	let btnId = "";
	if (e.button === 0) btnId = "btn_0";
	else if (e.button === 2) btnId = "btn_1";
	else return;

	const btn = mouseConfig.value.controls.find(c => c.id === btnId);
	if (btn && btn.index !== undefined) vm.value.setInputButton(btn.index, pressed);
};

useEventListener(document, "mousedown", (e: MouseEvent) => handleButton(e, true));
useEventListener(document, "mouseup", (e: MouseEvent) => handleButton(e, false));

// Prevent context menu when locked so right-click works as a button
useEventListener(document, "contextmenu", (e: Event) => {
	if (element.value) {
		e.preventDefault();
		return false;
	}
});

</script>
