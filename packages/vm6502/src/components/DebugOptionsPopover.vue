<template>
	<Popover v-if="hasOptions">
		<PopoverTrigger as-child>
			<slot>
				<!-- Default trigger -->
				<Button variant="outline" size="sm" class="h-[30px] px-2 text-xs bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white">
					<Settings2 class="mr-2 h-3 w-3" />
					Options
				</Button>
			</slot>
		</PopoverTrigger>
		<PopoverContent :class="contentClass" :align="align">
			<div class="space-y-3">
				<div v-for="opt in debugOptions" :key="opt.id" class="flex items-center justify-between">
					<label :for="opt.id" class="text-xs text-gray-300 select-none cursor-pointer flex-grow">{{ opt.label }}</label>
					<input
						v-if="opt.type === 'boolean'"
						type="checkbox"
						:id="opt.id"
						v-model="debugOverrides[opt.id]"
						class="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500 h-4 w-4 ml-2"
					/>
					<select
						v-if="opt.type === 'select'"
						:id="opt.id"
						v-model="debugOverrides[opt.id]"
						class="bg-gray-700 text-yellow-300 font-mono text-xs rounded-md px-2 py-0.5 border border-gray-600 focus:ring-2 focus:ring-cyan-500 outline-none ml-2 max-w-[120px]"
					>
						<option v-for="option in opt.options" :key="option.value" :value="option.value">{{ option.label }}</option>
					</select>
					<input
						v-if="opt.type === 'number'"
						type="number"
						:id="opt.id"
						:min="opt.min"
						:max="opt.max"
						v-model.number="debugOverrides[opt.id]"
						class="bg-gray-700 text-yellow-300 font-mono text-xs rounded-md px-2 py-0.5 border border-gray-600 focus:ring-2 focus:ring-cyan-500 outline-none ml-2 w-20"
					/>
				</div>
			</div>
		</PopoverContent>
	</Popover>
</template>

<script lang="ts" setup>
import { Settings2 } from "lucide-vue-next";
import { computed, inject, type Ref, ref, watch } from "vue";
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
	contentClass: "w-64 p-4 bg-gray-800 border-gray-700 text-gray-100",
});

const vm = inject<Ref<VirtualMachine>>("vm");
const debugOptions = ref<DebugOption[]>([]);
const debugOverrides = ref<Record<string, unknown>>({});

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
	}
}, { immediate: true });

watch(debugOverrides, (newVal) => {
	if (props.updateVmGlobally) {
		vm?.value?.setDebugOverrides(newVal);
	}
}, { deep: true });

defineExpose({
	debugOverrides,
    debugOptions,
});
</script>
