<template>
	<div class="fixed z-50 pointer-events-none" :style="{ top: `${y}px`, left: `${x}px` }">
		<Popover :open="isOpen" @update:open="(val) => $emit('update:isOpen', val)">
			<PopoverTrigger as-child>
				<div class="w-0 h-0"></div>
			</PopoverTrigger>
			<PopoverContent
				class="w-64 p-0 bg-gray-800 border-gray-700 text-gray-200 pointer-events-auto max-h-64 flex flex-col"
				align="start"
				side="right"
			>
				<div class="px-3 py-2 border-b border-gray-700 font-bold text-xs text-yellow-500 bg-gray-900/50">
					References to {{ label }}
				</div>
				<div class="overflow-y-auto flex-1 p-1">
					<template v-if="references.length">
						<button
							v-for="ref in references"
							:key="ref.addr"
							class="w-full text-left px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center justify-between group"
							@click="$emit('referenceClick', ref.addr)"
						>
							<span class="font-mono text-indigo-300">{{ formatAddress(ref.addr) }}</span>
							<span class="font-mono text-gray-400 group-hover:text-white">{{ ref.line }}</span>
						</button>
					</template>
					<div v-else class="px-2 py-3 text-xs text-gray-500 text-center italic">No references found.</div>
				</div>
			</PopoverContent>
		</Popover>
	</div>
</template>

<script lang="ts" setup>
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatAddress } from "@/lib/hex.utils";

defineProps<{
	isOpen: boolean;
	x: number;
	y: number;
	label: string;
	references: { addr: number; line: string }[];
}>();

defineEmits<{
	(e: "update:isOpen", value: boolean): void;
	(e: "referenceClick", address: number): void;
}>();
</script>
