import type { MachineInputControl } from "@/types/machine.interface";

/** The host keys (KeyboardEvent.code) driving one joystick control: an axis takes two, a button one. */
export interface KeyboardJoystickBinding {
	/** Axis: the key pushing it to -1 (left / up). Button: the key pressing it. */
	minus?: string;
	/** Axis only: the key pushing it to +1 (right / down). */
	plus?: string;
}

export interface KeyboardJoystickConfig {
	enabled: boolean;
	/** Control id (the machine's joystick `controls[].id`) → its keys */
	bindings: Record<string, KeyboardJoystickBinding>;
}

export const DEFAULT_KEYBOARD_JOYSTICK: KeyboardJoystickConfig = {
	enabled: false,
	bindings: {
		axis_x: { minus: "ArrowLeft", plus: "ArrowRight" },
		axis_y: { minus: "ArrowUp", plus: "ArrowDown" },
	},
};

const storageKey = (machine: string) => `keyboard_joystick_${machine}`;

/** The machine's keyboard joystick as the user set it (the default if none, or unreadable). */
export function loadKeyboardJoystickConfig(machine: string): KeyboardJoystickConfig {
	try {
		const saved = localStorage.getItem(storageKey(machine));
		if (saved) return JSON.parse(saved) as KeyboardJoystickConfig;
	} catch (e) {
		console.error("Failed to load the keyboard joystick", e);
	}
	return structuredClone(DEFAULT_KEYBOARD_JOYSTICK);
}

export function saveKeyboardJoystickConfig(machine: string, config: KeyboardJoystickConfig) {
	try {
		localStorage.setItem(storageKey(machine), JSON.stringify(config));
	} catch (e) {
		console.error("Failed to save the keyboard joystick", e);
	}
}

interface Output {
	setAnalogInput(index: number, value: number): void;
	setInputButton(index: number, pressed: boolean): void;
}

/**
 * Host keys as a joystick: while enabled, a bound key moves an axis to its end (back to the centre when released)
 * or presses a button, and never reaches the machine's keyboard. Two opposite keys held cancel out.
 */
export class KeyboardJoystick {
	private config: KeyboardJoystickConfig = { enabled: false, bindings: {} };
	/** Bound key → what it does */
	private keyMap = new Map<string, { control: MachineInputControl; sign: -1 | 1 }>();
	private down = new Set<string>();

	constructor(private output: Output) {}

	get enabled() {
		return this.config.enabled;
	}

	/** `controls`: the machine's joystick controls (their `index` is the analog / digital input written). */
	configure(controls: MachineInputControl[], config: KeyboardJoystickConfig) {
		this.releaseAll();
		this.config = config;
		this.keyMap.clear();
		if (!config.enabled) return;
		for (const control of controls) {
			const binding = config.bindings[control.id];
			if (!binding || control.index === undefined) continue;
			if (binding.minus) this.keyMap.set(binding.minus, { control, sign: -1 });
			if (control.type === "axis" && binding.plus) this.keyMap.set(binding.plus, { control, sign: 1 });
		}
	}

	/** A key down (`down`) or up on the host: true when it is bound (it is the joystick's, not the keyboard's). */
	handleKey(code: string, down: boolean) {
		const bound = this.keyMap.get(code);
		if (!bound) return false;
		if (down) this.down.add(code);
		else this.down.delete(code);
		this.update(bound.control);
		return true;
	}

	/** Whether keys hold this control now (a gamepad must not overwrite it). */
	isDriving(type: MachineInputControl["type"], index: number) {
		for (const code of this.down) {
			const { control } = this.keyMap.get(code)!;
			if (control.type === type && control.index === index) return true;
		}
		return false;
	}

	/** All the keys up (the page lost the focus: their keyup won't come). */
	releaseAll() {
		const held = new Set([...this.down].map((code) => this.keyMap.get(code)?.control));
		this.down.clear();
		for (const control of held) if (control) this.update(control);
	}

	private update(control: MachineInputControl) {
		const index = control.index as number;
		let value = 0;
		for (const code of this.down) {
			const bound = this.keyMap.get(code)!;
			if (bound.control === control) value += bound.sign;
		}
		if (control.type === "axis") this.output.setAnalogInput(index, value);
		else this.output.setInputButton(index, value !== 0);
	}
}
