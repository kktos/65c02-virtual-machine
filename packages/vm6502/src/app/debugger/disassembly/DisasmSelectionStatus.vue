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
				@click="addLabel"
				:disabled="start !== end"
				><Kbd class="bg-gray-600 text-gray-100">L</Kbd></Button
			>
			<Button
				title="Add/Edit a block comment"
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 hover:bg-gray-200 hover:text-gray-200"
				@click="addBlockComment"
				:disabled="start !== end"
				><Kbd class="bg-gray-600 text-gray-100">C</Kbd></Button
			>
		</div>
		<div class="flex items-center pl-2 border-l border-gray-700">
			<Button
				title="Format as an instruction"
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 hover:bg-gray-200 hover:text-gray-200"
				@click="setDataRegion('code')"
				><Kbd class="bg-gray-600 text-gray-100">I</Kbd></Button
			>
			<Button
				title="Format as a byte"
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 hover:bg-gray-200 hover:text-gray-200"
				@click="setDataRegion('byte')"
				><Kbd class="bg-gray-600 text-gray-100">B</Kbd></Button
			>
			<Button
				title="Format as a word"
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 hover:bg-gray-200 hover:text-gray-200"
				@click="setDataRegion('word')"
				><Kbd class="bg-gray-600 text-gray-100">W</Kbd></Button
			>
			<Button
				title="Format as a string"
				size="sm"
				variant="ghost"
				class="h-6 px-2 text-xs border-gray-600 hover:bg-gray-200 hover:text-gray-200"
				@click="setDataRegion('string')"
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
import { formatAddress, toHex } from "@/lib/hex.utils";
import { useDisasmSelection } from "@/composables/useDisasmSelection";
import { Kbd } from "@/components/ui/kbd";
import { useFormatting } from "@/composables/useDataFormattings";
import { useComments } from "@/composables/useComments";
import { useSymbols } from "@/composables/useSymbols";

const { clearSelection, startSelectionAddr: start, endSelectionAddr: end } = useDisasmSelection();
const { addFormatting, removeFormatting } = useFormatting();
const { addComment, getBlockComment, editingBlockCommentAddr } = useComments();
const { getLabelForAddress, addSymbol } = useSymbols();

const addLabel = async () => {
	if (start.value === null) return;
	const existing = getLabelForAddress(start.value);
	if (existing) return;
	await addSymbol(start.value, `L${toHex(start.value, 4)}`);
};
const addBlockComment = () => {
	const addr = start.value ?? 0;
	if (!getBlockComment(addr)) {
		addComment(addr, { kind: "block", source: "user", text: " " });
		editingBlockCommentAddr.value = addr;
	}
};

const setDataRegion = (type: "byte" | "word" | "string" | "code") => {
	if (start.value === null || end.value === null) return;
	if (type === "code") removeFormatting(start.value);
	else addFormatting(start.value, type, end.value - start.value + 1);
};
</script>
