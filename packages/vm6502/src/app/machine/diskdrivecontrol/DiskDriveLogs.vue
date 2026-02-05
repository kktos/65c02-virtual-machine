<template>
	<Sheet :open="open" @update:open="$emit('update:open', $event)">
		<SheetContent side="right" class="bg-gray-900 border-gray-700 text-gray-100 w-[400px] flex flex-col h-full overflow-hidden">
			<SheetHeader class="shrink-0">
				<SheetTitle class="text-gray-100">SmartPort Logs</SheetTitle>
				<SheetDescription class="text-gray-400">
					Monitor disk read operations.
				</SheetDescription>
			</SheetHeader>

			<div class="mt-4 flex items-center justify-end shrink-0">
				<button @click="logs = []" class="text-xs text-red-400 hover:text-red-300">Clear</button>
			</div>

			<ScrollArea class="mt-4 flex-1 min-h-0 bg-black rounded border border-gray-800 p-2 font-mono text-xs">
				<div v-if="logs.length === 0" class="text-gray-600 italic text-center py-4">
					No logs yet...
				</div>
				<div v-for="(log, i) in logs" :key="i" class="mb-1">
					<span class="text-green-500">[{{ log.type }}]</span>
					<span class="text-gray-400"> Blk:</span>
					<span class="text-yellow-500">{{ log.block }}</span>
					<span class="text-gray-400"> Addr:</span>
					<span class="text-cyan-500">${{ log.address.toString(16).padStart(4, '0') }}</span>
				</div>
			</ScrollArea>

			<div class="mt-4 border-t border-gray-800 pt-4 shrink-0">
				<div class="flex justify-between items-center mb-2 px-1">
					<h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sector Map</h3>
					<span class="text-[10px] text-gray-500 font-mono">{{ uniqueBlocks }} / {{ totalBlocks }} blocks</span>
				</div>
				<div class="bg-black rounded border border-gray-800 p-1">
					<canvas ref="mapCanvas" class="w-full h-auto block" style="image-rendering: pixelated;"></canvas>
				</div>
			</div>
		</SheetContent>
	</Sheet>
</template>

<script lang="ts" setup>
import { computed, inject, nextTick, type Ref, ref, watch } from 'vue';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { useDiskMapDrawing } from '@/composables/useDiskMapDrawing';
import type { VirtualMachine } from '@/virtualmachine/virtualmachine.class';

type DiskLog = {
	type: string;
	block: number;
	address: number;
};

const props = defineProps<{
	open: boolean;
	loggingEnabled: boolean;
	fileSize: number;
}>();

const emit = defineEmits<(e: 'update:open', value: boolean) => void>();

const vm = inject<Ref<VirtualMachine>>('vm');
const logs = ref<DiskLog[]>([]);
const mapCanvas = ref<HTMLCanvasElement | null>(null);
const { drawMap } = useDiskMapDrawing();

const totalBlocks = computed(() => Math.ceil(props.fileSize / 512));
const uniqueBlocks = computed(() => new Set(logs.value.map((l) => l.block)).size);

watch(() => props.loggingEnabled, (enabled) => {
	vm?.value?.setDebugOverrides("bus", { slot: 5, smartPortLogging: enabled });
}, { immediate: true });

watch([logs, () => props.fileSize, () => props.open], () => {
	if (props.open) nextTick(() => drawMap(mapCanvas.value, props.fileSize, logs.value));
}, { deep: true });

watch(
	() => vm?.value,
	(newVm) => {
		if (newVm) {
			newVm.onLog = (log) => {
				if (props.loggingEnabled) logs.value.push(log as DiskLog);
			};
			newVm.setDebugOverrides("bus", { slot: 5, smartPortLogging: props.loggingEnabled });
		}
	},
	{ immediate: true },
);
</script>
