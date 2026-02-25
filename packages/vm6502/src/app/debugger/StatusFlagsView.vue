<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl">
		<DebuggerPanelTitle title="Status Flags" />
		<div class="grid grid-cols-4 gap-2">
			<button
				v-for="{ name, key } in flags"
				:key="key"
				@click="handleFlagToggle(key)"
				:disabled="key === 'U'"
				:class="[
					'p-2 text-xs rounded-full shadow-md font-medium transition duration-150',
					key !== 'U' && registers[key]
						? 'bg-green-600 text-white hover:bg-green-500'
						: 'bg-gray-600 text-gray-300 hover:bg-gray-500',
					key === 'U' ? 'opacity-50 cursor-not-allowed' : '',
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

/** biome-ignore-all lint/correctness/noUnusedVariables: vue */

const vm = inject<Ref<VirtualMachine>>("vm");

interface Props {
	registers: EmulatorRegisters;
}
const { registers } = defineProps<Props>();

type Flag = { name: string; key: "U" | keyof EmulatorRegisters };

const flags: Flag[] = [
	{ name: "N (Negative)", key: "N" },
	{ name: "V (Overflow)", key: "V" },
	{ name: "-", key: "U" },
	{ name: "B (Break)", key: "B" },
	{ name: "D (Decimal)", key: "D" },
	{ name: "I (Interrupt)", key: "I" },
	{ name: "Z (Zero)", key: "Z" },
	{ name: "C (Carry)", key: "C" },
];

const handleFlagToggle = (reg: "U" | keyof EmulatorRegisters) => {
	if (reg !== "U") vm?.value.updateRegister(reg, !registers[reg] ? 1 : 0);
};
</script>
