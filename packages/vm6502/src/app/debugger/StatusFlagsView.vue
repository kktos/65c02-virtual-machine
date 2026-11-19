<template>
	<!--
		P's bits, NV-BDIZC, side by side: a letter is uppercase (green) when the flag is set, lowercase when clear.
		Click one to flip it, when the machine is paused.
	-->
	<div class="flex border border-gray-700 font-mono text-xs leading-none" role="group" aria-label="Status flags">
		<button
			v-for="{ name, key } in FLAGS"
			:key="key"
			@click="handleFlagToggle(key)"
			:disabled="key === 'U' || isRunning"
			class="w-[1.5ch] box-content px-0.5 py-1 font-bold transition-colors duration-150"
			:class="
				key === 'U'
					? 'bg-gray-800 text-gray-600 cursor-not-allowed'
					: registers[key]
						? 'bg-green-700 text-white enabled:hover:bg-green-600'
						: 'bg-gray-800 text-gray-500 enabled:hover:bg-gray-700'
			"
			:title="key === 'U' ? name : `${name}: ${registers[key] ? 'set' : 'clear'}`"
			:aria-pressed="key === 'U' ? undefined : !!registers[key]"
		>
			{{ key === "U" ? "-" : registers[key] ? key : key.toLowerCase() }}
		</button>
	</div>
</template>

<script lang="ts" setup>
import { inject, type Ref } from "vue";
import { useMachine } from "@/composables/useMachine";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");
const { isRunning } = useMachine();

interface Props {
	registers: EmulatorRegisters;
}
const { registers } = defineProps<Props>();

type Flag = { name: string; key: "U" | keyof EmulatorRegisters };

const FLAGS: Flag[] = [
	{ key: "N", name: "N (Negative)" },
	{ key: "V", name: "V (Overflow)" },
	{ key: "U", name: "- (unused)" },
	{ key: "B", name: "B (Break)" },
	{ key: "D", name: "D (Decimal)" },
	{ key: "I", name: "I (Interrupt)" },
	{ key: "Z", name: "Z (Zero)" },
	{ key: "C", name: "C (Carry)" },
];

const handleFlagToggle = (reg: "U" | keyof EmulatorRegisters) => {
	if (reg !== "U" && !isRunning.value) vm?.value.updateRegister(reg, !registers[reg] ? 1 : 0);
};
</script>
