<template>
	<div class="flex items-center">
		<Dialog v-model:open="showMapping">
			<DialogTrigger as-child>
				<button
					class="toolbar-btn group"
					:class="{ 'bg-blue-700 hover:bg-blue-600': showMapping }"
					:title="buttonTitle"
				>
					<Keyboard
						v-if="!hasGamepad && keyboard.enabled"
						class="h-4 w-4 text-green-400 group-hover:text-green-300"
					/>
					<Gamepad2 v-else-if="hasGamepad" class="h-4 w-4 text-green-400 group-hover:text-green-300" />
					<Gamepad2 v-else class="h-4 w-4 text-red-400 group-hover:text-red-300" />
				</button>
			</DialogTrigger>
			<DialogContent class="sm:max-w-[425px] bg-gray-900 border-gray-700 text-gray-100">
				<DialogHeader>
					<DialogTitle>Input Mapping</DialogTitle>
					<div class="text-xs font-mono text-gray-300">{{ GamepadID }}</div>
				</DialogHeader>
				<div v-if="inputs && inputs.length > 0">
					<div v-for="device in inputs" :key="device.label" class="mb-4">
						<h4 class="text-xs font-semibold text-gray-400 uppercase mb-2">{{ device.label }} · Gamepad</h4>
						<div class="space-y-2">
							<div
								v-for="control in device.controls"
								:key="control.id"
								class="flex items-center justify-between text-xs"
							>
								<span class="text-gray-300">{{ control.label }}</span>
								<button
									@click="startMapping(getUniqueControlId(device, control))"
									class="px-2 py-1 rounded border transition-colors min-w-[80px] text-center"
									:class="
										listeningFor === getUniqueControlId(device, control)
											? 'bg-yellow-600 border-yellow-500 text-white animate-pulse'
											: 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
									"
								>
									{{ getMappingLabel(getUniqueControlId(device, control)) }}
								</button>
							</div>
						</div>
					</div>
					<div v-for="device in inputs" :key="`kbd-${device.label}`" class="mb-4">
						<div class="flex items-center justify-between mb-2">
							<h4 class="text-xs font-semibold text-gray-400 uppercase">{{ device.label }} · Keyboard</h4>
							<label class="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
								<input v-model="keyboard.enabled" type="checkbox" class="accent-blue-600" />
								Enabled
							</label>
						</div>
						<div class="space-y-2" :class="{ 'opacity-50': !keyboard.enabled }">
							<div
								v-for="control in device.controls"
								:key="control.id"
								class="flex items-center justify-between text-xs"
							>
								<span class="text-gray-300">{{ control.label }}</span>
								<div class="flex gap-1">
									<button
										v-for="side in sidesOf(control)"
										:key="side"
										@click="startKeyMapping(control.id, side)"
										class="px-2 py-1 rounded border transition-colors min-w-[80px] text-center"
										:class="
											isListeningKey(control.id, side)
												? 'bg-yellow-600 border-yellow-500 text-white animate-pulse'
												: 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
										"
									>
										{{ keyMappingLabel(control, side) }}
									</button>
								</div>
							</div>
						</div>
						<div class="mt-1 flex items-center justify-between text-[11px] text-gray-500">
							<span>Bound keys don't reach the machine. Esc cancels, Backspace unbinds.</span>
							<button class="underline hover:text-gray-300" @click="resetKeyboard">Defaults</button>
						</div>
					</div>
					<div class="mt-2 flex justify-end">
						<button
							@click="showMapping = false"
							class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 transition-colors"
						>
							Done
						</button>
					</div>
				</div>
				<div v-else class="text-sm text-gray-400">No configurable inputs for this machine.</div>
			</DialogContent>
		</Dialog>
	</div>
</template>

<script lang="ts" setup>
import { useEventListener, useGamepad, useRafFn } from "@vueuse/core";
import { Gamepad2, Keyboard } from "lucide-vue-next";
import { computed, inject, type Ref, ref, toRaw, watch } from "vue";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { MachineInputControl, MachineInputDevice } from "@/types/machine.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import {
	DEFAULT_KEYBOARD_JOYSTICK,
	type KeyboardJoystickBinding,
	type KeyboardJoystickConfig,
	loadKeyboardJoystickConfig,
} from "@/virtualmachine/keyboardJoystick";

const vm = inject<Ref<VirtualMachine>>("vm");
const { gamepads, onConnected, onDisconnected } = useGamepad();
const hasGamepad = ref(false);
const GamepadID = ref("");
const activeGamepadIndex = ref<number | null>(null);

const showMapping = ref(false);
const listeningFor = ref<string | null>(null);

interface MappingConfig {
	type: "button" | "axis";
	index: number;
}
const mappings = ref<Record<string, MappingConfig>>({});

const inputs: Ref<MachineInputDevice[]> = ref([]);
watch(
	() => vm?.value,
	async (newVm) => {
		if (newVm) {
			await newVm.ready;
			if (newVm.machineConfig.inputs) {
				inputs.value = newVm.machineConfig.inputs.filter((d) => d.type === "joystick");
				keyboard.value = loadKeyboardJoystickConfig(newVm.machineConfig.name);
				// Load mappings
				const saved = localStorage.getItem(`gamepad_map_${newVm.machineConfig.name}`);
				if (saved) {
					try {
						mappings.value = JSON.parse(saved);
					} catch (e) {
						console.error("Failed to load gamepad mappings", e);
					}
				} else {
					mappings.value = {};
				}
			} else {
				inputs.value = [];
				mappings.value = {};
			}
		}
	},
	{ immediate: true },
);

const saveMappings = () => {
	if (vm?.value?.machineConfig.name) {
		localStorage.setItem(`gamepad_map_${vm.value.machineConfig.name}`, JSON.stringify(mappings.value));
	}
};

onConnected((index) => {
	console.log(`${gamepads.value[index]?.id} connected`);
	hasGamepad.value = true;
	activeGamepadIndex.value = index;
	GamepadID.value = gamepads.value[index]?.id ?? "";
});

onDisconnected((index) => {
	console.log(`${index} disconnected`);
	if (activeGamepadIndex.value === index) {
		hasGamepad.value = false;
		activeGamepadIndex.value = null;
	}
});

watch(showMapping, (isOpen) => {
	if (!isOpen) {
		listeningFor.value = null;
		listeningKey.value = null;
	}
});

// --- Keyboard joystick ---

type Side = keyof KeyboardJoystickBinding;

const keyboard = ref<KeyboardJoystickConfig>(structuredClone(DEFAULT_KEYBOARD_JOYSTICK));
const listeningKey = ref<{ id: string; side: Side } | null>(null);

const buttonTitle = computed(() => {
	const pad = hasGamepad.value ? GamepadID.value || "gamepad" : "no gamepad detected";
	return `Input Mapping (${pad}; keyboard joystick ${keyboard.value.enabled ? "on" : "off"})`;
});

const applyKeyboard = () => vm?.value?.setKeyboardJoystick(structuredClone(toRaw(keyboard.value)));
watch(() => keyboard.value.enabled, applyKeyboard);

const sidesOf = (control: MachineInputControl): Side[] => (control.type === "axis" ? ["minus", "plus"] : ["minus"]);

const startKeyMapping = (id: string, side: Side) => {
	listeningFor.value = null;
	listeningKey.value = { id, side };
};

const isListeningKey = (id: string, side: Side) => listeningKey.value?.id === id && listeningKey.value.side === side;

const KEY_NAMES: Record<string, string> = {
	ArrowLeft: "←",
	ArrowRight: "→",
	ArrowUp: "↑",
	ArrowDown: "↓",
	Space: "Space",
};
const keyName = (code: string) =>
	KEY_NAMES[code] ??
	code
		.replace(/^Key/, "")
		.replace(/^Digit/, "")
		.replace(/^Numpad/, "Num ");

const keyMappingLabel = (control: MachineInputControl, side: Side) => {
	if (isListeningKey(control.id, side)) return "Press...";
	const code = keyboard.value.bindings[control.id]?.[side];
	const prefix = control.type === "axis" ? (side === "minus" ? "− " : "+ ") : "";
	return prefix + (code ? keyName(code) : "None");
};

const resetKeyboard = () => {
	keyboard.value = { ...structuredClone(DEFAULT_KEYBOARD_JOYSTICK), enabled: keyboard.value.enabled };
	applyKeyboard();
};

// Capture phase, ahead of the machine's keyboard: the key pressed is the binding's, nobody else's
useEventListener(
	window,
	"keydown",
	(e: KeyboardEvent) => {
		const target = listeningKey.value;
		if (!target) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		listeningKey.value = null;
		if (e.code === "Escape") return;
		const bindings = keyboard.value.bindings;
		// A key drives one thing: taken off any other binding
		for (const binding of Object.values(bindings))
			for (const side of ["minus", "plus"] as Side[]) if (binding[side] === e.code) delete binding[side];
		const binding = (bindings[target.id] ??= {});
		if (e.code === "Backspace" || e.code === "Delete") delete binding[target.side];
		else binding[target.side] = e.code;
		applyKeyboard();
	},
	{ capture: true },
);

const getUniqueControlId = (device: MachineInputDevice, control: MachineInputControl) =>
	`${device.label}::${control.id}`;

const startMapping = (controlId: string) => {
	listeningFor.value = controlId;
};

const getMappingLabel = (controlId: string) => {
	if (listeningFor.value === controlId) return "Press...";
	const map = mappings.value[controlId];
	if (!map) return "None";
	return `${map.type === "axis" ? "Axis" : "Btn"} ${map.index}`;
};

useRafFn(() => {
	if (!listeningFor.value || activeGamepadIndex.value === null) return;

	const gp = gamepads.value[activeGamepadIndex.value];
	if (!gp) return;

	// Check buttons
	for (let i = 0; i < gp.buttons.length; i++) {
		if (gp.buttons[i]?.pressed) {
			mappings.value[listeningFor.value] = { type: "button", index: i };
			listeningFor.value = null;
			saveMappings();
			return;
		}
	}

	// Check axes
	for (let i = 0; i < gp.axes.length; i++) {
		if (Math.abs(gp.axes[i] as number) > 0.5) {
			mappings.value[listeningFor.value] = { type: "axis", index: i };
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
			// Keys hold it: the gamepad's resting value must not overwrite them
			if (vm.value.keyboardJoystick.isDriving(control.type, control.index)) continue;

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
