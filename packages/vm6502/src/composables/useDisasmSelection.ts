import { ref, computed } from "vue";

export function useDisasmSelection(getOrderedAddrs: () => number[]) {
	const selectedAddrs = ref<Set<number>>(new Set());
	const lastClickedAddr = ref<number | null>(null);

	/** Sorted list of currently selected addresses */
	const selectedList = computed(() => [...selectedAddrs.value].sort((a, b) => a - b));

	const isSelected = (addr: number) => selectedAddrs.value.has(addr);

	function handleClick(addr: number, event: MouseEvent) {
		const ordered = getOrderedAddrs();

		if (event.shiftKey && lastClickedAddr.value !== null) {
			// ── Range select ──────────────────────────────────────────────────
			const anchorIdx = ordered.indexOf(lastClickedAddr.value);
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
			}
		} else if (event.ctrlKey || event.metaKey) {
			// ── Toggle individual ─────────────────────────────────────────────
			const next = new Set(selectedAddrs.value);
			if (next.has(addr)) next.delete(addr);
			else next.add(addr);
			selectedAddrs.value = next;
			lastClickedAddr.value = addr;
		} else {
			// ── Single select (deselect if sole selection) ────────────────────
			if (selectedAddrs.value.size === 1 && selectedAddrs.value.has(addr)) {
				selectedAddrs.value = new Set();
				lastClickedAddr.value = null;
				return;
			}
			selectedAddrs.value = new Set([addr]);
			lastClickedAddr.value = addr;
		}

		if (!event.shiftKey) lastClickedAddr.value = addr;
	}

	function clearSelection() {
		selectedAddrs.value = new Set();
		lastClickedAddr.value = null;
	}

	return { selectedAddrs, selectedList, lastClickedAddr, isSelected, handleClick, clearSelection };
}
