<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl">
		Registers
		<div class="flex flex-col space-y-2">
			<div v-for="key in registerOrder" :key="key" class="flex items-center justify-between space-x-2">
				<span class="text-gray-300 font-mono text-base font-bold w-10">{{ key }}:</span>
				<input
					type="text"
					:value="registers ? '$' + registers[key].toString(16).toUpperCase().padStart(key === 'PC' ? 4 : 2, '0') : '$----'"
					@input="handleRegisterChange(key, $event)"
					:maxLength="key === 'PC' ? 4 : 2"
					:class="[
						'text-right font-mono text-base rounded-md px-2 py-1 transition duration-150 border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 tabular-nums',
						key === 'PC' ? 'bg-indigo-900 text-white w-24' : 'bg-gray-700 text-yellow-300 w-20'
					]"
				/>
			</div>
		</div>
	</div>
</template>
<script setup lang="ts">
	type RegisterName = 'A' | 'X' | 'Y' | 'SP' | 'PC' | 'C' | 'Z' | 'I' | 'D' | 'B' | 'V' | 'N';

	type Registers = {
		[key in RegisterName]: key extends 'PC' | 'SP' | 'A' | 'X' | 'Y' ? number : boolean;
	};

	interface DebuggerControls {
		updateRegister: <K extends RegisterName>(reg: K, value: Registers[K]) => void;
	}

	interface Props {
		registers: Registers;
		controls: DebuggerControls;
	}

	const { registers, controls } = defineProps<Props>();

	const registerOrder:RegisterName[] = ['A', 'X', 'Y', 'SP', 'PC'];

	const handleRegisterChange = (reg, event) => {
		const rawValue = event.target.value.replace('$', ''); // Remove leading $
		const value = parseInt(rawValue, 16);

		const maxValue = reg === 'PC' ? 0xFFFF : 0xFF;

		if (!Number.isNaN(value) && value >= 0 && value <= maxValue) {
			controls.updateRegister(reg, value);
			// NOTE: In a real Vue app, the parent state (emulatorState.registers) would update the prop automatically.
		}
	};

</script>
