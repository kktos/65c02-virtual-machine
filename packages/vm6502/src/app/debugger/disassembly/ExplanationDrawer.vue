<template>
	<Drawer v-model:open="isOpen">
		<DrawerContent
			overlay-class="bg-transparent"
			class="mx-auto w-1/3 min-w-[500px] border-gray-300 bg-gray-700 text-gray-100"
		>
			<DrawerHeader>
				<DrawerTitle class="text-white">Gemini Analysis</DrawerTitle>
			</DrawerHeader>
			<div class="px-2 max-h-[60vh] overflow-y-auto">
				<div
					class="min-h-[20vh] whitespace-pre-wrap font-mono text-md text-gray-300 bg-black/20 p-3 rounded border border-gray-500 flex items-center justify-center"
				>
					<div v-if="isLoading" class="text-gray-400">Analyzing...</div>
					<div v-else>
						{{ explanation }}
					</div>
				</div>
			</div>
			<DrawerFooter class="flex-row justify-end gap-2 border-t border-gray-800 pt-4">
				<Button
					variant="secondary"
					@click="$emit('saveAsNote')"
					:disabled="isLoading || !explanation"
					title="Save explanation as a note at the start marker or at begining of disassembly"
				>
					Add as a Note
				</Button>
			</DrawerFooter>
		</DrawerContent>
	</Drawer>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

const props = defineProps<{ open: boolean; explanation: string | null; isLoading: boolean }>();

const emit = defineEmits<{ (e: "update:open", value: boolean): void; (e: "saveAsNote"): void }>();

const isOpen = computed({ get: () => props.open, set: (value) => emit("update:open", value) });
</script>
