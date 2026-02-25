// c:\devwork\65c02-virtual-machine\packages\vm6502\src\composables\useMachine.ts
import { markRaw, nextTick, reactive, ref } from "vue";
import { availableMachines } from "../machines";
import type { MachineConfig } from "../types/machine.interface";
import { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useFormatting } from "./useDataFormattings";
import { useNotes } from "./useNotes";
import { useSymbols } from "./useSymbols";
import { toast } from "vue-sonner";
import { useBreakpoints } from "../composables/useBreakpoints";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";

// Initialize global state with the default machine (same default as App.vue used)
const selectedMachine = ref<MachineConfig>(availableMachines[1] as MachineConfig);
const isRunning = ref(false);
const videoCanvas = ref<HTMLCanvasElement | null>(null);
const logEndRef = ref<HTMLDivElement | null>(null);
const logs = ref<string[]>([]);
const vm = ref<VirtualMachine | null>(null);
const registers: EmulatorRegisters = reactive({
	A: 0,
	X: 0,
	Y: 0,
	PC: 0,
	SP: 0,
	P: 0,
	C: false,
	Z: false,
	I: false,
	D: false,
	B: false,
	V: false,
	N: false,
});

const setupVmListeners = (targetVm: VirtualMachine) => {
	targetVm.onmessage = (event) => {
		const { type, error, message, address } = event.data;

		switch (type) {
			case "error":
				if (error === "unimplemented_opcode") {
					isRunning.value = false; // Ensure UI reflects the paused state
					alert(`Emulator Halted!\n\nError: ${message}`);
				} else console.error("Error received from worker:", event.data);
				break;
			case "isRunning":
				// Update the local isRunning ref based on the worker's state
				isRunning.value = event.data.isRunning;
				// if (!isRunning.value) targetVm.refreshVideo();

				break;
			case "break": {
				isRunning.value = false;
				const msg = `BRK hit at $${address.toString(16).toUpperCase()}`;
				toast.error(msg, {
					style: {
						color: "white",
						background: "#810707",
					},
					closeButton: true,
					closeButtonPosition: "top-left",
					duration: Infinity,
				});
				targetVm.refreshVideo();
				break;
			}
			case "breakpointHit": {
				targetVm.refreshVideo();
				targetVm.syncBusState();
				break;
			}
			default:
				console.log("Message received from worker:", event.data);
		}
	};

	targetVm.onLog((payload) => {
		if (!payload.message) return;

		logs.value.push(payload.message);
		if (logs.value.length > 500) logs.value.shift();
		nextTick(() => {
			if (logEndRef.value) logEndRef.value.scrollIntoView({ behavior: "smooth" });
		});
	});
};

const loadMachine = async (newMachine?: MachineConfig) => {
	isRunning.value = false;
	vm.value?.terminate();

	if (newMachine) selectedMachine.value = newMachine;

	console.log(`Main: Loading machine ${selectedMachine.value.name}`);

	const newVm = new VirtualMachine(selectedMachine.value);
	vm.value = markRaw(newVm);
	setupVmListeners(newVm);
	if (videoCanvas.value) newVm.initVideo(videoCanvas.value);

	const { loadBreakpoints } = useBreakpoints();
	loadBreakpoints(newVm);

	newVm.ready.then(() => {
		newVm.initAudio();
	});

	{
		const { initSymbols, setDiskKey } = useSymbols();
		await initSymbols(selectedMachine.value.name, selectedMachine.value.debug?.symbols);
		setDiskKey("*");
	}

	{
		const { initFormats, setDiskKey } = useFormatting();
		await initFormats(selectedMachine.value.name, selectedMachine.value.debug?.dataBlocks);
		setDiskKey("*");
	}

	{
		const { initNotes, setDiskKey } = useNotes();
		await initNotes(selectedMachine.value.name);
		setDiskKey("*");
	}
};

export function useMachine() {
	return {
		selectedMachine,
		isRunning,
		videoCanvas,
		loadMachine,
		logs,
		vm,
		registers,
	};
}
