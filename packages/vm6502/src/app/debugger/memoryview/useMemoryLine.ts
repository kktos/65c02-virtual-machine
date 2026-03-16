import { useBreakpoints } from "@/composables/useBreakpoints";
import { useFormatting } from "@/composables/useDataFormattings";

export interface MemoryLineProps {
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
	contextMenu?: { isOpen: boolean; address: number };
	debugOverrides: Record<string, unknown>;
}

export function useMemoryLine(
	props: MemoryLineProps,
	emit: (event: any, ...args: any[]) => void,
	mode: "hex" | "ascii",
) {
	const { breakpoints } = useBreakpoints();
	const { getFormat } = useFormatting();

	const getGlobalIndex = (indexInLine: number) => (props.lineIndex - 1) * props.bytesPerLine + indexInLine;

	const isEditing = (indexInLine: number) =>
		getGlobalIndex(indexInLine) === props.editingIndex && props.editingMode === mode;

	const onDblClick = (indexInLine: number) => emit("start-editing", getGlobalIndex(indexInLine), mode);

	const onMouseDown = (indexInLine: number, event: MouseEvent) =>
		emit("start-selection", getGlobalIndex(indexInLine), event);

	const onMouseEnter = (indexInLine: number) => emit("update-selection", getGlobalIndex(indexInLine));

	const onKeyDown = (indexInLine: number, event: KeyboardEvent) =>
		emit("keydown", getGlobalIndex(indexInLine), event, mode);

	const isHighlighted = (indexInLine: number) =>
		!!props.highlightedRange &&
		props.lineStartAddress + indexInLine >= props.highlightedRange.start &&
		props.lineStartAddress + indexInLine < props.highlightedRange.start + props.highlightedRange.length;

	const isCellSelected = (indexInLine: number) =>
		props.selectionAnchor !== null &&
		props.selectionHead !== null &&
		props.lineStartAddress + indexInLine >= Math.min(props.selectionAnchor, props.selectionHead) &&
		props.lineStartAddress + indexInLine <= Math.max(props.selectionAnchor, props.selectionHead);

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

	return {
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
	};
}
