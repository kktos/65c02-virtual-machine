// The //e's built-in timer ($C0B8-$C0BA), a periodic interrupt source on IMU ID 8: a device (conf/devices.conf.ts),
// loaded and wired as the VM does.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseHexData } from "@/lib/array.utils";
import { initCPU, setIrqLine, setRunning, stepInstruction, triggerNmi } from "@/virtualmachine/cpu/cpu.65c02";
import { MEMORY_OFFSET, REG_PC_OFFSET, STACK_METADATA_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { installDevices, loadDevices } from "@/virtualmachine/cpu/loaders/device.loader";
import type { DeviceConfig, LoadedDevice } from "@/types/machine.interface";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";
import { TIMER_IMU_ID } from "../conf/devices.conf";
import { AppleTimer, FRAME_CYCLES, TIMER_DEFAULT_PERIOD } from "../devices/timer.device";

const CTRL = 0xc0b8;
const ACK = 0xc0b9;
const PERIOD = 0xc0ba;

let devices: LoadedDevice[] = [];
beforeAll(async () => {
	devices = await loadDevices(apple2e.devices);
});

const boot = (installed: LoadedDevice[] = devices) => {
	vi.stubGlobal("self", { postMessage: () => undefined });
	vi.stubGlobal("performance", { now: () => 0 });
	const size = apple2e.memory.size;
	const buffer = new SharedArrayBuffer(MEMORY_OFFSET + size);
	const regs = new DataView(buffer, 0, MEMORY_OFFSET);
	const mem = new Uint8Array(buffer, MEMORY_OFFSET, size);
	const bus = new AppleBus(mem);
	bus.installDevices(installed);
	bus.setRegistersView(regs);
	for (const c of apple2e.memory.chunks ?? [])
		bus.load(c.addr, typeof c.data === "string" ? parseHexData(c.data) : (c.data as Uint8Array), c.bank, c.tag);
	initCPU(bus, regs, null, mem, new Uint8Array(buffer, STACK_METADATA_OFFSET, 256));
	setRunning(false);
	setIrqLine(false);
	bus.setInterruptLines({ irq: setIrqLine, nmi: triggerNmi });
	return { bus, regs };
};

const pending = (bus: AppleBus) => bus.imu.getState().pending & (1 << TIMER_IMU_ID);

describe("//e timer", () => {
	it("is stopped at reset: never interrupts a program that didn't start it", () => {
		const { bus } = boot();
		expect(bus.read(CTRL)).toBe(0);
		expect(bus.read(PERIOD)).toBe(TIMER_DEFAULT_PERIOD);
		bus.tick(FRAME_CYCLES * 200);
		expect(pending(bus)).toBe(0);
	});

	it("pulses every PERIOD frames, its line held until acknowledged", () => {
		const { bus } = boot();
		bus.write(CTRL, 0x80);
		bus.tick(FRAME_CYCLES * TIMER_DEFAULT_PERIOD - 1);
		expect(bus.read(CTRL)).toBe(0x80);
		bus.tick(1);
		expect(bus.read(CTRL)).toBe(0x81); // running, fired
		expect(pending(bus)).not.toBe(0);
		bus.tick(FRAME_CYCLES * 10);
		expect(pending(bus)).not.toBe(0); // held
		bus.write(ACK, 0);
		expect(pending(bus)).toBe(0);
		expect(bus.read(ACK)).toBe(0);
	});

	it("keeps its phase: the next pulse comes a period after the previous one", () => {
		const { bus } = boot();
		bus.write(PERIOD, 2);
		bus.write(CTRL, 0x80);
		bus.tick(FRAME_CYCLES * 2 + 100); // late by 100 cycles
		bus.write(ACK, 0);
		bus.tick(FRAME_CYCLES * 2 - 101);
		expect(pending(bus)).toBe(0);
		bus.tick(1);
		expect(pending(bus)).not.toBe(0);
	});

	it("stops, and a period of 0 means 256 frames", () => {
		const { bus } = boot();
		bus.write(PERIOD, 0);
		bus.write(CTRL, 0x80);
		bus.tick(FRAME_CYCLES * 255);
		expect(pending(bus)).toBe(0);
		bus.tick(FRAME_CYCLES);
		expect(pending(bus)).not.toBe(0);
		bus.write(ACK, 0);
		bus.write(CTRL, 0);
		bus.tick(FRAME_CYCLES * 300);
		expect(pending(bus)).toBe(0);
	});

	it("is stopped, its line released, by a reset", () => {
		const { bus } = boot();
		bus.write(PERIOD, 1);
		bus.write(CTRL, 0x80);
		bus.tick(FRAME_CYCLES);
		expect(pending(bus)).not.toBe(0);
		bus.reset();
		expect(pending(bus)).toBe(0);
		expect(bus.read(CTRL)).toBe(0);
		expect(bus.read(PERIOD)).toBe(TIMER_DEFAULT_PERIOD);
	});

	it("restores a save state from before the devices (the timer's state at the top)", () => {
		const { bus } = boot();
		bus.write(PERIOD, 3);
		bus.write(CTRL, 0x80);
		const { devices: deviceStates, ...state } = structuredClone(bus.snapshot());
		bus.reset();
		bus.restoreSnapshot({ ...state, timer: deviceStates?.timer });
		expect(bus.read(CTRL)).toBe(0x80);
		expect(bus.read(PERIOD)).toBe(3);
	});

	it("keeps its state in a save state", () => {
		const { bus } = boot();
		bus.write(PERIOD, 3);
		bus.write(CTRL, 0x80);
		bus.tick(FRAME_CYCLES * 3 + 10);
		const state = structuredClone(bus.snapshot());
		bus.reset();
		bus.restoreSnapshot(state);
		expect(bus.read(CTRL)).toBe(0x81);
		expect(bus.read(PERIOD)).toBe(3);
		expect(pending(bus)).not.toBe(0);
		bus.write(ACK, 0);
		bus.tick(FRAME_CYCLES * 3 - 11);
		expect(pending(bus)).toBe(0);
		bus.tick(1);
		expect(pending(bus)).not.toBe(0);
	});

	// The program of examples/imu-timer.asm (see IMU.md), at a period of one frame
	it("vectored on ID 8: a handler counts the pulses at the top right of the text screen", () => {
		const { bus, regs } = boot();
		// oxfmt-ignore
		const install = [
			0x08,                         // PHP
			0x78,                         // SEI
			0xa9, 0x28, 0x8d, 0xb0, 0xc0, // LDA #$20+8 / STA IMU_INDEX: HANDLER 8
			0xa9, 0x23, 0x8d, 0xb1, 0xc0, // LDA #<TICK / STA IMU_DATALO: staged
			0xa9, 0x03, 0x8d, 0xb2, 0xc0, // LDA #>TICK / STA IMU_DATAHI: committed
			0xa9, 0x00, 0x8d, 0xb0, 0xc0, // LDA #$00 / STA IMU_INDEX: CTRL
			0xa9, 0x80, 0x8d, 0xb1, 0xc0, // LDA #$80 / STA IMU_DATALO: vectoring on
			0xa9, 0x80, 0x8d, 0xb8, 0xc0, // LDA #$80 / STA TMR_CTRL: timer on
			0x28,                         // PLP
			0x58,                         // CLI
			0x60,                         // RTS
		];
		// oxfmt-ignore
		const tick = [
			0x48,                         // $0323 TICK: PHA
			0x8d, 0xb9, 0xc0,             // STA TMR_ACK: the timer releases its line
			0xf8,                         // SED
			0x18,                         // CLC
			0xad, 0x65, 0x03,             // LDA COUNT
			0x69, 0x01,                   // ADC #1
			0x8d, 0x65, 0x03,             // STA COUNT
			0xad, 0x66, 0x03,             // LDA COUNT+1
			0x69, 0x00,                   // ADC #0
			0x8d, 0x66, 0x03,             // STA COUNT+1
			0xd8,                         // CLD
			0xad, 0x66, 0x03,             // LDA COUNT+1
			0x20, 0x57, 0x03,             // JSR DIGITS
			0x8d, 0x25, 0x04,             // STA $0425
			0x8e, 0x24, 0x04,             // STX $0424
			0xad, 0x65, 0x03,             // LDA COUNT
			0x20, 0x57, 0x03,             // JSR DIGITS
			0x8d, 0x27, 0x04,             // STA $0427
			0x8e, 0x26, 0x04,             // STX $0426
			0x8d, 0xb3, 0xc0,             // STA IMU_EOI
			0x68,                         // PLA
			0x40,                         // RTI
			0x48,                         // $0357 DIGITS: PHA
			0x4a, 0x4a, 0x4a, 0x4a,       // LSR x4
			0x09, 0xb0,                   // ORA #$B0
			0xaa,                         // TAX
			0x68,                         // PLA
			0x29, 0x0f,                   // AND #$0F
			0x09, 0xb0,                   // ORA #$B0
			0x60,                         // RTS
			0x00, 0x00,                   // $0365 COUNT
		];
		// oxfmt-ignore
		const main = [
			0xa9, 0x01, 0x8d, 0xba, 0xc0, // LDA #1 / STA TMR_PERIOD: every frame (keeps the test short)
			0x20, 0x00, 0x03,             // JSR INSTALL
			0x4c, 0x88, 0x02,             // JMP *
		];
		[...install, ...tick].forEach((byte, index) => bus.write(0x300 + index, byte));
		main.forEach((byte, index) => bus.write(0x280 + index, byte));
		bus.write(0x3fe, 0x00); // $3FE → $0000: the ROM path would never count
		bus.write(0x3ff, 0x00);
		regs.setUint16(REG_PC_OFFSET, 0x280, true);

		const start = bus.totalCycles;
		for (let i = 0; i < 100_000 && bus.totalCycles - start < FRAME_CYCLES * 12 + 200; i++) stepInstruction();

		const text = [0x424, 0x425, 0x426, 0x427].map((addr) => String.fromCharCode(bus.read(addr) & 0x7f)).join("");
		expect(text).toBe("0012");
		expect(bus.read(0xc0b3)).toBe(0xff); // CURRENT: nothing in service
		expect(bus.imu.getFrames()).toHaveLength(0);
	});
});

describe("//e devices", () => {
	const timer = apple2e.devices?.find((device) => device.id === "timer") as DeviceConfig;
	const withOptions = (options: DeviceConfig["options"], id = "other"): LoadedDevice => ({
		config: { ...timer, id, options },
		Class: AppleTimer,
	});

	it("loads the keyboard and the timer from the machine's config", () => {
		expect(devices.map(({ config }) => config.id)).toEqual(["keyboard", "timer"]);
		expect(devices[1]?.Class).toBe(AppleTimer);
	});

	it("leaves out a device whose module or class isn't there", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const loaded = await loadDevices([
			{ ...timer, id: "nopath", path: "apple2/devices/nothing.device" },
			{ ...timer, id: "noclass", class: "Nothing" },
			timer,
		]);
		expect(loaded.map(({ config }) => config.id)).toEqual(["timer"]);
		expect(error).toHaveBeenCalledTimes(2);
		error.mockRestore();
	});

	it("installs the devices through IBus.installDevices", async () => {
		const bus = new AppleBus(new Uint8Array(apple2e.memory.size));
		await installDevices(bus, apple2e.devices);
		expect(bus.getInterrupts().sources[TIMER_IMU_ID]).toBe("Timer ($C0B8)");
	});

	it("without the timer, $C0B8-$C0BF reads 0 and ID 8 has no source", () => {
		const { bus } = boot([]);
		bus.write(CTRL, 0x80);
		expect(bus.read(CTRL)).toBe(0);
		expect(bus.read(PERIOD)).toBe(0);
		expect(bus.getInterrupts().sources[TIMER_IMU_ID]).toBeNull();
	});

	it("wires a device elsewhere: its I/O range and its IMU ID come from its options", () => {
		// Slot 6 is empty by default
		const { bus } = boot([withOptions({ io: { address: 0xc0e0, size: 3 }, irq: 9 }, "timer")]);
		bus.write(0xc0e2, 1);
		bus.write(0xc0e0, 0x80);
		bus.tick(FRAME_CYCLES);
		expect(bus.read(0xc0e0)).toBe(0x81);
		expect(bus.imu.getState().pending & (1 << 9)).not.toBe(0);
		expect(bus.read(CTRL)).toBe(0); // not at $C0B8 anymore
		expect(bus.getInterrupts().sources[9]).toBe("Timer ($C0E0)");
	});

	it.each([
		["the IMU's registers", { io: { address: 0xc0b4, size: 8 } }],
		["a card's I/O (slot 7: the Mockingboard)", { io: { address: 0xc0f0, size: 1 } }],
		["the soft switches", { io: { address: 0xc050, size: 1 } }],
		["another device's I/O", { io: { address: 0xc0bf, size: 1 } }],
		["a slot's I/O as soft switches", { switches: { read: [0xc0e0] } }],
		["another device's soft switch", { switches: { write: [0xc010] } }],
		["another device's I/O as a soft switch", { switches: { read: [0xc0b8] } }],
		["a slot's IMU ID", { irq: 7 }],
		["another device's IMU ID", { irq: TIMER_IMU_ID }],
		["no IMU ID", { irq: 16 }],
	])("doesn't install a device over %s", (_, options) => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { bus } = boot([...devices, withOptions(options)]);
		expect(error).toHaveBeenCalledWith(expect.stringContaining('device "other" not installed'));
		expect(Object.keys(bus.snapshot().devices ?? {})).toEqual(["keyboard", "timer"]);
		error.mockRestore();
	});

	it("takes over the //e's own soft switches, by access", () => {
		// The timer's PERIOD read at $C050 (TXTCLR), written at $C051 (TXTSET): the other access stays the //e's
		class SwitchTimer extends AppleTimer {
			readSwitch() {
				return this.read(2);
			}
			writeSwitch(_address: number, value: number) {
				this.write(2, value);
			}
		}
		const loaded = withOptions({ switches: { read: [0xc050], write: [0xc051] } });
		const { bus } = boot([{ ...loaded, Class: SwitchTimer }]);
		bus.write(0xc050, 0); // still TXTCLR
		expect(bus.text).toBe(false);
		bus.write(0xc051, 5); // the device's, not TXTSET
		expect(bus.text).toBe(false);
		expect(bus.read(0xc050)).toBe(5);
		expect(bus.text).toBe(false); // the read is the device's too
	});

	it("doesn't install two devices with the same id", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const { bus } = boot([...devices, withOptions({ irq: 9 }, "timer")]);
		expect(error).toHaveBeenCalledWith(expect.stringContaining("its id is already taken"));
		expect(bus.getInterrupts().sources[9]).toBeNull();
		error.mockRestore();
	});
});
