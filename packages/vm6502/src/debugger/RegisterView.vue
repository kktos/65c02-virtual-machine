<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-lg">
		<DebuggerPanelTitle title="CPU Registers" />
		<div class="grid grid-cols-3 gap-x-5 gap-y-2 font-mono text-sm">
			<div v-for="reg in registerOrder" :key="reg" class="flex items-center justify-left" :class="reg === 'PC' ? 'col-span-2' : ''">
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
	import type { EmulatorState } from "@/types/emulatorstate.interface";
import DebuggerPanelTitle from './DebuggerPanelTitle.vue';

	interface DebuggerControls {
		updateRegister: <K extends keyof EmulatorState["registers"]>(
			reg: K,
			value: EmulatorState["registers"][K],
		) => void;
	}

	interface Props {
		registers: EmulatorState["registers"];
		controls: DebuggerControls;
	}

	const props = defineProps<Props>();

	type RegisterKey = "A" | "X" | "Y" | "SP" | "PC";

	const registerOrder: RegisterKey[] = ["A", "X", "Y", "PC", "SP"];

	const formatRegisterValue = (reg: RegisterKey, value: number | boolean) => {
		if (typeof value !== "number") return "";
		const is16bit = reg === "PC";
		return value.toString(16).toUpperCase().padStart(is16bit ? 4 : 2, "0");
	};

	const onRegisterUpdate = (event: Event, reg: RegisterKey) => {
		const input = event.target as HTMLInputElement;
		const parsedValue = parseInt(input.value, 16);

		if (!Number.isNaN(parsedValue)) {
			const is16bit = reg === "PC";
			const maxValue = is16bit ? 0xffff : 0xff;

			if (parsedValue >= 0 && parsedValue <= maxValue) {
				props.controls.updateRegister(reg, parsedValue);
			}
		}

		// Revert to the current state value to avoid showing invalid input or partial input.
		// The UI will update with the new value on the next animation frame if it was valid.
		input.value = formatRegisterValue(reg, props.registers[reg]);
	};
</script>
