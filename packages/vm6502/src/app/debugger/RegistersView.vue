<template>
	<div class="p-2 bg-gray-800 rounded-lg shadow-lg">
		<DebuggerPanelTitle title="Registers" />
		<!-- Each cell is sized to its content: label + 2 hex digits per byte -->
		<div class="flex flex-wrap gap-1.5 font-mono text-xs text-gray-300">
			<div
				v-for="reg in allRegisters"
				:key="reg.key"
				class="flex items-center flex-none border focus-within:border-gray-500 border-transparent"
			>
				<div
					class="flex items-center overflow-hidden font-mono text-xs tabular-nums border border-gray-700"
					:class="[
						reg.write ? 'bg-gray-900' : 'bg-gray-850',
						reg.isVirtual ? 'border-indigo-500/40' : 'border-gray-700',
					]"
				>
					<span
						class="shrink-0 px-1.5 py-0.5 font-bold text-gray-200 select-none border-r border-black/40"
						:class="reg.isVirtual ? 'bg-indigo-700/40 text-indigo-200' : 'bg-gray-700'"
					>
						{{ reg.label }}
					</span>
					<input
						type="text"
						:value="formatRegisterValue(reg)"
						@keyup.enter="onRegisterUpdate($event, reg)"
						@blur="onRegisterUpdate($event, reg)"
						:disabled="!reg.write"
						:style="{ width: `calc(${reg.size * 2}ch + 1rem)` }"
						class="bg-transparent text-center px-2 py-0.5 text-indigo-300 outline-none focus:bg-black/20 disabled:opacity-60"
						:aria-label="`Register ${reg.label}`"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, type Ref } from "vue";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import DebuggerPanelTitle from "./DebuggerPanelTitle.vue";
import type { RegisterDescriptor } from "@/types/registers";

const vm = inject<Ref<VirtualMachine>>("vm");

interface Props {
	registers: EmulatorRegisters;
	virtualRegisters?: readonly RegisterDescriptor[];
}
const props = defineProps<Props>();

const hardwareRegisters: RegisterDescriptor[] = [
	{
		key: "A",
		label: "A",
		size: 1,
		read: () => props.registers.A,
		write: (v) => vm?.value.updateRegister("A", v),
	},
	{
		key: "X",
		label: "X",
		size: 1,
		read: () => props.registers.X,
		write: (v) => vm?.value.updateRegister("X", v),
	},
	{
		key: "Y",
		label: "Y",
		size: 1,
		read: () => props.registers.Y,
		write: (v) => vm?.value.updateRegister("Y", v),
	},
	{
		key: "PC",
		label: "PC",
		size: 2,
		read: () => props.registers.PC,
		write: (v) => vm?.value.updateRegister("PC", v),
	},
	{
		key: "SP",
		label: "SP",
		size: 1,
		read: () => props.registers.SP,
		write: (v) => vm?.value.updateRegister("SP", v),
	},
	{
		key: "P",
		label: "P",
		size: 1,
		read: () => props.registers.P,
	},
];
const allRegisters = computed(() => [...hardwareRegisters, ...(props.virtualRegisters ?? [])]);

const formatRegisterValue = (reg: RegisterDescriptor) => {
	const value = reg.read();
	if (typeof value !== "number") return "";
	return value
		.toString(16)
		.toUpperCase()
		.padStart(reg.size * 2, "0");
};

const onRegisterUpdate = (event: Event, reg: RegisterDescriptor) => {
	if (!reg.write) return;
	const input = event.target as HTMLInputElement;
	const parsedValue = parseInt(input.value.replace("$", ""), 16);

	if (!Number.isNaN(parsedValue)) {
		const maxValue = reg.size > 1 ? 0xffff : 0xff;
		if (parsedValue >= 0 && parsedValue <= maxValue) reg.write(parsedValue);
	}

	// Revert to the current state value to avoid showing invalid input or partial input.
	// The UI will update with the new value on the next animation frame if it was valid.
	input.value = formatRegisterValue(reg);
};
</script>
