<template>
	<div class="overflow-hidden font-mono text-[0.78rem] text-gray-400 relative">
		<div class="overflow-auto">
			<div :style="{ display: 'grid', gridTemplateColumns }">
				<div
					class="col-span-full grid sticky top-0 z-[5] border-b border-gray-700"
					:style="{ gridTemplateColumns }"
				>
					<div />
					<div
						v-for="col in columns"
						:key="col.key"
						class="px-1.5 py-0.5 tracking-widest uppercase opacity-80 select-none"
					>
						{{ col.label }}
					</div>
				</div>

				<template v-for="(row, idx) in rows" :key="idx">
					<BlockCommentViewer v-if="row.line.blockComment" class="col-span-full" :line="row.line" />

					<DisasmLabel
						v-if="row.line.label"
						:line="row.line"
						class="col-span-full flex items-center h-[1.6rem] px-2"
					/>

					<div
						class="col-span-full grid items-center h-[1.6rem] cursor-pointer border-b border-transparent transition-colors duration-75 even:bg-[#00000050] hover:bg-[#3194f969] hover:border-[#1e3a1e]"
						:style="{
							gridTemplateColumns,
							backgroundColor: row.highlight ? highlightColors[row.highlight] : '',
						}"
						@click="onRowClick?.(row)"
					>
						<!-- Gutter indicator -->
						<div class="flex items-center justify-center">
							<div
								:class="{ 'border-yellow-500': row.highlight === 'pc' }"
								class="border-l-4 border-transparent min-h-6"
							></div>
							<button
								@click="onToggleBreakpoint(row.line.addr)"
								class="w-full h-full flex items-center justify-center cursor-pointer group"
							>
								<span
									class="w-2 h-2 rounded-full transition-colors"
									:class="getBreakpointClass(row.line.addr)"
								></span>
							</button>
						</div>

						<!-- Data cells -->
						<div
							v-for="col in columns"
							:key="col.key"
							class="px-1.5 truncate"
							:style="{ color: columnColors[col.key] }"
							:class="[row.highlight ? HIGHLIGHT_TEXT[row.highlight] : '']"
						>
							<CellValue :col="col.key" :line="row.line" />
						</div>
					</div>
				</template>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, inject, type Ref } from "vue";
import DisasmLabel from "./DisasmLabel.vue";
import type { DisassemblyLine, DisassemblyLineKeys } from "@/types/disassemblyline.interface";
import { useSettings } from "@/composables/useSettings";
import { useBreakpoints } from "@/composables/useBreakpoints";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import BlockCommentViewer from "../BlockCommentViewer.vue";

const vm = inject<Ref<VirtualMachine>>("vm");

const { settings } = useSettings();
const { pcBreakpoints, toggleBreakpoint } = useBreakpoints();

type HighlightReason = "pc" | "breakpoint" | "selected" | "watch" | null;
interface DisassemblyRow {
	line: DisassemblyLine;
	highlight: HighlightReason;
}
interface ColumnDef {
	key: DisassemblyLineKeys;
	label: string;
	visible: boolean;
	canGrow: boolean;
}

// Column track widths for CSS grid-template-columns
const COLUMN_WIDTHS: Partial<Record<ColumnDef["key"], string>> = {
	faddr: "10ch",
	bytes: "10ch",
	opc: "17ch",
	info: "14ch",
	comment: "1fr",
	cycles: "2ch",
};
// Per-column Tailwind text colour + style classes
const COLUMN_CLASSES: Partial<Record<ColumnDef["key"], string>> = {
	faddr: "text-emerald-300 font-semibold",
	bytes: "text-emerald-700 text-[0.72rem]",
	opc: "text-yellow-300 font-bold tracking-wide",
	opr: "text-orange-300",
	info: "text-sky-300 text-[0.72rem]",
	comment: "text-emerald-800 italic",
};
// Tailwind override text colour for highlighted cells
const HIGHLIGHT_TEXT: Record<NonNullable<HighlightReason>, string> = {
	pc: "font-bold",
	breakpoint: "!text-red-300",
	selected: "!text-indigo-200",
	watch: "!text-yellow-200",
};

const props = defineProps<{
	address: number;
	lines: DisassemblyLine[];
	onRowClick?: (row: DisassemblyRow) => void;
}>();

const rows = computed(() => {
	return props.lines.map((line) => {
		return {
			line: {
				...line,
				info: getInfo(line),
				comment: line.comment,
				blockComment: getBlockComment(line),
			},
			highlight: (props.address === line.addr ? "pc" : null) as HighlightReason,
		};
	});
});

const columns = computed(() => {
	const DEFAULT_COLUMNS: ColumnDef[] = [
		{ key: "faddr", label: "ADDR", visible: true, canGrow: true },
		{ key: "bytes", label: "BYTES", visible: settings.disassembly.showBytes, canGrow: true },
		{ key: "opc", label: "OPCODE", visible: true, canGrow: true },
		{ key: "info", label: "INFO", visible: settings.disassembly.showInfo, canGrow: true },
		{ key: "comment", label: "COMMENT", visible: settings.disassembly.showComments, canGrow: true },
		{ key: "cycles", label: "#", visible: settings.disassembly.showCycles, canGrow: false },
	];

	return DEFAULT_COLUMNS.filter((c) => c.visible);
});

const columnWidths = computed(() => {
	const widths = { ...COLUMN_WIDTHS };
	for (let idx = columns.value.length - 1; idx >= 0; idx--) {
		const col = columns.value[idx];
		if (col.canGrow) {
			widths[col.key] = "minmax(0, 1fr)";
			break;
		}
	}
	return widths;
});

const columnColors = computed<Partial<Record<ColumnDef["key"], string>>>(() => {
	return {
		faddr: settings.disassembly.syntax.addr,
		bytes: settings.disassembly.syntax.bytes,
		opc: settings.disassembly.syntax.opcode,
		info: settings.disassembly.syntax.info,
		comment: settings.disassembly.syntax.comment,
	};
});

const highlightColors = computed(() => {
	return {
		pc: settings.disassembly.syntax.pcLine,
		breakpoint: "",
		selected: "",
		watch: "",
	};
});

const CellValue = defineComponent(
	(props: { col: DisassemblyLineKeys; line: DisassemblyLine }) => {
		return () => {
			if (props.col === "opc") {
				const tokens = parseOperand(props.line["opr"]);
				const children = tokens.map((token) => h("span", { style: { color: token.color } }, token.text));
				const isPseudo = props.line["opc"].startsWith(".");
				children.unshift(
					h(
						"span",
						{
							style: {
								"margin-right": ".5rem",
								color: settings.disassembly.syntax[isPseudo ? "pseudo" : "opcode"],
							},
						},
						props.line["opc"],
					),
				);
				return h("div", children);
			}
			return h("div", String(props.line[props.col]));
		};
	},
	{
		props: ["col", "line"],
	},
);

/** CSS grid-template-columns: fixed gutter + one track per visible column */
const gridTemplateColumns = computed(() => {
	const tracks = columns.value.map((c) => columnWidths.value[c.key] ?? "auto");
	return `1.4rem ${tracks.join(" ")}`;
});

const getBlockComment = (line: DisassemblyLine) => {
	const list = line.comments.filter((c) => c.source === "user" && c.kind === "block");
	return list[0]?.text ?? "";
};
const getInfo = (line: DisassemblyLine) => {
	return line.comments.filter((c) => c.source === "debugger")[0]?.text ?? "";
};

const parseOperand = (opr: string) => {
	if (!opr) return [];
	const tokens = [];
	// 1. Hex ($1234)
	// 2. Decimal (1234)
	// 3. Symbols (Label or Register)
	// 4. Punctuation
	const regex = /(\$[0-9A-Fa-f]+)|(\d+)|([a-zA-Z_][a-zA-Z0-9_.]*)|([(),#])/g;
	let match;
	let lastIndex = 0;

	while ((match = regex.exec(opr)) !== null) {
		if (match.index > lastIndex) tokens.push({ text: opr.substring(lastIndex, match.index), color: "" });

		const text = match[0];
		let color = "";

		if (match[1] || match[2]) {
			color = settings.disassembly.syntax.number;
		} else if (match[3]) {
			color = ["A", "X", "Y"].includes(text.toUpperCase())
				? settings.disassembly.syntax.register
				: settings.disassembly.syntax.label;
		} else if (match[4]) {
			color = settings.disassembly.syntax.punctuation;
		}
		tokens.push({ text, color });
		lastIndex = regex.lastIndex;
	}
	if (lastIndex < opr.length) tokens.push({ text: opr.substring(lastIndex), color: "" });
	return tokens;
};

const onToggleBreakpoint = (address: number) => toggleBreakpoint({ type: "pc", address }, vm?.value);
const getBreakpointClass = (address: number) => {
	if (!pcBreakpoints.value.has(address)) return "bg-gray-700 group-hover:bg-red-500/50";
	return pcBreakpoints.value.get(address)
		? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" // Enabled
		: "bg-transparent border-2 border-red-500/40"; // Disabled
};
</script>
