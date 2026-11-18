// Hypercalls on the //e bus: the CPU decodes the call as it sees memory, banking included.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initCPU, setClockSpeed, setHypercalls, setRunning, stepInstruction } from "@/virtualmachine/cpu/cpu.65c02";
import { MEMORY_OFFSET, REG_PC_OFFSET, REG_SP_OFFSET, STACK_METADATA_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import { AppleBus } from "../apple.bus";
import { apple2e } from "../apple.machine";

describe("Apple //e hypercalls", () => {
	let bus: AppleBus;
	let registersView: DataView;
	let postMessage: ReturnType<typeof vi.fn>;

	const hypercalls = () =>
		postMessage.mock.calls
			.map(([m]) => m)
			.filter((m) => m.type === "hypercall")
			.map((m) => m.call);
	const pc = () => registersView.getUint16(REG_PC_OFFSET, true);

	beforeEach(() => {
		postMessage = vi.fn();
		vi.stubGlobal("self", { postMessage });
		vi.stubGlobal("performance", { now: () => 0 });
		// Like the worker: registers, memory and stack metadata in one buffer (the cards read the registers).
		const size = apple2e.memory.size;
		const buffer = new SharedArrayBuffer(MEMORY_OFFSET + size);
		registersView = new DataView(buffer, 0, MEMORY_OFFSET);
		const memory = new Uint8Array(buffer, MEMORY_OFFSET, size);
		bus = new AppleBus(memory);
		bus.setRegistersView(registersView);
		initCPU(bus, registersView, null, memory, new Uint8Array(buffer, STACK_METADATA_OFFSET, 256));
		setClockSpeed(0);
		setRunning(false);
		setHypercalls(true);
		registersView.setUint8(REG_SP_OFFSET, 0xff);
	});

	it("decodes a call in the aux language card (ALTZP on), its arguments in main RAM", () => {
		bus.lcReadRam = true;
		bus.lcBank2 = true;
		bus.altZp = true;
		// main LC holds something else at the same address: no hypercall there
		bus.writeDebug(0xd1f9, 0xea);
		bus.writeDebug(0xd1fa, 0xea);
		// aux LC: BRK $01 <$2000> (LOG_STRING)
		[0x00, 0x01, 0x00, 0x20].forEach((byte, i) => bus.writeDebug(0x1d1f9 + i, byte));
		// "HI" in main RAM (RAMRD off), "NO" in aux
		[0xc8, 0xc9, 0x00].forEach((byte, i) => bus.writeDebug(0x2000 + i, byte));
		[0xce, 0xcf, 0x00].forEach((byte, i) => bus.writeDebug(0x12000 + i, byte));

		registersView.setUint16(REG_PC_OFFSET, 0xd1f9, true);
		stepInstruction();

		expect(hypercalls()).toEqual([expect.objectContaining({ cmd: 0x01, address: 0xd1f9, message: "HI" })]);
		expect(pc()).toBe(0xd1fd);
	});
});
