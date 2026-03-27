import { ref, computed } from "vue";

const selectedAddrs = ref<Set<number>>(new Set());
const startSelectionAddr = ref<number | null>(null);
const endSelectionAddr = ref<number | null>(null);
const selectedList = computed(() => [...selectedAddrs.value].sort((a, b) => a - b));
const isSelected = (addr: number) => selectedAddrs.value.has(addr);

function clearSelection() {
	selectedAddrs.value = new Set();
	startSelectionAddr.value = null;
	endSelectionAddr.value = null;
}

export function useDisasmSelection(getOrderedAddrs?: () => number[]) {
	function handleClick(addr: number, event: MouseEvent) {
		const ordered = getOrderedAddrs?.() ?? [];
		if (ordered.length === 0) return;

		if (event.shiftKey && startSelectionAddr.value !== null) {
			// ── Range select ──────────────────────────────────────────────────
			const anchorIdx = ordered.indexOf(startSelectionAddr.value);
			const targetIdx = ordered.indexOf(addr);
			if (anchorIdx !== -1 && targetIdx !== -1) {
				const [from, to] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
				const range = new Set(ordered.slice(from, to + 1));
				if (event.ctrlKey || event.metaKey) {
					// Shift+Ctrl: add range to existing selection
					range.forEach((a) => selectedAddrs.value.add(a));
				} else {
					// Shift: replace selection with range
					selectedAddrs.value = range;
				}
				endSelectionAddr.value = ordered[to];
				startSelectionAddr.value = ordered[from];
			}
		} else if (event.ctrlKey || event.metaKey) {
			// ── Toggle individual ─────────────────────────────────────────────
			const next = new Set(selectedAddrs.value);
			if (next.has(addr)) next.delete(addr);
			else next.add(addr);
			selectedAddrs.value = next;
			endSelectionAddr.value = addr;
		} else {
			// ── Single select (deselect if sole selection) ────────────────────
			if (selectedAddrs.value.size === 1 && selectedAddrs.value.has(addr)) {
				selectedAddrs.value = new Set();
				startSelectionAddr.value = null;
				endSelectionAddr.value = null;
				return;
			}
			selectedAddrs.value = new Set([addr]);
			startSelectionAddr.value = addr;
			endSelectionAddr.value = addr;
		}

		if (!event.shiftKey) endSelectionAddr.value = addr;
	}

	return {
		selectedAddrs,
		selectedList,
		startSelectionAddr,
		endSelectionAddr,
		isSelected,
		handleClick,
		clearSelection,
	};
}
