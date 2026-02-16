<template>
	<Popover :open="isOpen" @update:open="(val) => $emit('update:isOpen', val)">
		<PopoverTrigger as-child>
			<div class="fixed w-0 h-0 invisible" :style="{ top: y + 'px', left: x + 'px' }"></div>
		</PopoverTrigger>
		<PopoverContent class="w-64 p-3 bg-gray-800 border-gray-700 text-gray-200" align="start" side="bottom" :side-offset="5">
			<div class="text-xs font-semibold text-gray-400 mb-2">
				Edit Label for {{ formatAddress(address) }}
			</div>
			<div class="flex gap-2">
				<input
					v-model="localLabel"
					@keydown.enter="handleSave"
					class="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs focus:border-cyan-500 focus:outline-none text-gray-200"
					placeholder="Label name..."
					ref="inputRef"
				/>
				<button @click="handleSave" class="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs">
					<Save class="h-4 w-4"/>
				</button>
				<button @click="handleDelete" v-if="hasExisting" class="text-[10px] text-red-400 hover:text-red-300">
					<Trash2 class="h-4 w-4"/>
				</button>
			</div>
		</PopoverContent>
	</Popover>
</template>

<script lang="ts" setup>
import { Save, Trash2 } from "lucide-vue-next";
import { nextTick, ref, watch } from "vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSymbols } from "@/composables/useSymbols";

const props = defineProps<{
	isOpen: boolean;
	x: number;
	y: number;
	address: number;
}>();

const emit = defineEmits<(e: 'update:isOpen', value: boolean) => void>();

const { getLabelForAddress, addSymbol, removeSymbol } = useSymbols();

const localLabel = ref("");
const hasExisting = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

const formatAddress = (addr: number) => {
	const bank = ((addr >> 16) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
	const offset = (addr & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
	return `$${bank}:${offset}`;
};

watch(() => props.isOpen, (val) => {
	if (val) {
		const existing = getLabelForAddress(props.address);
		localLabel.value = existing || "";
		hasExisting.value = !!existing;
		nextTick(() => inputRef.value?.focus());
	}
});

const handleSave = () => {
	if (localLabel.value.trim()) {
		addSymbol(props.address, localLabel.value.trim());
	}
	emit('update:isOpen', false);
};

const handleDelete = () => {
	removeSymbol(props.address);
	emit('update:isOpen', false);
};
</script>
