<template>
	<template v-if="isEditing(byteOffsetInLine)">
		<input
			type="text"
			:value="editingValue"
			:ref="(el) => emit('set-ref', el, getGlobalIndex(byteOffsetInLine))"
			@keydown="onKeyDown(byteOffsetInLine, $event)"
			@input="onInput(byteOffsetInLine, $event)"
			@blur="emit('blur', getGlobalIndex(byteOffsetInLine))"
			maxlength="2"
			class="w-full text-center bg-yellow-600 focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums text-xs"
		/>
	</template>
	<template v-else>
		<div
			@dblclick="onDblClick(byteOffsetInLine)"
			@mousedown="onMouseDown(byteOffsetInLine, $event)"
			@mouseenter="onMouseEnter(byteOffsetInLine)"
			@contextmenu.prevent="onContextMenu(byteOffsetInLine, $event)"
			:class="[
				'w-full text-center tabular-nums text-xs py-0.5 cursor-text select-none',
				isCellSelected(byteOffsetInLine)
					? 'bg-blue-700 text-white'
					: isHighlighted(byteOffsetInLine)
						? 'bg-yellow-600/50 text-white font-bold'
						: isContextMenuTarget(byteOffsetInLine)
							? 'bg-gray-600 ring-1 ring-cyan-500'
							: getDataBlockClass(byteOffsetInLine),
				getBreakpointClass(byteOffsetInLine),
			]"
		>
			{{ lineData[byteOffsetInLine]?.toString(16).toUpperCase().padStart(2, "0") ?? "  " }}
		</div>
	</template>
</template>

<script lang="ts" setup>
import { type MemoryLineProps, useMemoryLine } from "./useMemoryLine";

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
	contextMenu: { isOpen: boolean; address: number };
	debugOverrides: Record<string, unknown>;
}>();

const emit = defineEmits<{
	(e: "start-editing", index: number, mode: "hex"): void;
	(e: "start-selection", index: number, event: MouseEvent): void;
	(e: "update-selection", index: number): void;
	(e: "contextmenu", index: number, event: MouseEvent): void;
	(e: "blur", index: number): void;
	(e: "keydown", index: number, event: KeyboardEvent, mode: "hex"): void;
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
} = useMemoryLine(props as MemoryLineProps, emit, "hex");

const onInput = (indexInLine: number, event: Event) => {
	const target = event.target as HTMLInputElement;
	emit("change", getGlobalIndex(indexInLine), target);
};

const isContextMenuTarget = (indexInLine: number) =>
	props.contextMenu.isOpen && props.contextMenu.address === props.lineStartAddress + indexInLine;

const onContextMenu = (indexInLine: number, event: MouseEvent) =>
	emit("contextmenu", getGlobalIndex(indexInLine), event);
</script>
