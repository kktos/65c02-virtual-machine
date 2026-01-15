<template>
	<div class="space-y-3">
		<div v-for="opt in debugOptions" :key="opt.id" class="flex items-center justify-between">
			<label :for="`${opt.id}${idSuffix}`" class="text-xs text-gray-300 select-none cursor-pointer flex-grow">{{ opt.label }}</label>
			<input
				v-if="opt.type === 'boolean'"
				type="checkbox"
				:id="`${opt.id}${idSuffix}`"
				:checked="modelValue[opt.id] as boolean"
				@change="updateValue(opt.id, ($event.target as HTMLInputElement).checked)"
				class="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500 h-4 w-4 ml-2"
			/>
			<select
				v-if="opt.type === 'select'"
				:id="`${opt.id}${idSuffix}`"
				:value="modelValue[opt.id]"
				@change="updateValue(opt.id, ($event.target as HTMLSelectElement).value)"
				class="bg-gray-700 text-yellow-300 font-mono text-xs rounded-md px-2 py-0.5 border border-gray-600 focus:ring-2 focus:ring-cyan-500 outline-none ml-2 max-w-[120px]"
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
				@input="updateValue(opt.id, ($event.target as HTMLInputElement).valueAsNumber)"
				class="bg-gray-700 text-yellow-300 font-mono text-xs rounded-md px-2 py-0.5 border border-gray-600 focus:ring-2 focus:ring-cyan-500 outline-none ml-2 w-20"
			/>
		</div>
	</div>
</template>

<script lang="ts" setup>
import type { PropType } from "vue";
import type { DebugOption } from "@/types/machine.interface";

const props = defineProps({
	debugOptions: { type: Array as PropType<DebugOption[]>, required: true },
	modelValue: { type: Object as PropType<Record<string, unknown>>, required: true },
	idSuffix: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue"]);

const updateValue = (id: string, value: unknown) => {
	const finalValue = typeof value === "number" && Number.isNaN(value) ? undefined : value;
	emit("update:modelValue", { ...props.modelValue, [id]: finalValue });
};
</script>
