import { computed, onMounted, onUnmounted, type Ref, ref } from "vue";
import { disassemble } from "@/lib/disassembler";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

export function useDisassemblyScroll(
	vm: Ref<VirtualMachine>,
	disassembly: Ref<DisassemblyLine[]>,
	disassemblyStartAddress: Ref<number>,
	isFollowingPc: Ref<boolean>,
	pivotIndex: Ref<number>,
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
				(containerHeight.value - TABLE_HEADER_HEIGHT - PANEL_TITLE_HEIGHT - PANEL_TITLE_MB_HEIGHT) /
					TABLE_ROW_HEIGHT,
			),
		);
	});

	const readByte = (address: number) => {
		return vm.value.readDebug(address) ?? 0;
	};

	const findPreviousInstructionAddress = async (startAddr: number) => {
		if (startAddr <= 0) return 0;
		const scope = vm.value.getScope(startAddr);
		const lines = await disassemble(readByte, scope, startAddr, 1, undefined, 1);
		return lines[0]?.addr ?? Math.max(0, startAddr - 1);
	};

	const scrollUp = async (lines = 1) => {
		if (isFollowingPc.value) {
			pivotIndex.value = Math.min(
				visibleRowCount.value > 0 ? visibleRowCount.value - 1 : 0,
				pivotIndex.value + lines,
			);
		} else {
			let newStartAddress = disassemblyStartAddress.value;
			for (let i = 0; i < lines; i++) {
				newStartAddress = await findPreviousInstructionAddress(newStartAddress);
			}
			disassemblyStartAddress.value = newStartAddress;
		}
	};

	const scrollDown = (lines = 1) => {
		if (isFollowingPc.value) {
			pivotIndex.value = Math.max(0, pivotIndex.value - lines);
		} else {
			if (!disassembly.value || disassembly.value.length <= lines) return;
			const newStartAddress = disassembly.value[lines]?.addr ?? disassemblyStartAddress.value;
			disassemblyStartAddress.value = newStartAddress;
		}
	};

	const pageUp = () => {
		const pageAmount = Math.max(1, visibleRowCount.value - 2);
		scrollUp(pageAmount);
	};

	const pageDown = () => {
		const pageAmount = Math.max(1, visibleRowCount.value - 2);
		scrollDown(pageAmount);
	};

	const handleScroll = (event: WheelEvent) => {
		if (event.deltaY < 0) {
			scrollUp();
		} else {
			scrollDown();
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
		scrollUp,
		scrollDown,
		pageUp,
		pageDown,
	};
}
