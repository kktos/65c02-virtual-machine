import { beforeEach, describe, expect, it } from "vitest";
import type { MachineInputControl } from "@/types/machine.interface";
import { DEFAULT_KEYBOARD_JOYSTICK, KeyboardJoystick } from "../keyboardJoystick";

const CONTROLS: MachineInputControl[] = [
	{ id: "axis_x", label: "X", type: "axis", index: 0 },
	{ id: "axis_y", label: "Y", type: "axis", index: 1 },
	{ id: "btn_0", label: "B0", type: "button", index: 0 },
	{ id: "btn_1", label: "B1", type: "button", index: 1 },
];

describe("KeyboardJoystick", () => {
	let analog: number[];
	let buttons: boolean[];
	let joy: KeyboardJoystick;

	beforeEach(() => {
		analog = [0, 0];
		buttons = [false, false];
		joy = new KeyboardJoystick({
			setAnalogInput: (i, v) => {
				analog[i] = v;
			},
			setInputButton: (i, p) => {
				buttons[i] = p;
			},
		});
		joy.configure(CONTROLS, {
			enabled: true,
			bindings: { ...DEFAULT_KEYBOARD_JOYSTICK.bindings, btn_1: { minus: "Space" } },
		});
	});

	it("moves an axis to its end while the key is down, back to the centre when up", () => {
		expect(joy.handleKey("ArrowLeft", true)).toBe(true);
		expect(analog[0]).toBe(-1);
		expect(joy.isDriving("axis", 0)).toBe(true);
		joy.handleKey("ArrowLeft", false);
		expect(analog[0]).toBe(0);
		expect(joy.isDriving("axis", 0)).toBe(false);
		joy.handleKey("ArrowDown", true);
		expect(analog[1]).toBe(1);
	});

	it("cancels out two opposite keys, and keeps the other when one is released", () => {
		joy.handleKey("ArrowLeft", true);
		joy.handleKey("ArrowRight", true);
		expect(analog[0]).toBe(0);
		joy.handleKey("ArrowLeft", false);
		expect(analog[0]).toBe(1);
	});

	it("presses a button and drives both axes at once (diagonals)", () => {
		joy.handleKey("ArrowUp", true);
		joy.handleKey("ArrowRight", true);
		joy.handleKey("Space", true);
		expect(analog).toEqual([1, -1]);
		expect(buttons[1]).toBe(true);
		joy.handleKey("Space", false);
		expect(buttons[1]).toBe(false);
	});

	it("lets unbound keys through, and every key when disabled", () => {
		expect(joy.handleKey("KeyA", true)).toBe(false);
		joy.configure(CONTROLS, { ...DEFAULT_KEYBOARD_JOYSTICK, enabled: false });
		expect(joy.handleKey("ArrowLeft", true)).toBe(false);
		expect(analog[0]).toBe(0);
	});

	it("centres what was held on releaseAll and on reconfigure", () => {
		joy.handleKey("ArrowLeft", true);
		joy.handleKey("Space", true);
		joy.releaseAll();
		expect(analog[0]).toBe(0);
		expect(buttons[1]).toBe(false);
		joy.handleKey("ArrowUp", true);
		joy.configure(CONTROLS, { ...DEFAULT_KEYBOARD_JOYSTICK, enabled: false });
		expect(analog[1]).toBe(0);
	});
});
