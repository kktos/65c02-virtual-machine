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
import { useRunUntil } from "./useRunUntil";
import { useDiskDrive } from "./useDiskDrive";
import { useDiskEditor } from "./useDiskEditor";
import type { RegisterDescriptor } from "@/types/registers";
import type { StopInfo } from "@/types/stopinfo.interface";
import { setHypercallDisassembly } from "@/lib/hypercalls.lib";

// Initialize global state with the default machine (same default as App.vue used)
const selectedMachine = ref<MachineConfig>(availableMachines[1] as MachineConfig);
const isRunning = ref(false);
// "Break on BRK": stop the CPU on a BRK instead of running it. On by default (the worker's default too);
// kept here so it survives a machine change and the toolbar and the `brk` command agree.
const breakOnBrk = ref(true);
// Cycles after the program consumes a typed key before it gets the next one (the `key delay` command); null: the
// machine's default. Kept here to survive a machine change. A program that eats typed keys needs a longer one.
const keyDelay = ref<number | null>(null);
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

// --- UI frame loop ---
// The worker writes the registers to a SharedArrayBuffer, which Vue can't track: copy them into `registers`
// once per animation frame, then run the per-frame callbacks (`onUiFrame`).
// Paused, the registers only change on a step, a command or an edit: they're read on every frame, so the views
// show the change at once. Running, they change all the time and can't be read at 60 Hz anyway: they're read
// every RUNNING_SYNC_MS, which also spares the views (the disassembly first) a re-render on every frame.
const RUNNING_SYNC_MS = 100;
const uiFrameCallbacks = new Set<() => void>();
let uiFrameRequest = 0;
let lastRegistersSync = 0;

const uiFrame = (now: number) => {
	uiFrameRequest = requestAnimationFrame(uiFrame);
	const machine = vm.value;
	if (!machine) return;
	if (!isRunning.value || now - lastRegistersSync >= RUNNING_SYNC_MS) {
		// Only the values that changed trigger the views
		Object.assign(registers, machine.getRegisters());
		lastRegistersSync = now;
	}
	for (const cb of uiFrameCallbacks) cb();
};

const startUiLoop = () => {
	if (!uiFrameRequest && typeof requestAnimationFrame === "function") uiFrameRequest = requestAnimationFrame(uiFrame);
};

/** Calls `cb` on every animation frame, after the registers are synced. Returns the unsubscribe function. */
const onUiFrame = (cb: () => void) => {
	uiFrameCallbacks.add(cb);
	return () => {
		uiFrameCallbacks.delete(cb);
	};
};

const setupVmListeners = (targetVm: VirtualMachine) => {
	const { executeCommand } = useCommands();
	const { handleStop } = useRunUntil();

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
				// A breakpoint (or the end of a step over / out) is done with on its `breakpointHit`, which follows
				{
					const stop = event.data.stop as StopInfo | undefined;
					if (stop && stop.reason !== "breakpoint" && stop.reason !== "step") handleStop(targetVm, stop);
				}
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
				// This hit's stop: the hook's command may run the machine into the next one before it's done
				const stop = targetVm.lastStop;
				try {
					const bp = useBreakpoints().takeHit(breakpointType, address, targetVm);
					if (bp?.command) await executeCommand(bp.command, targetVm, { source: "bp" });
					else {
						targetVm.refreshVideo();
						targetVm.syncBusState();
					}
				} finally {
					if (stop) handleStop(targetVm, stop);
				}
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

/** Starts `newMachine` (default: the current one again, a power cycle). Resolves once it is set up, its disk back in. */
const loadMachine = async (newMachine?: MachineConfig) => {
	isRunning.value = false;
	vm.value?.terminate();

	// Another machine: the disk editor's disk isn't in its library, its file systems and viewers aren't its own
	if (newMachine && newMachine.name !== selectedMachine.value.name) useDiskEditor().closeDisk();
	if (newMachine) selectedMachine.value = newMachine;

	console.log(`Main: Loading machine ${selectedMachine.value.name}`);

	setHypercallDisassembly(!!selectedMachine.value.hypercalls);
	const newVm = new VirtualMachine(selectedMachine.value);
	vm.value = markRaw<VirtualMachine>(newVm);
	setupVmListeners(newVm);
	virtualRegisters.value = [];
	startUiLoop();

	if (videoCanvas.value) newVm.initVideo(videoCanvas.value);

	const { loadBreakpoints } = useBreakpoints();
	loadBreakpoints(newVm);

	newVm.ready
		.then(() => {
			newVm.initAudio();
			newVm.setBreakOnBrk(breakOnBrk.value);
			if (keyDelay.value !== null && newVm.bus?.setKeyDelay)
				newVm.setKeyDelay(keyDelay.value).catch(() => undefined);
		})
		.catch((e) => {
			// e.g. a ROM file not fetched (see the machine's README)
			console.error(`Main: ${selectedMachine.value.name} could not start:`, e);
			toast.error(`${selectedMachine.value.name}: ${e instanceof Error ? e.message : String(e)}`, {
				position: "bottom-center",
			});
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
							await executeCommand("do init", newVm, { source: "init" });
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

	// The drive gets back the last disk inserted in it (empty without a drive). Last, so its labels / formats /
	// notes win over the "*" ones above; awaited, so a caller (switch_machine) doesn't race it with its own disk.
	try {
		await newVm.ready;
	} catch {
		return; // reported above
	}
	if (vm.value !== newVm) return; // another machine was loaded meanwhile
	try {
		await useDiskDrive().restoreLastDisk(newVm);
	} catch (e) {
		console.error("Failed to restore the last disk:", e);
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

const setKeyDelay = async (cycles: number) => {
	keyDelay.value = Math.max(0, Math.round(cycles));
	return vm.value?.setKeyDelay(keyDelay.value);
};

export function useMachine() {
	return {
		selectedMachine,
		isRunning,
		videoCanvas,
		loadMachine,
		vm,
		/** The UI's copy of the CPU registers, synced by the frame loop: for the views. Code reads `vm.getRegisters()`. */
		registers: readonly(registers),
		onUiFrame,
		virtualRegisters: readonly(virtualRegisters),
		addVirtualRegister,
		breakOnBrk: readonly(breakOnBrk),
		setBreakOnBrk,
		keyDelay: readonly(keyDelay),
		setKeyDelay,
	};
}
