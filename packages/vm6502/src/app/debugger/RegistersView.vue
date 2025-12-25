<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-lg">
		<DebuggerPanelTitle title="CPU Registers" />
		<div class="grid grid-cols-3 gap-x-5 gap-y-2 font-mono text-sm">
			<div v-for="reg in registerOrder" :key="reg" class="flex items-center justify-left">
				<span class="font-bold text-gray-300">{{ reg }}:</span>
				<input
					type="text"
					:value="formatRegisterValue(reg, registers[reg])"
					@keyup.enter="onRegisterUpdate($event, reg)"
					@blur="onRegisterUpdate($event, reg)"
					:class="[
						'bg-gray-900 text-center px-2 py-0.5 rounded-md tabular-nums text-indigo-300 border border-transparent focus:border-cyan-500 focus:outline-none',
						reg === 'PC' ? 'w-13' : 'w-9'
					]"
					:aria-label="`Register ${reg}`"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { inject, type Ref } from "vue";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import DebuggerPanelTitle from './DebuggerPanelTitle.vue';

	const vm= inject<Ref<VirtualMachine>>('vm');

	interface Props {
		registers: EmulatorState["registers"];
	}

	const props = defineProps<Props>();

	type RegisterKey = "A" | "X" | "Y" | "SP" | "PC"| "P";

	const registerOrder: RegisterKey[] = ["A", "X", "Y", "PC", "SP", "P"];

	const formatRegisterValue = (reg: RegisterKey, value: number | boolean) => {
		if (typeof value !== "number") return "";
		const is16bit = reg === "PC";
		return value.toString(16).toUpperCase().padStart(is16bit ? 4 : 2, "0");
	};

	const onRegisterUpdate = (event: Event, reg: RegisterKey) => {
		const input = event.target as HTMLInputElement;
		const parsedValue = parseInt(input.value.replace('$', ''), 16);

		if (!Number.isNaN(parsedValue)) {
			const is16bit = reg === "PC";
			const maxValue = is16bit ? 0xffff : 0xff;

			if (parsedValue >= 0 && parsedValue <= maxValue)
				vm?.value.updateRegister(reg, parsedValue);
		}

		// Revert to the current state value to avoid showing invalid input or partial input.
		// The UI will update with the new value on the next animation frame if it was valid.
		input.value = formatRegisterValue(reg, props.registers[reg]);
	};
</script>
