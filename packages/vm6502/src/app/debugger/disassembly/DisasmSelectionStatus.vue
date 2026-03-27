<template>
	<div class="flex items-center gap-4 shrink-0 mt-3 p-2 bg-gray-900 rounded-md border border-gray-700">
		<div class="flex items-center gap-2 text-xs font-mono">
			<span class="text-cyan-300">{{ formatAddress(start ?? 0) }} - {{ formatAddress(end ?? 0) }}</span>
		</div>
		<div class="flex items-center pl-2 border-l border-gray-700">
			<Button
				title="Add/Edit a label"
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 hover:bg-gray-200 hover:text-gray-200"
				@click="$emit('format', 'byte')"
				><Kbd class="bg-gray-600 text-gray-100">L</Kbd></Button
			>
			<Button
				title="Add/Edit a block comment"
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 hover:bg-gray-200 hover:text-gray-200"
				@click="addBlockComment()"
				><Kbd class="bg-gray-600 text-gray-100">C</Kbd></Button
			>
		</div>
		<div class="flex items-center pl-2 border-l border-gray-700">
			<Button
				title="Format as an instruction"
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 hover:bg-gray-200 hover:text-gray-200"
				@click="setregion('code')"
				><Kbd class="bg-gray-600 text-gray-100">I</Kbd></Button
			>
			<Button
				title="Format as a byte"
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 hover:bg-gray-200 hover:text-gray-200"
				@click="setregion('byte')"
				><Kbd class="bg-gray-600 text-gray-100">B</Kbd></Button
			>
			<Button
				title="Format as a word"
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 hover:bg-gray-200 hover:text-gray-200"
				@click="setregion('word')"
				><Kbd class="bg-gray-600 text-gray-100">W</Kbd></Button
			>
			<Button
				title="Format as a string"
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 hover:bg-gray-200 hover:text-gray-200"
				@click="setregion('string')"
				><Kbd class="bg-gray-600 text-gray-100">S</Kbd></Button
			>
		</div>
		<div class="flex-1 flex justify-end">
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6 text-gray-400 hover:text-red-400"
				@click="clearSelection()"
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
import { formatAddress } from "@/lib/hex.utils";
import { useDisasmSelection } from "@/composables/useDisasmSelection";
import { Kbd } from "@/components/ui/kbd";
import { useFormatting } from "@/composables/useDataFormattings";
import { useComments } from "@/composables/useComments";

const emit = defineEmits<{
	(e: "editBlockComment", addr: number): void;
}>();

const { clearSelection, startSelectionAddr: start, endSelectionAddr: end } = useDisasmSelection();
const { addFormatting, removeFormatting } = useFormatting();
const { addComment, getBlockComment } = useComments();

const addBlockComment = () => {
	const addr = start.value ?? 0;
	if (!getBlockComment(addr)) {
		addComment(addr, { kind: "block", source: "user", text: " " });
	}
	emit("editBlockComment", addr);
};

const setregion = (type: "byte" | "word" | "string" | "code") => {
	if (start.value === null || end.value === null) return;
	if (type === "code") removeFormatting(start.value);
	else addFormatting(start.value, type, end.value - start.value + 1);
};
</script>
