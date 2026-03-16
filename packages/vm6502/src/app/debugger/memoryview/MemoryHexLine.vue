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
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useFormatting } from "@/composables/useDataFormattings";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");
const { breakpoints } = useBreakpoints();
const { getFormat } = useFormatting();

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

const getGlobalIndex = (indexInLine: number) => (props.lineIndex - 1) * props.bytesPerLine + indexInLine;

const isEditing = (indexInLine: number) =>
	getGlobalIndex(indexInLine) === props.editingIndex && props.editingMode === "hex";

const onDblClick = (indexInLine: number) => emit("start-editing", getGlobalIndex(indexInLine), "hex");
const onMouseDown = (indexInLine: number, event: MouseEvent) =>
	emit("start-selection", getGlobalIndex(indexInLine), event);
const onMouseEnter = (indexInLine: number) => emit("update-selection", getGlobalIndex(indexInLine));
const onContextMenu = (indexInLine: number, event: MouseEvent) =>
	emit("contextmenu", getGlobalIndex(indexInLine), event);
const onKeyDown = (indexInLine: number, event: KeyboardEvent) =>
	emit("keydown", getGlobalIndex(indexInLine), event, "hex");

const onInput = (indexInLine: number, event: Event) => {
	const target = event.target as HTMLInputElement;
	const value = parseInt(target.value, 16);
	if (!Number.isNaN(value) && value >= 0 && value <= 0xff && props.debugOverrides) {
		vm?.value.writeDebug(props.lineStartAddress + indexInLine, value, props.debugOverrides);
	}
	emit("change", getGlobalIndex(indexInLine), target);
};

const getBreakpointClass = (indexInLine: number) => {
	const addr = props.lineStartAddress + indexInLine;
	const bps = breakpoints.value.filter((b) => b.enabled && b.address === addr);
	if (bps.length === 0) return "";
	if (bps.some((b) => b.type === "access")) return "ring-2 ring-inset ring-green-500/80";
	if (bps.some((b) => b.type === "write")) return "ring-2 ring-inset ring-red-500/80";
	if (bps.some((b) => b.type === "read")) return "ring-2 ring-inset ring-yellow-500/80";
	if (bps.some((b) => b.type === "pc")) return "ring-2 ring-inset ring-indigo-500/80";
	return "";
};

const getDataBlockClass = (indexInLine: number) =>
	getFormat(props.lineStartAddress + indexInLine) ? "bg-indigo-900/30 text-indigo-200" : "";

const isHighlighted = (indexInLine: number) =>
	props.highlightedRange &&
	props.lineStartAddress + indexInLine >= props.highlightedRange.start &&
	props.lineStartAddress + indexInLine < props.highlightedRange.start + props.highlightedRange.length;
const isContextMenuTarget = (indexInLine: number) =>
	props.contextMenu.isOpen && props.contextMenu.address === props.lineStartAddress + indexInLine;
const isCellSelected = (indexInLine: number) =>
	props.selectionAnchor !== null &&
	props.selectionHead !== null &&
	props.lineStartAddress + indexInLine >= Math.min(props.selectionAnchor, props.selectionHead) &&
	props.lineStartAddress + indexInLine <= Math.max(props.selectionAnchor, props.selectionHead);
</script>
