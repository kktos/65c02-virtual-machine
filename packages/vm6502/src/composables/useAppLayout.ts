import { reactive, ref } from "vue";

/**
 * The app layout: video, debugger state and code (disassembly / memory).
 *
 *   column: the video takes the whole height     top: the code takes the whole width
 *   ┌───────┬───────┐                            ┌───────┬───────┐
 *   │ video │ state │                            │ video │ state │
 *   │       ├───────┤                            ├───────┴───────┤
 *   │       │ code  │                            │     code      │
 *   └───────┴───────┘                            └───────────────┘
 *
 *   floating: the video takes the whole window, the debugger panels float over it
 *   ┌───────────────────┐
 *   │┌stk┐┌trace┐┌state┐│
 *   ││   ││     │└─────┘│
 *   │└───┘└─────┘┌code─┐│
 *   │┌mem───────┐│     ││
 *   └┴──────────┴┴─────┴┘
 *
 * column and top share the split positions (the video column width, the top row height), so switching
 * moves no element: the canvas, the disassembly scroll, the floating panels are left as they are.
 * floating keeps the state panel's elements: only its position changes (see LayoutPanel). It holds the
 * registers and flags alone there: the stack and the trace are moved (teleported) to panels of their own.
 * The code panel holds the disassembly alone, the memory viewer gets a panel of its own.
 * A floating panel can be closed: the debugger menu (a small floating menu) lists them and opens them again.
 * "auto" picks between column and top from the split positions: see `autoLayout`.
 */
export type LayoutMode = "auto" | "column" | "top" | "floating";
export type LayoutKind = Exclude<LayoutMode, "auto">;
/** The layouts with splits, the ones "auto" chooses from */
export type GridKind = Exclude<LayoutKind, "floating">;

export type PanelId = "state" | "stack" | "trace" | "code" | "memory";
/** A floating panel: position and size as fractions of the window, so they follow its size */
export interface PanelGeometry {
	x: number;
	y: number;
	w: number;
	h: number;
	/** Closed panels are hidden (not unmounted): the debugger menu opens them again */
	open: boolean;
}
/** The debugger menu's position, as fractions of the room beside it (1: flush with the right / bottom edge) */
export interface MenuPosition {
	x: number;
	y: number;
}

const LS_KEY = "vm6502-app-layout";
const MODES: LayoutMode[] = ["auto", "column", "top", "floating"];

/** Split positions, as fractions of the layout's width / height, so they follow the window size */
const DEFAULTS = { mode: "auto" as LayoutMode, col: 0.4, row: 0.41, opacity: 0.8 };

/** Registers top right, disassembly below them; stack and trace top left, memory below them */
const PANEL_DEFAULTS: Record<PanelId, PanelGeometry> = {
	state: { x: 0.56, y: 0.05, w: 0.43, h: 0.14, open: true },
	stack: { x: 0.01, y: 0.05, w: 0.15, h: 0.53, open: true },
	trace: { x: 0.17, y: 0.05, w: 0.38, h: 0.53, open: true },
	code: { x: 0.56, y: 0.2, w: 0.43, h: 0.78, open: true },
	memory: { x: 0.01, y: 0.6, w: 0.54, h: 0.38, open: true },
};

export const PANEL_IDS = Object.keys(PANEL_DEFAULTS) as PanelId[];

/** The debugger menu starts in the bottom right corner */
const MENU_DEFAULT: MenuPosition = { x: 1, y: 1 };

/** The lowest opacity: below it the panels can't be found again */
export const MIN_PANEL_OPACITY = 0.2;

const clampNumber = (value: unknown, min: number, max: number, fallback: number) =>
	typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const clampFraction = (value: unknown, fallback: number) => clampNumber(value, 0.05, 0.95, fallback);

const loadPanel = (saved: Partial<PanelGeometry> | undefined, defaults: PanelGeometry): PanelGeometry => ({
	x: clampNumber(saved?.x, 0, 1, defaults.x),
	y: clampNumber(saved?.y, 0, 1, defaults.y),
	w: clampNumber(saved?.w, 0.05, 1, defaults.w),
	h: clampNumber(saved?.h, 0.05, 1, defaults.h),
	open: typeof saved?.open === "boolean" ? saved.open : defaults.open,
});

const load = () => {
	let saved: Record<string, any> = {};
	try {
		saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") ?? {};
	} catch {
		// Unreadable: the defaults
	}
	return {
		mode: MODES.includes(saved.mode) ? (saved.mode as LayoutMode) : DEFAULTS.mode,
		col: clampFraction(saved.col, DEFAULTS.col),
		row: clampFraction(saved.row, DEFAULTS.row),
		opacity: clampNumber(saved.opacity, MIN_PANEL_OPACITY, 1, DEFAULTS.opacity),
		panels: Object.fromEntries(
			PANEL_IDS.map((id) => [id, loadPanel(saved.panels?.[id], PANEL_DEFAULTS[id])]),
		) as Record<PanelId, PanelGeometry>,
		menu: {
			x: clampNumber(saved.menu?.x, 0, 1, MENU_DEFAULT.x),
			y: clampNumber(saved.menu?.y, 0, 1, MENU_DEFAULT.y),
		},
	};
};

const saved = load();
const mode = ref<LayoutMode>(saved.mode);
const col = ref(saved.col);
const row = ref(saved.row);
/** The floating panels' opacity */
const opacity = ref(saved.opacity);
const panels = reactive<Record<PanelId, PanelGeometry>>(saved.panels);
const menu = reactive<MenuPosition>(saved.menu);
/** The last panel asked to be shown (seq: so asking again for the same one is seen) */
const revealed = ref<{ id: PanelId; seq: number } | null>(null);
/** The layout actually displayed (auto resolved): set by the layout component, shown by the picker */
const kind = ref<LayoutKind>(saved.mode === "auto" ? "column" : saved.mode);

const save = () => {
	try {
		localStorage.setItem(
			LS_KEY,
			JSON.stringify({ mode: mode.value, col: col.value, row: row.value, opacity: opacity.value, panels, menu }),
		);
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
export const autoLayout = (colWidth: number, rowHeight: number, aspect: number, headerHeight: number): GridKind => {
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

	const setOpacity = (value: number) => {
		opacity.value = clampNumber(value, MIN_PANEL_OPACITY, 1, DEFAULTS.opacity);
		save();
	};

	/** Put the floating panels back where they start, all open, and the debugger menu in its corner */
	const resetPanels = () => {
		for (const id of PANEL_IDS) Object.assign(panels[id], PANEL_DEFAULTS[id]);
		Object.assign(menu, MENU_DEFAULT);
		save();
	};

	const setPanelOpen = (id: PanelId, value: boolean) => {
		panels[id].open = value;
		save();
	};

	/** Bring a floating panel to the front, opened if closed (nothing happens when docked) */
	const revealPanel = (id: PanelId) => {
		revealed.value = { id, seq: (revealed.value?.seq ?? 0) + 1 };
	};

	return {
		mode,
		col,
		row,
		kind,
		opacity,
		panels,
		menu,
		revealed,
		setMode,
		setOpacity,
		resetPanels,
		setPanelOpen,
		revealPanel,
		save,
	};
}
