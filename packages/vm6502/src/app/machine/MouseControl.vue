<template>
	<div v-if="hasMouse" class="flex items-center">
		<button
			ref="trigger"
			@click="toggleLock"
			class="toolbar-btn group"
			:class="element ? 'bg-green-700 hover:bg-green-600 text-white' : 'text-gray-400'"
			:aria-pressed="!!element"
			:title="element ? 'Mouse captured (Press ESC to release)' : 'Click to capture mouse'"
		>
			<MousePointer2 class="h-4 w-4" />
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

// The host mouse position, in units (one per pointer-lock movement pixel), wrapping around at HOST_RANGE.
// The machine only uses the movement between two readings (the AppleMouse counts motion, its card clamps it):
// wrapping instead of clamping here means no motion is ever lost at a host-side edge. Same value as the
// Apple II MouseCard's MOUSE_HOST_RANGE; a power of 2, so position / HOST_RANGE is exact in the Float32 input.
const HOST_RANGE = 1024;
const mouseX = ref(0);
const mouseY = ref(0);

const wrap = (v: number) => ((v % HOST_RANGE) + HOST_RANGE) % HOST_RANGE;

watch(
	() => vm?.value,
	async (newVm) => {
		if (newVm) {
			await newVm.ready;
			mouseConfig.value = newVm.machineConfig.inputs?.find((d) => d.type === "mouse") ?? null;
		}
	},
	{ immediate: true },
);

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
	mouseX.value = wrap(mouseX.value + e.movementX);
	mouseY.value = wrap(mouseY.value + e.movementY);

	// Find axis controls and update VM, as 0.0 <= value < 1.0
	const axisX = mouseConfig.value.controls.find((c) => c.id === "axis_x");
	if (axisX && axisX.index !== undefined) vm.value.setAnalogInput(axisX.index, mouseX.value / HOST_RANGE);

	const axisY = mouseConfig.value.controls.find((c) => c.id === "axis_y");
	if (axisY && axisY.index !== undefined) vm.value.setAnalogInput(axisY.index, mouseY.value / HOST_RANGE);
});

const handleButton = (e: MouseEvent, pressed: boolean) => {
	if (!element.value || !mouseConfig.value || !vm?.value) return;

	// Map DOM buttons (0=Left, 2=Right) to our config IDs
	let btnId = "";
	if (e.button === 0) btnId = "btn_0";
	else if (e.button === 2) btnId = "btn_1";
	else return;

	const btn = mouseConfig.value.controls.find((c) => c.id === btnId);
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
