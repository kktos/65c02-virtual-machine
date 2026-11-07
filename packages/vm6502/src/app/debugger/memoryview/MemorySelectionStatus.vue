<template>
	<div
		v-if="selectedRange && selectedRange.size > 0"
		class="flex items-center gap-4 shrink-0 px-2 py-1 bg-gray-800 border-t border-gray-700"
	>
		<div class="flex items-center gap-2 text-xs font-mono">
			<span class="text-gray-400">Selection:</span>
			<span class="text-cyan-300"
				>{{ formatAddress(selectedRange.start) }} - {{ formatAddress(selectedRange.end) }}</span
			>
			<span class="text-gray-400">({{ selectedRange.size }} bytes)</span>
		</div>
		<div class="flex items-center gap-2 pl-2 border-l border-gray-700">
			<span class="text-xs text-gray-400">Format as:</span>
			<Button
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-gray-200"
				:class="formatType === 'byte' && currentTypeClass"
				:aria-pressed="formatType === 'byte'"
				@click="$emit('format', 'byte')"
				>Byte</Button
			>
			<Button
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-gray-200"
				:class="formatType === 'string' && currentTypeClass"
				:aria-pressed="formatType === 'string'"
				@click="$emit('format', 'string')"
				>String</Button
			>
			<Button
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-red-300 disabled:opacity-40"
				:disabled="!formatType"
				:title="formatType ? 'Remove this formatting' : 'The selection is not a formatting'"
				@click="$emit('format', 'none')"
				>None</Button
			>
		</div>
		<div class="flex-1 flex justify-end">
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6 text-gray-400 hover:text-red-400"
				@click="$emit('cancel-selection')"
				title="Cancel Selection (Esc)"
			>
				<X class="h-4 w-4" />
			</Button>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import type { DataType } from "@/composables/useDataFormattings";
import { formatAddress } from "@/lib/hex.utils";

defineProps<{
	selectedRange: { start: number; end: number; size: number } | null;
	/** Type of the formatting covering exactly the selection, if any */
	formatType?: DataType | null;
}>();

/** Same indigo as the formatted bytes in the memory view */
const currentTypeClass = "bg-indigo-800 text-indigo-100 hover:bg-indigo-700 hover:text-indigo-50";

defineEmits<{
	/** "none" removes the formatting the selection matches */
	(e: "format", type: "byte" | "string" | "none"): void;
	(e: "cancel-selection"): void;
}>();
</script>
