<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-lg">
		<DebuggerPanelTitle title="Registers" />
		<div class="grid grid-cols-3 gap-x-5 gap-y-2 font-mono text-sm text-gray-300">
			<div v-for="reg in sortedRegisters" :key="reg" class="flex items-center justify-left">
				<span class="font-bold">{{ reg }}:</span>
				<input
					type="text"
					:value="formatRegisterValue(reg, registers[reg])"
					@keyup.enter="onRegisterUpdate($event, reg)"
					@blur="onRegisterUpdate($event, reg)"
					class="bg-gray-900 text-center px-2 py-0.5 rounded-md tabular-nums text-indigo-300 border border-transparent focus:border-cyan-500 focus:outline-none"
					:class="registersDef[reg].size > 1 ? 'w-13' : 'w-9'"
					:aria-label="`Register ${reg}`"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { inject, type Ref } from "vue";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import DebuggerPanelTitle from "./DebuggerPanelTitle.vue";

const vm = inject<Ref<VirtualMachine>>("vm");

interface Props {
	registers: EmulatorRegisters;
}

const props = defineProps<Props>();

type RegisterKey = "A" | "X" | "Y" | "SP" | "PC" | "P";
type RegisterDef = { size: number };

const sortedRegisters: RegisterKey[] = ["A", "X", "Y", "PC", "SP", "P"];
const registersDef: Record<RegisterKey, RegisterDef> = {
	A: { size: 1 },
	X: { size: 1 },
	Y: { size: 1 },
	PC: { size: 2 },
	SP: { size: 1 },
	P: { size: 1 },
};
const formatRegisterValue = (reg: RegisterKey, value: number | boolean) => {
	if (typeof value !== "number") return "";
	return value
		.toString(16)
		.toUpperCase()
		.padStart(registersDef[reg].size * 2, "0");
};

const onRegisterUpdate = (event: Event, reg: RegisterKey) => {
	const input = event.target as HTMLInputElement;
	const parsedValue = parseInt(input.value.replace("$", ""), 16);

	if (!Number.isNaN(parsedValue)) {
		const maxValue = registersDef[reg].size > 1 ? 0xffff : 0xff;
		if (parsedValue >= 0 && parsedValue <= maxValue) vm?.value.updateRegister(reg, parsedValue);
	}

	// Revert to the current state value to avoid showing invalid input or partial input.
	// The UI will update with the new value on the next animation frame if it was valid.
	input.value = formatRegisterValue(reg, props.registers[reg]);
};
</script>
