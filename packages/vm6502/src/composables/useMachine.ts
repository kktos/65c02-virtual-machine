// c:\devwork\65c02-virtual-machine\packages\vm6502\src\composables\useMachine.ts
import { markRaw, reactive, readonly, ref, shallowRef } from "vue";
import { availableMachines } from "../machines";
import type { MachineConfig } from "../types/machine.interface";
import { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useFormatting } from "./useDataFormattings";
import { useNotes } from "./useNotes";
import { useSymbols } from "./useSymbols";
import { toast } from "vue-sonner";
import { useBreakpoints } from "../composables/useBreakpoints";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import { useCommands } from "./useCommands";
import { useRoutines } from "./useRoutines";
import type { RegisterDescriptor } from "@/types/registers";
import { setHypercallDisassembly } from "@/lib/hypercalls.lib";

// Initialize global state with the default machine (same default as App.vue used)
const selectedMachine = ref<MachineConfig>(availableMachines[1] as MachineConfig);
const isRunning = ref(false);
// "Break on BRK": stop the CPU on a BRK instead of running it. On by default (the worker's default too);
// kept here so it survives a machine change and the toolbar and the `brk` command agree.
const breakOnBrk = ref(true);
const videoCanvas = ref<HTMLCanvasElement | null>(null);
const vm = shallowRef<VirtualMachine | null>(null);
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
const virtualRegisters = ref<RegisterDescriptor[]>([]);

const setupVmListeners = (targetVm: VirtualMachine) => {
	const { executeCommand } = useCommands();

	targetVm.onmessage = async (event) => {
		const { type, error, message, address, breakpointType } = event.data;

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
				const { findHitBreakpoints, removeBreakpoint } = useBreakpoints();
				// The hit may fall inside a range, or come from an `access` breakpoint (reported as read / write).
				const hits = findHitBreakpoints(breakpointType, address);
				for (const hit of hits) if (hit.isTemporary) removeBreakpoint(hit, targetVm);
				// The most specific one decides: a plain breakpoint there stops, even inside a hooked range.
				const bp = hits[0];
				if (bp?.command) {
					await executeCommand(bp?.command, targetVm);
					break;
				}
				targetVm.refreshVideo();
				targetVm.syncBusState();
				break;
			}
			default:
				console.log("Message received from worker:", event.data);
		}
	};

	// targetVm.onLog((payload) => {
	// 	if (!payload.message) return;

	// 	// logs.value.push(payload.message);
	// 	// if (logs.value.length > 500) logs.value.shift();
	// 	// nextTick(() => {
	// 	// 	if (logEndRef.value) logEndRef.value.scrollIntoView({ behavior: "smooth" });
	// 	// });
	// });
};

const loadMachine = async (newMachine?: MachineConfig) => {
	isRunning.value = false;
	vm.value?.terminate();

	if (newMachine) selectedMachine.value = newMachine;

	console.log(`Main: Loading machine ${selectedMachine.value.name}`);

	setHypercallDisassembly(!!selectedMachine.value.hypercalls);
	const newVm = new VirtualMachine(selectedMachine.value);
	vm.value = markRaw<VirtualMachine>(newVm);
	setupVmListeners(newVm);
	virtualRegisters.value = [];

	if (videoCanvas.value) newVm.initVideo(videoCanvas.value);

	const { loadBreakpoints } = useBreakpoints();
	loadBreakpoints(newVm);

	newVm.ready.then(() => {
		newVm.initAudio();
		newVm.setBreakOnBrk(breakOnBrk.value);
	});

	{
		const { initFormats, setDiskKey } = useFormatting();
		await initFormats(selectedMachine.value.name, selectedMachine.value.debug?.dataBlocks);
		setDiskKey("*");
	}

	{
		const { executeCommand } = useCommands();
		const { initSymbols } = useSymbols();
		await initSymbols(selectedMachine.value.name);

		const initScript = selectedMachine.value.routines?.init;
		const { initRoutines, setRoutine } = useRoutines();
		try {
			// The init script and the routines it defines are part of the machine sources: read-only.
			// The user routines saved for this machine are loaded afterwards.
			const renamed = await initRoutines(
				selectedMachine.value.name,
				initScript
					? async () => {
							setRoutine("init", initScript, [], { readonly: true });
							await executeCommand("do init", newVm);
						}
					: undefined,
			);
			for (const { from, to } of renamed)
				toast.warning(
					`Your routine '${from}' was renamed '${to}': the machine now defines a routine '${from}'.`,
				);
		} catch (e) {
			console.error("Failed to init routines", e);
			toast.error(`Routines: ${e instanceof Error ? e.message : e}`);
		}
	}

	{
		const { initNotes, setDiskKey } = useNotes();
		await initNotes(selectedMachine.value.name);
		setDiskKey("*");
	}
};

const addVirtualRegister = (vr: RegisterDescriptor) => {
	if (virtualRegisters.value.find((r) => r.key === vr.key))
		throw new Error(`Virtual register ${vr.key} already exists`);
	virtualRegisters.value.push(vr);
};

const setBreakOnBrk = (enabled: boolean) => {
	breakOnBrk.value = enabled;
	vm.value?.setBreakOnBrk(enabled);
};

export function useMachine() {
	return {
		selectedMachine,
		isRunning,
		videoCanvas,
		loadMachine,
		vm,
		registers,
		virtualRegisters: readonly(virtualRegisters),
		addVirtualRegister,
		breakOnBrk: readonly(breakOnBrk),
		setBreakOnBrk,
	};
}
