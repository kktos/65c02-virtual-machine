<template>
	<TableHead @click="$emit('sort', sortKey)" class="cursor-pointer hover:bg-gray-700/50">
		<div class="flex items-center gap-2 text-gray-300">
			<slot />
			<ArrowUp v-if="currentKey === sortKey && direction === 'asc'" class="h-4 w-4" />
			<ArrowDown v-if="currentKey === sortKey && direction === 'desc'" class="h-4 w-4" />
		</div>
	</TableHead>
</template>

<script setup lang="ts">
import { ArrowDown, ArrowUp } from "lucide-vue-next";
import { TableHead } from "@/components/ui/table";

defineProps<{
	sortKey: string;
	currentKey: string;
	direction: "asc" | "desc";
}>();

defineEmits<{ (e: "sort", key: string): void }>();
</script>
