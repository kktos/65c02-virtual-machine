// AppleMouse card (HLE): the host's motion moved into the clamping window, the firmware calls through the screen holes.
import { describe, expect, it } from "vitest";
import type { IBus } from "@/types/bus.interface";
import {
	INPUT_ANALOG_0_OFFSET,
	INPUT_DIGITAL_OFFSET,
	MEMORY_OFFSET,
	REG_A_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import { MOUSE_HOST_RANGE, MouseCard } from "../slots/mouse.card";

const SLOT = 4;

// The HLE routines' I/O offsets ($C080 + slot * 16 + n)
const SERVE = 0x01;
const READ = 0x02;
const CLEAR = 0x03;
const POS = 0x04;
const CLAMP = 0x05;
const HOME = 0x06;
const INIT = 0x07;

const setup = () => {
	const mem = new Uint8Array(0x10000);
	const bus = {
		read: (a: number) => mem[a] ?? 0,
		write: (a: number, v: number) => {
			mem[a] = v & 0xff;
		},
	} as unknown as IBus;
	const registers = new DataView(new ArrayBuffer(MEMORY_OFFSET));
	const card = new MouseCard(bus, SLOT, new Uint8Array(256));
	card.setRegisters(registers);

	/** Puts the host mouse at (x, y) units (wrapping), buttons as given, and lets the card see it. */
	const host = (x: number, y: number, buttons = 0) => {
		const wrap = (v: number) => ((v % MOUSE_HOST_RANGE) + MOUSE_HOST_RANGE) % MOUSE_HOST_RANGE;
		registers.setFloat32(INPUT_ANALOG_0_OFFSET + 8, wrap(x) / MOUSE_HOST_RANGE, true);
		registers.setFloat32(INPUT_ANALOG_0_OFFSET + 12, wrap(y) / MOUSE_HOST_RANGE, true);
		registers.setUint8(INPUT_DIGITAL_OFFSET, buttons);
		card.tick?.(1);
	};
	const call = (io: number, a = 0) => {
		registers.setUint8(REG_A_OFFSET, a);
		card.writeIo(io, 0);
	};
	/** READMOUSE, then the position and status from the card's screen holes. */
	const read = () => {
		call(READ);
		const s16 = (lo: number, hi: number) => (((mem[hi]! << 8) | mem[lo]!) << 16) >> 16;
		return {
			x: s16(0x478 + SLOT, 0x578 + SLOT),
			y: s16(0x4f8 + SLOT, 0x5f8 + SLOT),
			status: mem[0x778 + SLOT]!,
		};
	};
	/** CLAMPMOUSE for axis 0 (X) or 1 (Y): bounds in slot 0's screen holes. */
	const clampTo = (axis: number, min: number, max: number) => {
		mem[0x478] = min & 0xff;
		mem[0x578] = (min >> 8) & 0xff;
		mem[0x4f8] = max & 0xff;
		mem[0x5f8] = (max >> 8) & 0xff;
		call(CLAMP, axis);
	};
	return { mem, card, host, call, read, clampTo };
};

describe("AppleMouse card", () => {
	it("moves by the host's motion, not to its position", () => {
		const { host, call, read } = setup();
		call(INIT);
		host(500, 700); // first reading: only the reference
		expect(read()).toMatchObject({ x: 0, y: 0 });
		host(510, 703);
		expect(read()).toMatchObject({ x: 10, y: 3 });
	});

	it("follows the host across its wrap", () => {
		const { mem, host, call, read } = setup();
		call(INIT);
		mem[0x478 + SLOT] = 0xf4; // POSMOUSE to X = $01F4 = 500
		mem[0x578 + SLOT] = 0x01;
		call(POS);
		host(1000, 0);
		host(MOUSE_HOST_RANGE + 6, 0); // 1000 -> 1030, wrapped to 6: +30
		expect(read().x).toBe(530);
		host(990, 0); // 6 -> 990, back down across 0: -40
		expect(read().x).toBe(490);
	});

	it("clamps to the CLAMPMOUSE window and loses the motion past an edge", () => {
		const { host, call, read, clampTo } = setup();
		call(INIT);
		clampTo(0, 0, 279);
		clampTo(1, 0, 191);
		host(0, 0);
		host(400, 300); // way past the bottom-right corner
		expect(read()).toMatchObject({ x: 279, y: 191 });
		host(390, 295); // coming back: leaves the edge at once (no banked motion)
		expect(read()).toMatchObject({ x: 269, y: 186 });
	});

	it("brings the position inside a new clamping window", () => {
		const { host, call, read, clampTo } = setup();
		call(INIT);
		host(0, 0);
		host(300, 300); // (a step under MOUSE_HOST_RANGE / 2 at a time: more reads as going the other way round)
		host(600, 600);
		clampTo(0, 0, 279);
		clampTo(1, 0, 191);
		expect(read()).toMatchObject({ x: 279, y: 191 });
	});

	it("takes signed bounds", () => {
		const { host, call, read, clampTo } = setup();
		call(INIT);
		clampTo(0, -100, 100);
		host(50, 0);
		host(0, 0);
		expect(read().x).toBe(-50);
		host(-200, 0);
		expect(read().x).toBe(-100);
	});

	it("POSMOUSE puts the mouse at the position in the card's screen holes, clamped", () => {
		const { mem, host, call, read, clampTo } = setup();
		call(INIT);
		clampTo(0, 0, 279);
		clampTo(1, 0, 191);
		mem[0x478 + SLOT] = 0x2c; // X = $012C = 300 -> 279
		mem[0x578 + SLOT] = 0x01;
		mem[0x4f8 + SLOT] = 100;
		mem[0x5f8 + SLOT] = 0;
		call(POS);
		expect(read()).toMatchObject({ x: 279, y: 100 });
		host(0, 0);
		host(-9, 1); // and the host moves it from there
		expect(read()).toMatchObject({ x: 270, y: 101 });
	});

	it("HOMEMOUSE goes to the window's top-left corner, CLEARMOUSE to 0,0", () => {
		const { host, call, read, clampTo } = setup();
		call(INIT);
		clampTo(0, 10, 279);
		clampTo(1, 20, 191);
		host(0, 0);
		host(100, 100);
		call(HOME);
		expect(read()).toMatchObject({ x: 10, y: 20 });
		clampTo(0, -50, 279);
		clampTo(1, -50, 191);
		host(150, 150);
		call(CLEAR);
		expect(read()).toMatchObject({ x: 0, y: 0 });
	});

	it("reports the button now and at the last reading, and the motion since", () => {
		const { host, call, read } = setup();
		call(INIT);
		host(0, 0);
		expect(read().status).toBe(0x00);
		host(0, 0, 0b0001_0000); // left button: digital input 4
		expect(read().status).toBe(0x80); // down, was up
		expect(read().status).toBe(0xc0); // down, was down
		host(3, 0, 0b0001_0000);
		expect(read().status).toBe(0xe0); // down, was down, moved
		host(3, 0, 0);
		expect(read().status).toBe(0x40); // up, was down
		call(SERVE);
		expect(read().status).toBe(0x00);
	});

	it("ignores the game port pushbuttons (digital inputs 0-3)", () => {
		const { host, call, read } = setup();
		call(INIT);
		host(0, 0, 0b0000_1111);
		expect(read().status & 0xc0).toBe(0);
	});

	it("doesn't jump after a save state is restored", () => {
		const { card, host, call, read } = setup();
		call(INIT);
		host(0, 0);
		host(40, 40);
		const state = card.snapshot();
		host(100, 100);
		card.restoreSnapshot(state);
		host(700, 900); // the host moved on meanwhile: new reference, no motion
		expect(read()).toMatchObject({ x: 40, y: 40 });
		host(705, 900);
		expect(read()).toMatchObject({ x: 45, y: 40 });
	});
});
