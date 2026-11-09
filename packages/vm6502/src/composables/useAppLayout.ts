import { ref } from "vue";

/**
 * The app layout: video, debugger state and code (disassembly / memory) in one grid with two splits.
 *
 *   column: the video takes the whole height     top: the code takes the whole width
 *   ┌───────┬───────┐                            ┌───────┬───────┐
 *   │ video │ state │                            │ video │ state │
 *   │       ├───────┤                            ├───────┴───────┤
 *   │       │ code  │                            │     code      │
 *   └───────┴───────┘                            └───────────────┘
 *
 * Both layouts share the split positions (the video column width, the top row height), so switching
 * moves no element: the canvas, the disassembly scroll, the floating panels are left as they are.
 * "auto" picks the layout from those positions: see `autoLayout`.
 */
export type LayoutMode = "auto" | "column" | "top";
export type LayoutKind = Exclude<LayoutMode, "auto">;

const LS_KEY = "vm6502-app-layout";

/** Split positions, as fractions of the layout's width / height, so they follow the window size */
const DEFAULTS = { mode: "auto" as LayoutMode, col: 0.4, row: 0.41 };

const clampFraction = (value: unknown, fallback: number) =>
	typeof value === "number" && Number.isFinite(value) ? Math.min(0.95, Math.max(0.05, value)) : fallback;

const load = () => {
	try {
		const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
		return {
			mode: ["auto", "column", "top"].includes(saved.mode) ? (saved.mode as LayoutMode) : DEFAULTS.mode,
			col: clampFraction(saved.col, DEFAULTS.col),
			row: clampFraction(saved.row, DEFAULTS.row),
		};
	} catch {
		return { ...DEFAULTS };
	}
};

const saved = load();
const mode = ref<LayoutMode>(saved.mode);
const col = ref(saved.col);
const row = ref(saved.row);
/** The layout actually displayed (auto resolved): set by the layout component, shown by the picker */
const kind = ref<LayoutKind>(saved.mode === "top" ? "top" : "column");

const save = () => {
	try {
		localStorage.setItem(LS_KEY, JSON.stringify({ mode: mode.value, col: col.value, row: row.value }));
	} catch {
		// Storage unavailable (private mode, quota): the layout just won't be remembered
	}
};

/**
 * The auto rule: when the video, at the width of its column, is no taller than the top row, the space
 * below it would be wasted, so the code takes the whole width. Otherwise the video keeps the whole height.
 * It only depends on the split positions, which a layout switch doesn't change: it can't flip back and forth.
 *
 * @param colWidth      the video column width (px)
 * @param rowHeight     the top row height (px)
 * @param aspect        the video width / height
 * @param headerHeight  what sits above the video in its column (the machine toolbar, px)
 */
export const autoLayout = (colWidth: number, rowHeight: number, aspect: number, headerHeight: number): LayoutKind => {
	if (colWidth <= 0 || rowHeight <= 0 || !(aspect > 0)) return "column";
	const videoHeight = colWidth / aspect + headerHeight;
	// A pixel of slack: a split fitted to the video lands on it, give or take the rounding
	return videoHeight <= rowHeight + 1 ? "top" : "column";
};

export function useAppLayout() {
	const setMode = (value: LayoutMode) => {
		mode.value = value;
		save();
	};

	return { mode, col, row, kind, setMode, save };
}
