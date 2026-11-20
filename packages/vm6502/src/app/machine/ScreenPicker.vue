<template>
	<Teleport to="body">
		<div
			v-if="shown && location"
			class="pointer-events-none fixed z-50 rounded border border-gray-600 bg-gray-900/95 px-2 py-1 text-xs text-gray-200 shadow-lg"
			:style="{ left: `${pointer!.x + 14}px`, top: `${pointer!.y + 14}px` }"
		>
			<div>
				<span class="font-mono font-bold text-cyan-300">{{ addressText }}</span>
				<span class="ml-2">{{ location.label }}</span>
			</div>
			<div class="text-gray-500">click: memory · ⇧ click: new viewer</div>
		</div>
	</Teleport>
</template>

<script lang="ts" setup>
/**
 * Paused, Ctrl over the screen: shows the memory behind the pointer (what the machine's video drew there),
 * Ctrl-click shows it in the active memory viewer, Ctrl-Shift-click in a new one. On mousedown, as on macOS a
 * Ctrl-click is a right click: no click event, a context menu (prevented).
 */
import { useEventListener } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useMachine } from "@/composables/useMachine";
import { useMemView } from "@/composables/useMemView";
import type { ScreenLocation } from "@/types/video.interface";

const { vm, isRunning, videoCanvas } = useMachine();
const { showRange } = useMemView();
const { setActiveTab } = useDebuggerNav();

const ctrlDown = ref(false);
/** The pointer, over the canvas only (client coordinates) */
const pointer = ref<{ x: number; y: number } | null>(null);
const location = ref<ScreenLocation | null>(null);

const armed = computed(() => ctrlDown.value && !isRunning.value);
const shown = computed(() => armed.value && !!pointer.value);

const hex = (n: number, pad: number) => n.toString(16).toUpperCase().padStart(pad, "0");
const addressText = computed(() => {
	const address = location.value?.address ?? 0;
	return address > 0xffff ? `$${hex(address >> 16, 2)}:${hex(address & 0xffff, 4)}` : `$${hex(address, 4)}`;
});

// One request at a time: the pointer moves faster than the worker answers, ask again with the latest position
let busy = false;
let again = false;
const probe = async () => {
	if (busy) {
		again = true;
		return;
	}
	busy = true;
	do {
		again = false;
		const at = pointer.value;
		location.value = shown.value && at && vm.value ? ((await vm.value.locateOnScreen(at.x, at.y)) ?? null) : null;
	} while (again);
	busy = false;
};

watch(shown, (isShown) => {
	if (isShown) probe();
	else location.value = null;
});
watch(armed, (isArmed) => {
	if (videoCanvas.value) videoCanvas.value.style.cursor = isArmed ? "crosshair" : "";
});

useEventListener(window, "keydown", (e: KeyboardEvent) => {
	if (e.key === "Control") ctrlDown.value = true;
});
useEventListener(window, "keyup", (e: KeyboardEvent) => {
	if (e.key === "Control") ctrlDown.value = false;
});
useEventListener(window, "blur", () => {
	ctrlDown.value = false;
});

useEventListener(videoCanvas, "mousemove", (e: MouseEvent) => {
	ctrlDown.value = e.ctrlKey;
	pointer.value = { x: e.clientX, y: e.clientY };
	if (shown.value) probe();
});
useEventListener(videoCanvas, "mouseleave", () => {
	pointer.value = null;
});

useEventListener(videoCanvas, "mousedown", async (e: MouseEvent) => {
	if (e.button !== 0 || !e.ctrlKey || isRunning.value || !vm.value) return;
	e.preventDefault();
	const picked = await vm.value.locateOnScreen(e.clientX, e.clientY);
	if (!picked) return;
	showRange(picked.address, picked.length, e.shiftKey);
	setActiveTab("memory");
});
useEventListener(videoCanvas, "contextmenu", (e: MouseEvent) => {
	if (e.ctrlKey && !isRunning.value) e.preventDefault();
});
</script>
