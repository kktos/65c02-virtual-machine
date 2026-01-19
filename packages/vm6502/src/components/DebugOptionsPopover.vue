<template>
	<div>
		<Popover v-if="hasOptions && !isTornOff" v-model:open="isPopoverOpen">
			<PopoverTrigger as-child>
				<slot>
					<!-- Default trigger -->
					<Button variant="outline" size="sm" class="h-[30px] px-2 text-xs bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white">
						<Settings2 class="mr-2 h-3 w-3" />
						Options
					</Button>
				</slot>
			</PopoverTrigger>
			<PopoverContent :class="contentClass" :align="align" :side-offset="8">
				<div class="flex items-center justify-between mb-2 -mt-1">
					<span class="text-sm font-bold text-gray-200 capitalize">{{ category }} Settings</span>
					<div class="flex items-center -mr-2">
						<Button @click="tearOff" variant="ghost" size="icon" class="w-6 h-6 text-gray-400 hover:bg-gray-700 hover:text-cyan-300" title="Tear-off into floating window">
							<PanelTopClose class="h-4 w-4" />
						</Button>
					</div>
				</div>
				<DebugOptionList v-model="debugOverrides" :debug-options="debugOptions" :storage-key="`debug-accordion-${category}`" />
			</PopoverContent>
		</Popover>

		<!-- Disabled trigger when torn off -->
		<div v-if="hasOptions && isTornOff" class="relative" title="Options are in a separate window">
			<div class="opacity-50 cursor-not-allowed">
				<slot>
					<!-- Default trigger -->
					<Button variant="outline" size="sm" class="h-[30px] px-2 text-xs bg-gray-700 border-gray-600 text-gray-300" disabled>
						<Settings2 class="mr-2 h-3 w-3" />
						Options
					</Button>
				</slot>
			</div>
			<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
				<PanelTopClose class="h-4 w-4 text-cyan-400" />
			</div>
		</div>

		<Teleport to="body">
			<div v-if="isTornOff" ref="floatingWindow" :style="floatingWindowStyle" class="fixed flex flex-col bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl z-50">
				<div ref="dragHandle" @mousedown="startDrag" class="flex items-center justify-between px-3 py-1 bg-gray-900/70 rounded-t-lg cursor-move border-b border-gray-700">
					<span class="text-xs font-bold text-gray-200 capitalize -ml-1">{{ category }} Settings</span>
					<div class="flex items-center -mr-2">
						<Button @click="dock" variant="ghost" size="icon" class="w-6 h-6 text-gray-400 hover:bg-gray-700 hover:text-cyan-300" title="Dock back to popover">
							<X class="h-4 w-4" />
						</Button>
					</div>
				</div>
				<div class="p-4 w-80">
					<DebugOptionList v-model="debugOverrides" :debug-options="debugOptions" id-suffix="-torn-off" :storage-key="`debug-accordion-${category}`" />
				</div>
			</div>
		</Teleport>
	</div>
</template>

<script lang="ts" setup>
import { PanelTopClose, Settings2, X } from "lucide-vue-next";
import { computed, inject, nextTick, onUnmounted, type Ref, ref, watch } from "vue";
import DebugOptionList from "@/components/DebugOptionList.vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DebugOption } from "@/types/machine.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const props = withDefaults(defineProps<{
	category: string;
	updateVmGlobally?: boolean;
	align?: "start" | "center" | "end";
	contentClass?: string;
}>(), {
	updateVmGlobally: false,
	align: "end",
	contentClass: "w-80 p-4 bg-gray-800 border-gray-700 text-gray-100",
});

const vm = inject<Ref<VirtualMachine>>("vm");
const debugOptions = ref<DebugOption[]>([]);
const debugOverrides = ref<Record<string, unknown>>({});

const isTornOff = ref(false);
const isPopoverOpen = ref(false);

const floatingWindow = ref<HTMLElement | null>(null);
const windowPos = ref({ x: 100, y: 100 });

const STORAGE_KEY = computed(() => `debug-options-${props.category}`);
const UI_STORAGE_KEY = computed(() => `debug-ui-${props.category}`);

const clampToViewport = () => {
	if (!floatingWindow.value) return;
	const width = floatingWindow.value.offsetWidth;
	const height = floatingWindow.value.offsetHeight;

	const maxX = Math.max(0, window.innerWidth - width);
	const maxY = Math.max(0, window.innerHeight - height);

	const newX = Math.min(Math.max(0, windowPos.value.x), maxX);
	const newY = Math.min(Math.max(0, windowPos.value.y), maxY);

	if (newX !== windowPos.value.x || newY !== windowPos.value.y) {
		windowPos.value = { x: newX, y: newY };
	}
};

const saveUIState = () => {
	localStorage.setItem(UI_STORAGE_KEY.value, JSON.stringify({ isTornOff: isTornOff.value, windowPos: windowPos.value }));
};

const loadUIState = async () => {
	const saved = localStorage.getItem(UI_STORAGE_KEY.value);
	if (saved) {
		try {
			const state = JSON.parse(saved);
			if (state.windowPos) windowPos.value = state.windowPos;
			if (state.isTornOff !== undefined) isTornOff.value = state.isTornOff;
			if (isTornOff.value) {
				await nextTick();
				clampToViewport();
			}
		} catch (e) { /* ignore */ }
	}
};

const saveOptions = () => {
	const savableOptions = debugOptions.value.filter(opt => opt.savable).map(opt => opt.id);
	const valuesToSave: Record<string, unknown> = {};
	for (const id of savableOptions) {
		if (debugOverrides.value[id] !== undefined) {
			valuesToSave[id] = debugOverrides.value[id];
		}
	}
	localStorage.setItem(STORAGE_KEY.value, JSON.stringify(valuesToSave));
};

const loadOptions = () => {
	const saved = localStorage.getItem(STORAGE_KEY.value);
	if (saved) {
		try {
			const savedValues = JSON.parse(saved);
			debugOverrides.value = { ...debugOverrides.value, ...savedValues };
		} catch (e) {
			console.error(`Failed to load ${props.category} options`, e);
		}
	}
};

const floatingWindowStyle = computed(() => ({
	left: `${windowPos.value.x}px`,
	top: `${windowPos.value.y}px`,
}));

const startDrag = (event: MouseEvent) => {
	if (!floatingWindow.value) return;
	event.preventDefault();

	const startX = event.clientX;
	const startY = event.clientY;
	const startLeft = windowPos.value.x;
	const startTop = windowPos.value.y;

	const doDrag = (e: MouseEvent) => {
		windowPos.value.x = startLeft + e.clientX - startX;
		windowPos.value.y = startTop + e.clientY - startY;
	};

	const stopDrag = () => {
		document.removeEventListener("mousemove", doDrag);
		document.removeEventListener("mouseup", stopDrag);
		saveUIState();
	};

	document.addEventListener("mousemove", doDrag);
	document.addEventListener("mouseup", stopDrag);
};

const tearOff = async (event?: MouseEvent) => {
	let rect: DOMRect | undefined;
	if (event?.target) {
		const target = event.target as Element;
		const contentEl = target.closest('[role="dialog"]');
		if (contentEl) rect = contentEl.getBoundingClientRect();
	}

	isPopoverOpen.value = false;
	isTornOff.value = true;

	if (rect) windowPos.value = { x: rect.left, y: rect.top };
	else {
		await nextTick();
		if (floatingWindow.value) windowPos.value = { x: (window.innerWidth - floatingWindow.value.offsetWidth) / 2, y: (window.innerHeight - floatingWindow.value.offsetHeight) / 2 };
	}
	clampToViewport();
	saveUIState();
};

const dock = () => {
	isTornOff.value = false;
	saveUIState();
};

const hasOptions = computed(() => debugOptions.value.length > 0);

watch(() => vm?.value, async (newVm) => {
	if (newVm) {
		await newVm.ready;
		debugOptions.value = newVm.getDebugOptions().filter((opt) => opt.category === props.category);

		const defaults: Record<string, unknown> = {};
		debugOptions.value.forEach((opt) => {
			if (opt.defaultValue !== undefined) {
				defaults[opt.id] = opt.defaultValue;
			} else if (opt.type === "select" && opt.options?.length) {
				defaults[opt.id] = opt.options[0]?.value;
			} else if (opt.type === "boolean") {
				defaults[opt.id] = false;
			} else if (opt.type === "number") {
				defaults[opt.id] = undefined;
			}
		});
		debugOverrides.value = defaults;

		// Load saved options on top of defaults
		loadOptions();
	}
}, { immediate: true });

watch(debugOverrides, (newVal) => {
	if (props.updateVmGlobally) {
		vm?.value?.setDebugOverrides(newVal);
		saveOptions();
	}
}, { deep: true });

watch(() => props.category, () => {
	loadUIState();
}, { immediate: true });

watch(isTornOff, (val) => {
	if (val) {
		window.addEventListener("resize", clampToViewport);
	} else {
		window.removeEventListener("resize", clampToViewport);
	}
});

onUnmounted(() => {
	window.removeEventListener("resize", clampToViewport);
});

defineExpose({
	debugOverrides,
    debugOptions,
});
</script>
