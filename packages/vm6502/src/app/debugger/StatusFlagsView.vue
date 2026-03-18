<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl">
		<DebuggerPanelTitle title="Status Flags" />
		<div class="flex gap-1">
			<button
				v-for="{ name, key, pad } in flags"
				:key="key"
				@click="handleFlagToggle(key)"
				:disabled="name === '-'"
				class="py-1 text-xs font-medium transition duration-150 w-[30px]"
				:class="[
					key !== 'U' && registers[key]
						? 'bg-green-600 text-white hover:bg-green-500'
						: 'bg-gray-600 text-gray-300 hover:bg-gray-500',
					name === '-' ? 'opacity-50 cursor-not-allowed ' : '',
					pad ? 'mr-1' : '',
				]"
				:title="name"
			>
				{{ key }}
			</button>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { inject, type Ref } from "vue";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import DebuggerPanelTitle from "./DebuggerPanelTitle.vue";

const vm = inject<Ref<VirtualMachine>>("vm");

interface Props {
	registers: EmulatorRegisters;
}
const { registers } = defineProps<Props>();

type Flag = { name: string; key: "U" | keyof EmulatorRegisters; pad?: boolean };

const flags: Flag[] = [
	{ key: "N", name: "N (Negative)" },
	{ key: "V", name: "V (Overflow)" },
	{ key: "U", name: "-" },
	{ key: "B", name: "B (Break)", pad: true },
	{ key: "D", name: "D (Decimal)" },
	{ key: "I", name: "I (Interrupt)" },
	{ key: "Z", name: "Z (Zero)" },
	{ key: "C", name: "C (Carry)" },
];

const handleFlagToggle = (reg: "U" | keyof EmulatorRegisters) => {
	if (reg !== "U") vm?.value.updateRegister(reg, !registers[reg] ? 1 : 0);
};
</script>
