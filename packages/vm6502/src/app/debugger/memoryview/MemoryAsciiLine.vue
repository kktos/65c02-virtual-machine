<template>
	<template v-if="isEditing(byteOffsetInLine)">
		<input
			type="text"
			:value="editingValue"
			:ref="(el) => emit('set-ref', el, getGlobalIndex(byteOffsetInLine))"
			@keydown="onKeyDown(byteOffsetInLine, $event)"
			@input="onInput(byteOffsetInLine, $event)"
			@blur="onBlur(byteOffsetInLine)"
			maxlength="1"
			class="w-[1.2ch] text-center bg-yellow-600 focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums text-xs p-0 border-none font-bold"
		/>
	</template>
	<template v-else>
		<div
			@dblclick="onDblClick(byteOffsetInLine)"
			@mousedown="onMouseDown(byteOffsetInLine, $event)"
			@mouseenter="onMouseEnter(byteOffsetInLine)"
			:class="[
				'w-[1.2ch] text-center tabular-nums text-xs p-0 font-bold cursor-text select-none',
				getAsciiClass(
					lineData[byteOffsetInLine],
					isHighlighted(byteOffsetInLine),
					isCellSelected(byteOffsetInLine),
				),
				getBreakpointClass(byteOffsetInLine),
				isCellSelected(byteOffsetInLine) ? '' : getDataBlockClass(byteOffsetInLine),
			]"
		>
			{{ getAsciiChar(lineData[byteOffsetInLine]) }}
		</div>
	</template>
</template>

<script lang="ts" setup>
import { inject, type Ref } from "vue";
import { type MemoryLineProps, useMemoryLine } from "./useMemoryLine";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");

const props = defineProps<{
	lineIndex: number;
	lineData: Uint8Array;
	lineStartAddress: number;
	bytesPerLine: number;
	byteOffsetInLine: number;
	editingIndex: number | null;
	editingMode: "hex" | "ascii" | null;
	editingValue: string;
	selectionAnchor: number | null;
	selectionHead: number | null;
	highlightedRange: { start: number; length: number } | null;
	highBitEnabled: boolean;
	debugOverrides: Record<string, unknown>;
}>();

const emit = defineEmits<{
	(e: "start-editing", index: number, mode: "ascii"): void;
	(e: "start-selection", index: number, event: MouseEvent): void;
	(e: "update-selection", index: number): void;
	(e: "blur", index: number): void;
	(e: "keydown", index: number, event: KeyboardEvent, mode: "ascii"): void;
	(e: "set-ref", el: unknown, index: number): void;
	(e: "change", index: number, target: HTMLInputElement): void;
}>();

const {
	getGlobalIndex,
	isEditing,
	onDblClick,
	onMouseDown,
	onMouseEnter,
	onKeyDown,
	isHighlighted,
	isCellSelected,
	getBreakpointClass,
	getDataBlockClass,
} = useMemoryLine(props as MemoryLineProps, emit, "ascii");

const onInput = (indexInLine: number, event: Event) => {
	const target = event.target as HTMLInputElement;
	const val = target.value;
	if (val.length > 0) {
		let code = val.charCodeAt(0);
		if (props.highBitEnabled) code |= 0x80;
		if (props.debugOverrides) {
			vm?.value.writeDebug(props.lineStartAddress + indexInLine, code, props.debugOverrides);
		}
		emit("change", getGlobalIndex(indexInLine), target);
	}
};

const onBlur = (indexInLine: number) => emit("blur", getGlobalIndex(indexInLine));

const getAsciiChar = (byte: number | undefined) => {
	if (byte === undefined) return "·";
	const val = byte & 0x7f;
	if (val >= 32 && val <= 126) return String.fromCharCode(val);
	return "·";
};

const getAsciiClass = (byte: number | undefined, highlighted = false, selected = false) => {
	if (selected) return "bg-blue-700 text-white";
	if (highlighted) return "bg-yellow-600 text-white";
	if (byte === undefined) return "text-gray-500";
	const val = byte & 0x7f;
	if (val < 0x20) return "text-gray-500";
	return byte & 0x80 ? "bg-transparent text-green-300" : "bg-green-300 text-black";
};
</script>
