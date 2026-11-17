import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import { IMU, IMU_CTRL_ENABLE, IMU_REG_CTRL, IMU_REG_HANDLER, IMU_REG_HBANK, IMU_REG_MASK } from "@/machines/chips/imu";
import type { InterruptsState } from "@/types/interrupts.interface";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// The worker side, run in-process: a real IMU, wired as on the //e (ID n: slot n).
let imu = new IMU({ irq: () => undefined });
const SOURCES = [null, null, "Slot 2: ThunderClock", null, "Slot 4: AppleMouse", null, null, "Slot 7: Mockingboard"];
const vm = {
	ready: Promise.resolve(),
	machineConfig: { name: "Apple //e" },
	getInterrupts: vi.fn(async (): Promise<InterruptsState | null> => ({ ...imu.getState(), sources: SOURCES })),
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning: ref(false) }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));

const { findTool } = await import("@/lib/mcp/tools");
const call = () =>
	findTool("get_interrupts")!
		.execute({}, {})
		.then((r) => JSON.parse(r as string));

const set8 = (reg: number, value: number) => {
	imu.write(0, reg);
	imu.write(1, value);
};
const set16 = (reg: number, value: number) => {
	set8(reg, value & 0xff);
	imu.write(2, value >> 8);
};

describe("get_interrupts tool", () => {
	beforeEach(() => {
		imu = new IMU({ irq: () => undefined });
		vi.clearAllMocks();
	});

	it("is read-only", () => {
		expect(findTool("get_interrupts")!.annotations?.readOnlyHint).toBe(true);
	});

	it("reports the reset IMU: disabled, no handlers, PRIO n = n", async () => {
		const result = await call();
		expect(result).toMatchObject({ enabled: false, auto_eoi: false, irq_line: false, current: null, index: "$00" });
		expect(result.ids).toHaveLength(16);
		expect(result.ids[7]).toEqual({
			id: 7,
			source: "Slot 7: Mockingboard",
			prio: 7,
			handler: null,
			pending: false,
			masked: false,
			in_service: false,
			eligible: false,
			requests: 0,
			dispatches: 0,
		});
		expect(result.ids[0].source).toBeNull();
		expect(result.frames).toEqual([]);
	});

	it("reports handlers, banks, the lines, the mask, what is in service, and the frames", async () => {
		set8(IMU_REG_HBANK + 7, 2);
		set8(IMU_REG_HANDLER + 7, 0x80);
		imu.write(2, 0x03);
		set16(IMU_REG_MASK, 0x10);
		set8(IMU_REG_CTRL, IMU_CTRL_ENABLE);
		imu.setLine(4, true);
		imu.setLine(7, true);
		imu.irqVector(0xfc);
		imu.setLine(2, true);

		const result = await call();
		expect(result).toMatchObject({ enabled: true, current: 7, irq_line: true, index: "$00" });
		expect(result.ids[7]).toMatchObject({
			handler: "$0380",
			bank: 2,
			pending: true,
			in_service: true,
			eligible: false,
		});
		expect(result.ids[7]).toMatchObject({ requests: 1, dispatches: 1 });
		expect(result.ids[4]).toMatchObject({
			pending: true,
			masked: true,
			eligible: false,
			requests: 1,
			dispatches: 0,
		});
		expect(result.ids[2]).toMatchObject({ pending: true, masked: false, eligible: true, handler: null });
		expect(result.ids[2]).not.toHaveProperty("bank");
		expect(result.frames).toEqual([{ id: 7, sp: "$FC", saved: 0 }]);
	});

	it("fails on a machine without an IMU", async () => {
		vm.getInterrupts.mockResolvedValueOnce(null);
		await expect(call()).rejects.toThrow("has no interrupt controller");
	});
});
