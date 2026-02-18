import { computed, onMounted, onUnmounted, type Ref, ref } from "vue";
import { disassemble } from "@/lib/disassembler";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

export function useDisassemblyScroll(
	vm: Ref<VirtualMachine> | undefined,
	disassembly: Ref<DisassemblyLine[]>,
	disassemblyStartAddress: Ref<number>,
	isFollowingPc: Ref<boolean>,
) {
	const scrollContainer = ref<HTMLElement | null>(null);
	const containerHeight = ref(0);
	const TABLE_ROW_HEIGHT = 20.5;
	const TABLE_HEADER_HEIGHT = 24.5;
	const PANEL_TITLE_HEIGHT = 33;
	const PANEL_TITLE_MB_HEIGHT = 12;
	let resizeObserver: ResizeObserver | null = null;

	const visibleRowCount = computed(() => {
		if (containerHeight.value === 0) return 10; // Default before mounted
		return Math.max(
			1,
			Math.floor(
				(containerHeight.value - TABLE_HEADER_HEIGHT - PANEL_TITLE_HEIGHT - PANEL_TITLE_MB_HEIGHT) / TABLE_ROW_HEIGHT,
			),
		);
	});

	const readByte = (address: number) => {
		return vm?.value.readDebug(address) ?? 0;
	};

	const findPreviousInstructionAddress = (startAddr: number): number => {
		if (startAddr <= 0) return 0;
		// Go back a few bytes (max instruction length is 3) and disassemble
		const lookbehind = 4;
		const searchStart = Math.max(0, startAddr - lookbehind);
		const tempDisassembly = disassemble(readByte, searchStart, lookbehind);

		// The last instruction in this temp block whose address is less than startAddr is our target.
		for (const line of tempDisassembly.reverse()) if (line.addr < startAddr) return line.addr;

		// Fallback if something goes wrong
		return Math.max(0, startAddr - 1);
	};

	const handleScroll = (event: WheelEvent) => {
		if (isFollowingPc.value) isFollowingPc.value = false;

		if (!disassembly.value || disassembly.value.length < 2) return;

		if (event.deltaY < 0) {
			// Scroll Up
			const newStartAddress = findPreviousInstructionAddress(disassemblyStartAddress.value);
			disassemblyStartAddress.value = newStartAddress;
		} else {
			// Scroll Down
			// The new start address is the address of the second line
			const newStartAddress = disassembly.value[1]?.addr ?? 0;
			disassemblyStartAddress.value = newStartAddress;
		}
	};

	onMounted(() => {
		if (scrollContainer.value) {
			// Set initial height and observe for changes
			containerHeight.value = scrollContainer.value.clientHeight;
			resizeObserver = new ResizeObserver((entries) => {
				if (entries[0]) containerHeight.value = entries[0].contentRect.height;
			});
			resizeObserver.observe(scrollContainer.value);
		}
	});

	onUnmounted(() => resizeObserver?.disconnect());

	return {
		scrollContainer,
		visibleRowCount,
		handleScroll,
		findPreviousInstructionAddress,
	};
}
