<template>
	<Accordion type="multiple" v-model="openItems" class="w-full space-y-1">
		<AccordionItem v-for="(group, gIdx) in debugOptions" :key="gIdx" :value="`item-${gIdx}`" class="border-b border-gray-700/50 last:border-0">
			<AccordionTrigger class="py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider hover:no-underline hover:text-gray-300">
				{{ group.label }}
			</AccordionTrigger>
			<AccordionContent class="pb-3 pt-1">
				<div class="space-y-3">
					<div v-for="(row, rIdx) in group.rows" :key="rIdx" class="flex items-center gap-4 min-h-[24px]">
						<div v-for="opt in row" :key="opt.id" class="flex-1 flex items-center justify-between min-w-0" :class="{ 'opacity-50': isDisabled(opt) }">
							<label :for="`${opt.id}${idSuffix}`" class="text-xs text-gray-300 select-none flex-grow flex items-center whitespace-nowrap" :class="isDisabled(opt) ? 'cursor-not-allowed' : 'cursor-pointer'">
								<span>{{ opt.label }}</span>
								<Save v-if="opt.savable" class="inline-block h-3 w-3 ml-1.5 text-gray-500 flex-shrink-0" title="This setting is saved locally" />
							</label>
							<input
								v-if="opt.type === 'boolean'"
								type="checkbox"
								:id="`${opt.id}${idSuffix}`"
								:checked="modelValue[opt.id] as boolean"
								:disabled="isDisabled(opt)"
								@change="updateValue(opt.id, ($event.target as HTMLInputElement).checked)"
								class="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500 h-4 w-4 ml-2 flex-shrink-0 disabled:cursor-not-allowed"
							/>
							<select
								v-if="opt.type === 'select'"
								:id="`${opt.id}${idSuffix}`"
								:value="modelValue[opt.id]"
								:disabled="isDisabled(opt)"
								@change="updateValue(opt.id, ($event.target as HTMLSelectElement).value)"
								class="bg-gray-700 text-yellow-300 font-mono text-xs rounded-md px-2 py-0.5 border border-gray-600 focus:ring-2 focus:ring-cyan-500 outline-none ml-2 max-w-[120px] flex-shrink-0 disabled:cursor-not-allowed"
							>
								<option v-for="option in opt.options" :key="option.value" :value="option.value">{{ option.label }}</option>
							</select>
							<input
								v-if="opt.type === 'number'"
								type="number"
								:id="`${opt.id}${idSuffix}`"
								:min="opt.min"
								:max="opt.max"
								:value="modelValue[opt.id] as number"
								:disabled="isDisabled(opt)"
								@input="updateValue(opt.id, ($event.target as HTMLInputElement).valueAsNumber)"
								class="bg-gray-700 text-yellow-300 font-mono text-xs rounded-md px-2 py-0.5 border border-gray-600 focus:ring-2 focus:ring-cyan-500 outline-none ml-2 flex-shrink-0 disabled:cursor-not-allowed"
								:class="row.length > 1 ? 'w-14' : 'w-20'"
							/>
							<DebugColorPicker
								v-if="opt.type === 'color' && opt.options"
								:id="`${opt.id}${idSuffix}`"
								:model-value="modelValue[opt.id]"
								:options="opt.options"
								:disabled="isDisabled(opt)"
								@update:model-value="updateValue(opt.id, $event)"
							/>
						</div>
					</div>
				</div>
			</AccordionContent>
		</AccordionItem>
	</Accordion>
</template>

<script lang="ts" setup>
import { Save } from "lucide-vue-next";
import { type PropType, ref, watch } from "vue";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { DebugGroup, DebugOption } from "@/types/machine.interface";
import DebugColorPicker from "./DebugColorPicker.vue";

const props = defineProps({
	debugOptions: { type: Array as PropType<DebugGroup[]>, required: true },
	modelValue: { type: Object as PropType<Record<string, unknown>>, required: true },
	idSuffix: { type: String, default: "" },
	storageKey: { type: String, default: undefined },
});

const emit = defineEmits(["update:modelValue"]);

const updateValue = (id: string, value: unknown) => {
	const finalValue = typeof value === "number" && Number.isNaN(value) ? undefined : value;
	emit("update:modelValue", { ...props.modelValue, [id]: finalValue });
};

const isDisabled = (opt: DebugOption) => {
	if (!opt.disableIf) return false;
	return props.modelValue[opt.disableIf.optionId] === opt.disableIf.value;
};

const openItems = ref<string[]>([]);

if (props.storageKey) {
	const saved = localStorage.getItem(props.storageKey);
	if (saved) {
		try {
			openItems.value = JSON.parse(saved);
		} catch (e) {
			// Ignore parse error
		}
	}
}

watch(openItems, (newVal) => {
	if (props.storageKey) localStorage.setItem(props.storageKey, JSON.stringify(newVal));
});
</script>
