// c:\devwork\65c02-virtual-machine\packages\vm6502\src\composables\useMachine.ts
import { ref } from "vue";
import { availableMachines } from "../machines";
import type { MachineConfig } from "../types/machine.interface";

// Initialize global state with the default machine (same default as App.vue used)
const selectedMachine = ref<MachineConfig>(availableMachines[1] as MachineConfig);

export function useMachine() {
	return {
		selectedMachine,
	};
}
