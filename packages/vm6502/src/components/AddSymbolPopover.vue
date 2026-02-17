<template>
	<Popover :open="isOpen" @update:open="(val) => $emit('update:isOpen', val)">
		<PopoverTrigger as-child>
			<div class="fixed w-0 h-0 invisible" :style="{ top: y + 'px', left: x + 'px' }"></div>
		</PopoverTrigger>
		<PopoverContent class="w-64 p-3 bg-gray-800 border-gray-700 text-gray-200" align="start" side="bottom" :side-offset="5">
			<div class="text-xs font-semibold text-gray-400 mb-3">
				Edit Address {{ formatAddress(address) }}
			</div>

			<div class="space-y-3">
				<!-- Label Section -->
				<div class="space-y-1">
					<label class="text-[10px] uppercase text-gray-500 font-bold">Label</label>
					<input
						v-model="localLabel"
						@keydown.enter="handleSave"
						class="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs focus:border-cyan-500 focus:outline-none text-gray-200"
						placeholder="Label name..."
						ref="inputRef"
					/>
				</div>

				<!-- Data Type Section -->
				<div class="space-y-1">
					<label class="text-[10px] uppercase text-gray-500 font-bold">Data Type</label>
					<div class="flex gap-2">
						<select
							v-model="selectedType"
							class="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs focus:border-cyan-500 focus:outline-none text-gray-200"
						>
							<option value="code">Instruction</option>
							<option value="byte">Byte</option>
							<option value="word">Word</option>
							<option value="string">String</option>
						</select>
						<input
							v-if="selectedType !== 'code'"
							v-model.number="dataLength"
							type="number"
							min="1"
							class="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs focus:border-cyan-500 focus:outline-none text-gray-200 text-center"
							placeholder="Len"
							title="Length (bytes/words)"
						/>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex justify-end gap-2 pt-1">
					<button
						v-if="hasExisting || hasExistingFormat"
						@click="handleDelete"
						class="px-2 py-1 text-red-400 hover:text-red-300 text-xs hover:bg-red-900/20 rounded"
					>
						Delete
					</button>
					<button
						@click="handleSave"
						class="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs flex items-center gap-1"
					>
						<Save class="h-3 w-3" />
						Save
					</button>
				</div>
			</div>
		</PopoverContent>
	</Popover>
</template>

<script lang="ts" setup>
import { Save } from "lucide-vue-next";
import { nextTick, ref, watch } from "vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type DataType, useFormatting } from "@/composables/useFormatting";
import { useSymbols } from "@/composables/useSymbols";

const props = defineProps<{
	isOpen: boolean;
	x: number;
	y: number;
	address: number;
	initialLength?: number;
}>();

const emit = defineEmits<(e: 'update:isOpen', value: boolean) => void>();

const { getLabelForAddress, addSymbol, removeSymbol } = useSymbols();
const { getFormat, addFormat, removeFormat } = useFormatting();

const localLabel = ref("");
const hasExisting = ref(false);
const hasExistingFormat = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

const selectedType = ref<DataType>('code');
const dataLength = ref(1);

const formatAddress = (addr: number) => {
	const bank = ((addr >> 16) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
	const offset = (addr & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
	return `$${bank}:${offset}`;
};

watch(() => props.isOpen, (val) => {
	if (val) {
		// Load Label
		const existing = getLabelForAddress(props.address);
		localLabel.value = existing || "";
		hasExisting.value = !!existing;

		// Load Format
		const format = getFormat(props.address);
		if (format) {
			selectedType.value = format.type;
			dataLength.value = format.length;
			hasExistingFormat.value = true;
		} else {
			selectedType.value = 'code';
			dataLength.value = props.initialLength || 1;
			hasExistingFormat.value = false;
		}

		nextTick(() => inputRef.value?.focus());
	}
});

const handleSave = () => {
	// Save Label
	if (localLabel.value.trim()) {
		addSymbol(props.address, localLabel.value.trim());
	} else if (hasExisting.value) {
		removeSymbol(props.address);
	}

	// Save Format
	if (selectedType.value !== 'code') {
		addFormat(props.address, selectedType.value, dataLength.value || 1);
	} else if (hasExistingFormat.value) {
		removeFormat(props.address);
	}

	emit('update:isOpen', false);
};

const handleDelete = () => {
	removeSymbol(props.address);
	removeFormat(props.address);
	emit('update:isOpen', false);
};
</script>
