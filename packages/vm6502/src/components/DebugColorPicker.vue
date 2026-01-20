<template>
	<Popover v-model:open="isOpen">
		<PopoverTrigger as-child>
			<button
				:id="id"
				:disabled="disabled"
				class="h-5 w-8 rounded border border-gray-600 flex items-center justify-center overflow-hidden focus:ring-2 focus:ring-cyan-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed ml-2 flex-shrink-0"
				:class="!selectedColor ? 'bg-gray-800' : ''"
				:style="selectedColor ? { backgroundColor: selectedColor } : {}"
				:title="selectedLabel"
			>
				<span v-if="!selectedColor" class="text-[10px] text-gray-400 font-mono">A</span>
			</button>
		</PopoverTrigger>
		<PopoverContent class="w-auto p-2 bg-gray-800 border-gray-700" align="end">
			<div class="grid grid-cols-4 gap-1">
				<button
					v-for="opt in options"
					:key="opt.value"
					@click="select(opt.value)"
					class="w-6 h-6 rounded-sm border border-gray-600 hover:border-white focus:outline-none focus:ring-1 focus:ring-cyan-500 relative flex items-center justify-center"
					:style="opt.color ? { backgroundColor: opt.color } : {}"
					:title="opt.label"
				>
					<span v-if="!opt.color" class="text-[10px] text-gray-400 font-mono">A</span>
					<Check v-if="modelValue === opt.value" class="w-3 h-3 text-white drop-shadow-md absolute inset-0 m-auto" :class="isLight(opt.color) ? 'text-black' : 'text-white'" />
				</button>
			</div>
		</PopoverContent>
	</Popover>
</template>

<script lang="ts" setup>
import { Check } from "lucide-vue-next";
import { computed, ref } from "vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const props = defineProps<{
	modelValue: unknown;
	options: { label: string; value: string | number; color?: string }[];
	id?: string;
	disabled?: boolean;
}>();

const emit = defineEmits(["update:modelValue"]);
const isOpen = ref(false);

const selectedColor = computed(() => {
	const opt = props.options.find((o) => o.value === props.modelValue);
	return opt?.color;
});

const selectedLabel = computed(() => {
	const opt = props.options.find((o) => o.value === props.modelValue);
	return opt?.label ?? "Select Color";
});

const select = (value: string | number) => {
	emit("update:modelValue", value);
	isOpen.value = false;
};

const isLight = (color?: string) => {
	if (!color) return false;
	const hex = color.replace("#", "");
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	return r * 0.299 + g * 0.587 + b * 0.114 > 186;
};
</script>
