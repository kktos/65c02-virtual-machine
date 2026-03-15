<template>
	<div>
		<Popover v-if="hasOptions && !isTornOff" v-model:open="isPopoverOpen">
			<PopoverTrigger as-child>
				<slot>
					<!-- Default trigger -->
					<Button
						variant="outline"
						size="sm"
						class="h-[30px] px-2 text-xs bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white"
						title="Options"
					>
						<Settings2 class="h-3 w-3" />
					</Button>
				</slot>
			</PopoverTrigger>
			<PopoverContent :class="contentClass" :align="align" :side-offset="8">
				<div class="flex items-center justify-between mb-2 -mt-1">
					<span class="text-sm font-bold text-gray-200 capitalize">{{ category }} Settings</span>
					<div class="flex items-center -mr-2">
						<Button
							@click="tearOff($event)"
							variant="ghost"
							size="icon"
							class="w-6 h-6 text-gray-400 hover:bg-gray-700 hover:text-cyan-300"
							title="Tear-off into floating window"
						>
							<PanelTopClose class="h-4 w-4" />
						</Button>
					</div>
				</div>
				<DebugOptionList
					v-model="debugOverrides"
					:debug-options="debugOptions"
					:storage-key="`debug-accordion-${category}`"
				/>
				<div v-if="$slots['extra-content']" class="mt-3 pt-3 border-t border-gray-700/50">
					<slot name="extra-content" />
				</div>
			</PopoverContent>
		</Popover>

		<!-- Disabled trigger when torn off -->
		<div v-if="hasOptions && isTornOff" class="relative" title="Options are in a separate window">
			<div class="opacity-50 cursor-not-allowed">
				<slot>
					<!-- Default trigger -->
					<Button
						variant="outline"
						size="sm"
						class="h-[30px] px-2 text-xs bg-gray-700 border-gray-600 text-gray-300"
						disabled
					>
						<Settings2 class="h-3 w-3" />
					</Button>
				</slot>
			</div>
			<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
				<PanelTopClose class="h-4 w-4 text-cyan-400" />
			</div>
		</div>

		<FloatingWindow
			ref="floatingWindowRef"
			:id="`debug_options_${category}`"
			:title="`${category} Settings`"
			:options="{
				defaultWidth: 320,
				defaultHeight: 320,
				resizable: false,
				contentScrollable: false,
			}"
		>
			<template #icon>
				<Settings2 class="h-4 w-4" />
			</template>
			<div class="p-4">
				<DebugOptionList
					v-model="debugOverrides"
					:debug-options="debugOptions"
					id-suffix="-torn-off"
					:storage-key="`debug-accordion-${category}`"
				/>
				<div v-if="$slots['extra-content']" class="mt-3 pt-3 border-t border-gray-700/50">
					<slot name="extra-content" />
				</div>
			</div>
		</FloatingWindow>
	</div>
</template>

<script lang="ts" setup>
import { PanelTopClose, Settings2 } from "lucide-vue-next";
import { computed, inject, type Ref, ref, useSlots, watch } from "vue";
import DebugOptionList from "@/components/DebugOptionList.vue";
import FloatingWindow from "@/components/FloatingWindow.vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DebugGroup } from "@/types/machine.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const props = withDefaults(
	defineProps<{
		category: string;
		updateVmGlobally?: boolean;
		align?: "start" | "center" | "end";
		contentClass?: string;
	}>(),
	{
		updateVmGlobally: false,
		align: "end",
		contentClass: "w-80 p-4 bg-gray-800 border-gray-700 text-gray-100",
	},
);

const slots = useSlots();
const vm = inject<Ref<VirtualMachine>>("vm");
const debugOptions = ref<DebugGroup[]>([]);
const debugOverrides = ref<Record<string, unknown>>({});

const isPopoverOpen = ref(false);
const floatingWindowRef = ref<InstanceType<typeof FloatingWindow> | null>(null);
const isTornOff = ref(false);

const STORAGE_KEY = computed(() => `debug-options-${props.category}`);

const saveOptions = () => {
	const savableOptions: string[] = [];
	for (const group of debugOptions.value) {
		for (const row of group.rows) {
			for (const opt of row) {
				if (opt.savable) savableOptions.push(opt.id);
			}
		}
	}
	const valuesToSave: Record<string, unknown> = {};
	for (const id of savableOptions) {
		if (debugOverrides.value[id] !== undefined) valuesToSave[id] = debugOverrides.value[id];
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

const tearOff = (event: MouseEvent) => {
	let rect: DOMRect | undefined;
	const target = event.target as Element;
	const contentEl = target.closest('[role="dialog"]');
	if (contentEl) {
		rect = contentEl.getBoundingClientRect();
	}

	isPopoverOpen.value = false;

	if (rect && floatingWindowRef.value) {
		// Open window with the same position and size as the popover
		floatingWindowRef.value.open({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
	} else {
		floatingWindowRef.value?.open();
	}
};

const hasOptions = computed(() => debugOptions.value.length > 0 || !!slots["extra-content"]);

watch(
	() => vm?.value,
	async (newVm) => {
		if (newVm) {
			await newVm.ready;
			debugOptions.value = newVm.getDebugOptions().filter((grp) => grp.category === props.category);

			const defaults: Record<string, unknown> = {};
			debugOptions.value.forEach((grp) => {
				grp.rows.forEach((row) => {
					row.forEach((opt) => {
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
				});
			});
			debugOverrides.value = defaults;

			// Load saved options on top of defaults
			loadOptions();
		}
	},
	{ immediate: true },
);

watch(
	debugOverrides,
	(newVal) => {
		if (props.updateVmGlobally) {
			vm?.value?.setDebugOverrides(props.category, newVal);
			vm?.value?.refreshVideo();
			saveOptions();
		}
	},
	{ deep: true },
);

watch(floatingWindowRef, (fw) => {
	if (fw) {
		watch(
			fw.isOpen,
			(open) => {
				isTornOff.value = open;
			},
			{ immediate: true },
		);
	}
});

defineExpose({
	debugOverrides,
	debugOptions,
});
</script>
