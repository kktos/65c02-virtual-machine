<template>
	<div
		v-if="selectedRange && selectedRange.size > 0"
		class="flex items-center gap-4 shrink-0 mt-3 p-2 bg-gray-900 rounded-md border border-gray-700"
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
				@click="$emit('format', 'byte')"
				>Byte</Button
			>
			<Button
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-gray-200"
				@click="$emit('format', 'string')"
				>String</Button
			>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/hex.utils";

defineProps<{
	selectedRange: { start: number; end: number; size: number } | null;
}>();

defineEmits<{
	(e: "format", type: "byte" | "string"): void;
}>();
</script>
