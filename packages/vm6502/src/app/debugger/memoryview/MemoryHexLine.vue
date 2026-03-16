<template>
	<template v-for="byteIndex in bytesPerLine" :key="byteIndex">
		<template v-if="isEditing(byteIndex - 1)">
			<input
				type="text"
				:value="editingValue"
				:ref="(el) => emit('set-ref', el, getGlobalIndex(byteIndex - 1))"
				@keydown="onKeyDown(byteIndex - 1, $event)"
				@input="onInput(byteIndex - 1, $event)"
				@blur="emit('blur')"
				maxlength="2"
				class="w-full text-center bg-yellow-600 focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums text-xs"
			/>
		</template>
		<template v-else>
			<div
				@dblclick="onDblClick(byteIndex - 1)"
				@mousedown="onMouseDown(byteIndex - 1, $event)"
				@mouseenter="onMouseEnter(byteIndex - 1)"
				@contextmenu.prevent="onContextMenu(byteIndex - 1, $event)"
				:class="[
					'w-full text-center tabular-nums text-xs py-0.5 cursor-text select-none',
					isCellSelected(byteIndex - 1)
						? 'bg-blue-700 text-white'
						: isHighlighted(byteIndex - 1)
							? 'bg-yellow-600/50 text-white font-bold'
							: isContextMenuTarget(byteIndex - 1)
								? 'bg-gray-600 ring-1 ring-cyan-500'
								: getDataBlockClass(byteIndex - 1),
					getBreakpointClass(byteIndex - 1),
				]"
			>
				{{ lineData[byteIndex - 1]?.toString(16).toUpperCase().padStart(2, "0") ?? "  " }}
			</div>
		</template>
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
	(e: "blur"): void;
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
	const value = parseInt(target.value, 16);
	if (!Number.isNaN(value) && value >= 0 && value <= 0xff && props.debugOverrides) {
		vm?.value.writeDebug(props.lineStartAddress + indexInLine, value, props.debugOverrides);
	}
	emit("change", getGlobalIndex(indexInLine), target);
};

const isContextMenuTarget = (indexInLine: number) =>
	props.contextMenu.isOpen && props.contextMenu.address === props.lineStartAddress + indexInLine;

const onContextMenu = (indexInLine: number, event: MouseEvent) =>
	emit("contextmenu", getGlobalIndex(indexInLine), event);
</script>
