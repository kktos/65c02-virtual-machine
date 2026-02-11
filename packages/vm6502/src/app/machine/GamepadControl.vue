<template>
	<div class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
		<Dialog v-model:open="showMapping">
			<DialogTrigger as-child>
				<button
					class="group flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors shrink-0"
					:class="{ 'bg-blue-700 border-blue-500': showMapping }"
				>
					<Gamepad2 v-if="hasGamepad" class="h-5 w-5 text-green-400 group-hover:text-green-300" />
					<Gamepad2 v-else class="h-5 w-5 text-red-400 group-hover:text-red-300" />
				</button>
			</DialogTrigger>
			<DialogContent class="sm:max-w-[425px] bg-gray-900 border-gray-700 text-gray-100">
				<DialogHeader>
					<DialogTitle>Input Mapping</DialogTitle>
					<div class="text-xs font-mono text-gray-300">{{  GamepadID }}</div>
				</DialogHeader>
				<div v-if="inputs && inputs.length > 0">
					<div v-for="device in inputs" :key="device.label" class="mb-4">
						<h4 class="text-xs font-semibold text-gray-400 uppercase mb-2">{{ device.label }}</h4>
						<div class="space-y-2">
							<div v-for="control in device.controls" :key="control.id" class="flex items-center justify-between text-xs">
								<span class="text-gray-300">{{ control.label }}</span>
								<button
									@click="startMapping(getUniqueControlId(device, control))"
									class="px-2 py-1 rounded border transition-colors min-w-[80px] text-center"
									:class="listeningFor === getUniqueControlId(device, control) ? 'bg-yellow-600 border-yellow-500 text-white animate-pulse' : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'"
								>
									{{ getMappingLabel(getUniqueControlId(device, control)) }}
								</button>
							</div>
						</div>
					</div>
					<div class="mt-2 flex justify-end">
						<button @click="showMapping = false" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 transition-colors">Done</button>
					</div>
				</div>
				<div v-else class="text-sm text-gray-400">No configurable inputs for this machine.</div>
			</DialogContent>
		</Dialog>
	</div>
</template>

<script lang="ts" setup>
import { useGamepad, useRafFn } from "@vueuse/core";
import { Gamepad2 } from "lucide-vue-next";
import { inject, type Ref, ref, watch } from "vue";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { MachineInputControl, MachineInputDevice } from "@/types/machine.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

	const vm = inject<Ref<VirtualMachine>>("vm");
	const { gamepads, onConnected, onDisconnected } = useGamepad();
	const hasGamepad= ref(false);
	const GamepadID = ref("");
	const activeGamepadIndex = ref<number | null>(null);

	const showMapping = ref(false);
	const listeningFor = ref<string | null>(null);

	interface MappingConfig {
		type: 'button' | 'axis';
		index: number;
	}
	const mappings = ref<Record<string, MappingConfig>>({});

	const inputs: Ref<MachineInputDevice[]> = ref([]) ;
	watch(() => vm?.value, async (newVm) => {
		if (newVm) {
			await newVm.ready;
			if (newVm.machineConfig.inputs) {
				inputs.value = newVm.machineConfig.inputs.filter((d) => d.type === "joystick");
				// Load mappings
				const saved = localStorage.getItem(`gamepad_map_${newVm.machineConfig.name}`);
				if (saved) {
					try {
						mappings.value = JSON.parse(saved);
					} catch (e) { console.error("Failed to load gamepad mappings", e); }
				} else {
					mappings.value = {};
				}
			} else {
				inputs.value = [];
				mappings.value = {};
			}
		}
	}, { immediate: true });

	const saveMappings = () => {
		if (vm?.value?.machineConfig.name) {
			localStorage.setItem(`gamepad_map_${vm.value.machineConfig.name}`, JSON.stringify(mappings.value));
		}
	};

	onConnected((index) => {
		console.log(`${gamepads.value[index]?.id} connected`);
		hasGamepad.value = true;
		activeGamepadIndex.value = index;
		GamepadID.value = gamepads.value[index]?.id??"";
	})

	onDisconnected((index) => {
		console.log(`${index} disconnected`)
		if (activeGamepadIndex.value === index) {
			hasGamepad.value = false;
			activeGamepadIndex.value = null;
		}
	})

	watch(showMapping, (isOpen) => {
		if (!isOpen) listeningFor.value = null;
	});

	const getUniqueControlId = (device: MachineInputDevice, control: MachineInputControl) => `${device.label}::${control.id}`;

	const startMapping = (controlId: string) => {
		listeningFor.value = controlId;
	};

	const getMappingLabel = (controlId: string) => {
		if (listeningFor.value === controlId) return "Press...";
		const map = mappings.value[controlId];
		if (!map) return "None";
		return `${map.type === 'axis' ? 'Axis' : 'Btn'} ${map.index}`;
	};

	useRafFn(() => {
		if (!listeningFor.value || activeGamepadIndex.value === null) return;

		const gp = gamepads.value[activeGamepadIndex.value];
		if (!gp) return;

		// Check buttons
		for (let i = 0; i < gp.buttons.length; i++) {
			if (gp.buttons[i]?.pressed) {
				mappings.value[listeningFor.value] = { type: 'button', index: i };
				listeningFor.value = null;
				saveMappings();
				return;
			}
		}

		// Check axes
		for (let i = 0; i < gp.axes.length; i++) {
			if (Math.abs(gp.axes[i] as number) > 0.5) {
				mappings.value[listeningFor.value] = { type: 'axis', index: i };
				listeningFor.value = null;
				saveMappings();
				return;
			}
		}
	});

	useRafFn(() => {
		if (activeGamepadIndex.value === null || !vm?.value) return;

		const gp = gamepads.value[activeGamepadIndex.value];
		if (!gp) return;

		if (!inputs.value) return;

		for (const device of inputs.value) {
			for (const control of device.controls) {
				if (control.index === undefined) continue;

				const uniqueId = getUniqueControlId(device, control);
				const mapping = mappings.value[uniqueId];
				if (!mapping) continue;

				if (control.type === "axis" && mapping.type === "axis") {
					const value = (gp.axes[mapping.index] as number) ?? 0;
					vm.value.setAnalogInput(control.index, value);
				} else if (control.type === "button" && mapping.type === "button") {
					const pressed = gp.buttons[mapping.index]?.pressed ?? false;
					vm.value.setInputButton(control.index, pressed);
				}

			}
		}
	});

</script>
