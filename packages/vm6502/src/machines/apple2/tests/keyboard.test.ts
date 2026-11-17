// The //e keyboard, a device: latch, strobe, AKD, the Apple keys, and the typed keys queue (paste, type_keys, the
// `key` command).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHexData } from "@/lib/array.utils";
import { initCPU, setRunning, stepInstruction } from "@/virtualmachine/cpu/cpu.65c02";
import { deleteMachineStates, restoreMachineState, saveMachineState } from "@/virtualmachine/cpu/saveStates";
import { MEMORY_OFFSET, REG_PC_OFFSET, STACK_METADATA_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";
import { AppleKeyboard, textToKeyCodes } from "../devices/keyboard.device";
import { loadDevices } from "@/virtualmachine/cpu/loaders/device.loader";
import type { LoadedDevice } from "@/types/machine.interface";

let devices: LoadedDevice[] = [];
beforeAll(async () => {
	devices = await loadDevices(apple2e.devices);
});

describe("AppleKeyboard", () => {
	let now = 0;
	let kbd: AppleKeyboard;
	beforeEach(() => {
		now = 100_000;
		kbd = new AppleKeyboard({
			bus: {
				get totalCycles() {
					return now;
				},
			},
		});
		kbd.keyDelay = 1000;
	});

	/** What a program waiting for a key does: poll $C000, then clear the strobe. */
	const getKey = () => {
		const value = kbd.readData();
		if (value & 0x80) kbd.clearStrobe();
		return value;
	};

	it("gives the typed keys one at a time, as the program reads them", () => {
		kbd.type([0x41, 0x42]);
		expect(kbd.getKeyboardState()).toMatchObject({ queued: 2, strobe: false });
		expect(getKey()).toBe(0xc1);
		// the next one only after the delay
		expect(getKey()).toBe(0x41);
		now += 999;
		expect(getKey()).toBe(0x41);
		now += 1;
		expect(getKey()).toBe(0xc2);
		now += 5000;
		expect(getKey()).toBe(0x42);
		expect(kbd.getKeyboardState().queued).toBe(0);
	});

	it("doesn't give a key while the previous one isn't consumed", () => {
		kbd.type([0x41, 0x42]);
		expect(kbd.readData()).toBe(0xc1);
		now += 10_000;
		expect(kbd.readData()).toBe(0xc1);
		expect(kbd.getKeyboardState().queued).toBe(1);
	});

	it("a flush within the delay doesn't eat the next key", () => {
		kbd.type([0x41, 0x42]);
		expect(getKey()).toBe(0xc1);
		now += 500;
		kbd.clearStrobe(); // STA $C010: nothing latched, nothing lost
		now += 500;
		expect(getKey()).toBe(0xc2);
	});

	it("with no delay, gives the next key as soon as the program asks", () => {
		kbd.keyDelay = 0;
		kbd.type([0x41, 0x42]);
		expect(getKey()).toBe(0xc1);
		expect(getKey()).toBe(0xc2);
	});

	it("polling AKD ($C010) doesn't hold the queue back", () => {
		kbd.type([0x41]);
		for (let i = 0; i < 10; i++) {
			kbd.readStrobe();
			now += 200;
		}
		expect(kbd.readData()).toBe(0xc1);
	});

	it("reads AKD and the latch at $C010: down while a typed key isn't consumed", () => {
		kbd.type([0x41]);
		expect(kbd.readStrobe()).toBe(0x00); // nothing latched yet, nothing down
		kbd.readData();
		expect(kbd.readStrobe()).toBe(0xc1); // down, and the read clears the strobe
		expect(kbd.readStrobe()).toBe(0x41); // up
		expect(kbd.readData()).toBe(0x41);
	});

	it("holds a key: latched at once, down, repeating, until released", () => {
		kbd.hold(0x20);
		expect(kbd.readStrobe()).toBe(0xa0);
		expect(kbd.getKeyboardState()).toMatchObject({ held: 0x20, keyDown: true });
		expect(kbd.readData()).toBe(0x20); // no repeat yet
		now += 512_000;
		expect(getKey()).toBe(0xa0);
		expect(getKey()).toBe(0x20);
		now += 68_000;
		expect(getKey()).toBe(0xa0);

		kbd.hold(-1);
		now += 1_000_000;
		expect(getKey()).toBe(0x20);
		expect(kbd.readStrobe() & 0x80).toBe(0);
	});

	it("a real key interrupts the typing, and is down until released", () => {
		kbd.type([0x41, 0x42]);
		kbd.press(0x5a, "KeyZ");
		expect(kbd.getKeyboardState()).toMatchObject({ queued: 0, keyDown: true });
		expect(getKey()).toBe(0xda);
		expect(kbd.readStrobe() & 0x80).toBe(0x80);
		kbd.release("KeyZ");
		expect(kbd.readStrobe() & 0x80).toBe(0);

		kbd.press(0x5a, "KeyZ");
		kbd.releaseAll();
		expect(kbd.getKeyboardState().keyDown).toBe(false);
	});

	it("keeps the keys over a reset, where the cycle counter restarts", () => {
		kbd.type([0x41, 0x42]);
		expect(getKey()).toBe(0xc1);
		now = 0;
		kbd.reset();
		now = 1000;
		expect(getKey()).toBe(0xc2);
	});

	it("maps text to key codes", () => {
		expect(textToKeyCodes("Ab\n1\r\n2\r\x1bé")).toEqual({
			codes: [0x41, 0x62, 0x0d, 0x31, 0x0d, 0x32, 0x0d, 0x1b],
			skipped: 1,
		});
	});
});

describe("typed keys on the //e", () => {
	const KEYIN_LOOP = 0xc28b; // waiting for a key at the BASIC prompt
	let bus: AppleBus;
	let regs: DataView;
	let mem: Uint8Array;
	let stack: Uint8Array;

	const pc = () => regs.getUint16(REG_PC_OFFSET, true);
	const steps = (n: number) => {
		for (let i = 0; i < n; i++) stepInstruction();
	};
	const screen = () => bus.getTextScreen().join("\n");

	beforeEach(() => {
		vi.stubGlobal("self", { postMessage: () => undefined });
		vi.stubGlobal("performance", { now: () => 0 });
		const size = apple2e.memory.size;
		const buffer = new SharedArrayBuffer(MEMORY_OFFSET + size);
		regs = new DataView(buffer, 0, MEMORY_OFFSET);
		mem = new Uint8Array(buffer, MEMORY_OFFSET, size);
		stack = new Uint8Array(buffer, STACK_METADATA_OFFSET, 256);
		bus = new AppleBus(mem);
		bus.installDevices(devices);
		bus.setRegistersView(regs);
		for (const c of apple2e.memory.chunks ?? [])
			bus.load(c.addr, typeof c.data === "string" ? parseHexData(c.data) : (c.data as Uint8Array), c.bank, c.tag);
		initCPU(bus, regs, null, mem, stack);
		setRunning(false);
		for (let i = 0; i < 3_000_000 && pc() !== KEYIN_LOOP; i++) stepInstruction();
		expect(pc()).toBe(KEYIN_LOOP);
	});

	it("types a whole line at the BASIC prompt, none lost", () => {
		expect(bus.typeText("PRINT 12*34\n")).toEqual({ queued: 12, skipped: 0 });
		steps(500_000);
		expect(bus.getKeyboardState().queued).toBe(0);
		expect(screen()).toContain("]PRINT 12*34\n408");
	});

	it("keeps the queue in a save state", () => {
		deleteMachineStates();
		const views = { registers: regs, stackMetadata: stack, memory: mem, bus };
		bus.typeText("PRINT 7\n");
		bus.setKeyDelay(0);
		for (let i = 0; i < 100_000 && bus.getKeyboardState().queued > 4; i++) stepInstruction(); // a few keys in
		const queued = bus.getKeyboardState().queued;
		expect(queued).toBe(4);
		saveMachineState("typing", views);

		steps(200_000);
		expect(screen()).toContain("]PRINT 7\n7");

		restoreMachineState("typing", views);
		expect(bus.getKeyboardState().queued).toBe(queued);
		steps(200_000);
		expect(screen()).toContain("]PRINT 7\n7");
	});

	it("holds a key: the program sees it down at $C010", () => {
		bus.holdKey("A");
		expect(bus.read(0xc010) & 0x80).toBe(0x80);
		bus.holdKey(null);
		expect(bus.read(0xc010) & 0x80).toBe(0);
		expect(() => bus.holdKey("é")).toThrow("No key");
	});

	it("reads the latch in the low 7 bits of $C011-$C01F, the strobe untouched", () => {
		bus.pressKey("A", "KeyA");
		bus.releaseKey("A", "KeyA");
		bus.text = true;
		bus.hires = false;
		expect(bus.read(0xc01a)).toBe(0xc1); // TEXT on
		expect(bus.read(0xc01d)).toBe(0x41); // HIRES off
		for (let addr = 0xc011; addr <= 0xc01f; addr++) expect(bus.read(addr) & 0x7f).toBe(0x41);
		expect(bus.getKeyboardState().strobe).toBe(true);
	});
});

describe("the keyboard device on the //e", () => {
	const OPEN_APPLE = 0xc061;
	const SOLID_APPLE = 0xc062;
	const busWith = (installed = devices) => {
		vi.stubGlobal("self", { postMessage: () => undefined });
		vi.stubGlobal("performance", { now: () => 0 });
		const bus = new AppleBus(new Uint8Array(apple2e.memory.size));
		bus.installDevices(installed);
		return bus;
	};

	it("maps the host's keys: characters, Ctrl, Return and the arrows", () => {
		const bus = busWith();
		const latched = (key: string, ctrl = false) => {
			bus.pressKey(key, undefined, ctrl);
			const value = bus.read(0xc010);
			bus.releaseKey(key);
			return value & 0x7f;
		};
		expect(latched("a")).toBe(0x61);
		expect(latched("c", true)).toBe(0x03);
		expect(latched("Enter")).toBe(0x0d);
		expect(latched("ArrowLeft")).toBe(0x08);
		expect(latched("ArrowRight")).toBe(0x15);
		expect(latched("ArrowUp")).toBe(0x0b);
		expect(latched("ArrowDown")).toBe(0x0a);
		expect(latched("Escape")).toBe(0x1b);
		bus.pressKey("Shift", "ShiftLeft"); // no key for it: the latch stays
		expect(bus.read(0xc000)).toBe(0x1b);
	});

	it("reads the latch at any of $C000-$C00F, whose writes stay the memory switches", () => {
		const bus = busWith();
		bus.pressKey("A", "KeyA");
		for (let addr = 0xc000; addr <= 0xc00f; addr++) expect(bus.read(addr)).toBe(0xc1);
		bus.write(0xc001, 0); // 80STOREON
		expect(bus.store80).toBe(true);
		bus.write(0xc010, 0);
		expect(bus.read(0xc00f)).toBe(0x41);
	});

	it("has the Apple keys at $C061 / $C062, ORed with the joystick's buttons", () => {
		const bus = busWith();
		bus.pressKey("Alt", "AltLeft");
		expect(bus.read(OPEN_APPLE)).toBe(0x80);
		expect(bus.read(SOLID_APPLE)).toBe(0x00);
		expect(bus.read(0xc010) & 0x80).toBe(0); // not a key for AKD
		bus.pressKey("Alt", "AltRight");
		expect(bus.read(SOLID_APPLE)).toBe(0x80);
		bus.releaseKey("Alt", "AltLeft");
		expect(bus.read(OPEN_APPLE)).toBe(0x00);
		bus.joy_pb0 = true;
		expect(bus.read(OPEN_APPLE)).toBe(0x80);
		bus.joy_pb0 = false;

		bus.releaseKey(); // the page lost the focus
		expect(bus.read(SOLID_APPLE)).toBe(0x00);
		bus.pressKey("Alt", "AltLeft");
		bus.reset();
		expect(bus.read(OPEN_APPLE)).toBe(0x00);
	});

	it("keeps its state in the save state's devices", () => {
		const bus = busWith();
		bus.pressKey("Alt", "AltLeft");
		bus.pressKey("Q", "KeyQ");
		bus.typeText("RUN");
		const state = structuredClone(bus.snapshot());
		expect(state.devices?.keyboard).toMatchObject({
			latch: 0x51,
			strobe: true,
			openApple: true,
			queue: [0x52, 0x55, 0x4e],
		});

		const other = busWith();
		other.restoreSnapshot(state);
		expect(other.read(0xc000)).toBe(0xd1);
		expect(other.read(OPEN_APPLE)).toBe(0x80);
		expect(other.getKeyboardState().queued).toBe(3);
	});

	it("restores a save state from before the keyboard device (its latch, strobe, Apple keys in the bus's fields)", () => {
		const { devices: deviceStates, ...state } = structuredClone(busWith().snapshot());
		const {
			latch: _l,
			strobe: _s,
			openApple: _o,
			solidApple: _a,
			...keyboard
		} = (deviceStates?.keyboard ?? {}) as Record<string, unknown>;
		const old = {
			...state,
			fields: { ...state.fields, lastKey: 0x5a, keyStrobe: true, kbd_pb0: false, kbd_pb1: true },
			keyboard: { ...keyboard, queue: [0x41] },
			devices: { timer: deviceStates?.timer },
		};
		const bus = busWith();
		bus.restoreSnapshot(old);
		expect(bus.read(0xc000)).toBe(0xda);
		expect(bus.read(SOLID_APPLE)).toBe(0x80);
		expect(bus.getKeyboardState().queued).toBe(1);
		expect(bus).not.toHaveProperty("lastKey");
	});

	it("without a keyboard, nothing is typed: $C000 reads 0, the typing calls throw", () => {
		const error = vi.spyOn(console, "warn").mockImplementation(() => {});
		const bus = busWith([]);
		bus.pressKey("A", "KeyA");
		bus.pressKey("Alt", "AltLeft");
		expect(bus.read(0xc000)).toBe(0);
		expect(bus.read(0xc010)).toBe(0);
		expect(bus.read(OPEN_APPLE)).toBe(0);
		bus.text = true;
		expect(bus.read(0xc01a)).toBe(0x80);
		expect(() => bus.typeText("A")).toThrow("no keyboard");
		expect(() => bus.getKeyboardState()).toThrow("no keyboard");
		expect(error).not.toHaveBeenCalled(); // the ROM polls $C000: silently
		error.mockRestore();
	});

	it("doesn't install a second keyboard", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const keyboard = devices[0] as LoadedDevice;
		const bus = busWith([keyboard, { ...keyboard, config: { ...keyboard.config, id: "keyboard2", options: {} } }]);
		expect(error).toHaveBeenCalledWith(expect.stringContaining("there is a keyboard already"));
		expect(Object.keys(bus.snapshot().devices ?? {})).toEqual(["keyboard"]);
		error.mockRestore();
	});
});
