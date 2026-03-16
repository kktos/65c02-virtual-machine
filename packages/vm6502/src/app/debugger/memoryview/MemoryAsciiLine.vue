<template>
	<template v-for="byteIndex in bytesPerLine" :key="byteIndex">
		<template v-if="isEditing(byteIndex - 1)">
			<input
				type="text"
				:value="editingValue"
				:ref="(el) => emit('set-ref', el, getGlobalIndex(byteIndex - 1))"
				@keydown="onKeyDown(byteIndex - 1, $event)"
				@input="onInput(byteIndex - 1, $event)"
				@blur="onBlur"
				maxlength="1"
				class="w-[1.2ch] text-center bg-yellow-600 focus:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded-none tabular-nums text-xs p-0 border-none font-bold"
			/>
		</template>
		<template v-else>
			<div
				@dblclick="onDblClick(byteIndex - 1)"
				@mousedown="onMouseDown(byteIndex - 1, $event)"
				@mouseenter="onMouseEnter(byteIndex - 1)"
				:class="[
					'w-[1.2ch] text-center tabular-nums text-xs p-0 font-bold cursor-text select-none',
					getAsciiClass(lineData[byteIndex - 1], isHighlighted(byteIndex - 1), isCellSelected(byteIndex - 1)),
					getBreakpointClass(byteIndex - 1),
					isCellSelected(byteIndex - 1) ? '' : getDataBlockClass(byteIndex - 1),
				]"
			>
				{{ getAsciiChar(lineData[byteIndex - 1]) }}
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
	highBitEnabled: boolean;
	debugOverrides: Record<string, unknown>;
}>();

const emit = defineEmits<{
	(e: "start-editing", index: number, mode: "ascii"): void;
	(e: "start-selection", index: number, event: MouseEvent): void;
	(e: "update-selection", index: number): void;
	(e: "blur"): void;
	(e: "keydown", index: number, event: KeyboardEvent, mode: "ascii"): void;
	(e: "set-ref", el: unknown, index: number): void;
	(e: "change", index: number, target: HTMLInputElement): void;
}>();

const getGlobalIndex = (indexInLine: number) => {
	return (props.lineIndex - 1) * props.bytesPerLine + indexInLine;
};

const isEditing = (indexInLine: number) => {
	return getGlobalIndex(indexInLine) === props.editingIndex && props.editingMode === "ascii";
};

const onDblClick = (indexInLine: number) => {
	emit("start-editing", getGlobalIndex(indexInLine), "ascii");
};

const onMouseDown = (indexInLine: number, event: MouseEvent) => {
	emit("start-selection", getGlobalIndex(indexInLine), event);
};

const onMouseEnter = (indexInLine: number) => {
	emit("update-selection", getGlobalIndex(indexInLine));
};

const onBlur = () => {
	emit("blur");
};

const onKeyDown = (indexInLine: number, event: KeyboardEvent) => {
	emit("keydown", getGlobalIndex(indexInLine), event, "ascii");
};

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

const getAsciiChar = (byte: number | undefined) => {
	if (byte === undefined) return "·";
	const val = byte & 0x7f;
	if (val >= 32 && val <= 126) return String.fromCharCode(val);
	return "·";
};

const isHighlighted = (indexInLine: number) => {
	if (!props.highlightedRange) return false;
	const addr = props.lineStartAddress + indexInLine;
	return addr >= props.highlightedRange.start && addr < props.highlightedRange.start + props.highlightedRange.length;
};

const isCellSelected = (indexInLine: number) => {
	if (props.selectionAnchor === null || props.selectionHead === null) return false;
	const addr = props.lineStartAddress + indexInLine;
	const start = Math.min(props.selectionAnchor, props.selectionHead);
	const end = Math.max(props.selectionAnchor, props.selectionHead);
	return addr >= start && addr <= end;
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

const getDataBlockClass = (indexInLine: number) => {
	const addr = props.lineStartAddress + indexInLine;
	return getFormat(addr) ? "bg-indigo-900/30 text-indigo-200" : "";

	// for (const block of formattingRules.value.values()) {
	// 	let len = block.length;
	// 	if (block.type === "word") len *= 2;
	// 	if (addr >= block.address && addr < block.address + len) return "bg-indigo-900/30 text-indigo-200";
	// }
	// return "";
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
