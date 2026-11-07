<template>
	<div class="p-3 bg-gray-800 rounded-lg shadow-xl">
		<DebuggerPanelTitle title="Status Flags" />
		<div class="flex flex-wrap justify-center gap-x-2 gap-y-1">
			<div v-for="(group, idx) in flagGroups" :key="idx" class="flex gap-1">
				<button
					v-for="{ name, key } in group"
					:key="key"
					@click="handleFlagToggle(key)"
					:disabled="name === '-'"
					class="py-1 text-xs font-medium transition duration-150 w-7"
					:class="[
						key !== 'U' && registers[key]
							? 'bg-green-600 text-white hover:bg-green-500'
							: 'bg-gray-600 text-gray-300 hover:bg-gray-500',
						name === '-' ? 'opacity-50 cursor-not-allowed ' : '',
					]"
					:title="name"
				>
					{{ key }}
				</button>
			</div>
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

type Flag = { name: string; key: "U" | keyof EmulatorRegisters };

// Two nibbles of 4 bits: they sit side by side, and wrap into 2 rows when the panel is too narrow.
const flagGroups: Flag[][] = [
	[
		{ key: "N", name: "N (Negative)" },
		{ key: "V", name: "V (Overflow)" },
		{ key: "U", name: "-" },
		{ key: "B", name: "B (Break)" },
	],
	[
		{ key: "D", name: "D (Decimal)" },
		{ key: "I", name: "I (Interrupt)" },
		{ key: "Z", name: "Z (Zero)" },
		{ key: "C", name: "C (Carry)" },
	],
];

const handleFlagToggle = (reg: "U" | keyof EmulatorRegisters) => {
	if (reg !== "U") vm?.value.updateRegister(reg, !registers[reg] ? 1 : 0);
};
</script>
