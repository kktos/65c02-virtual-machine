import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import type { StepResult, StopInfo } from "@/types/stopinfo.interface";
import { REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const isRunning = ref(false);
let stepResult: StepResult = { executed: 1, address: 0x301 };
const vm = {
	ready: Promise.resolve(),
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	lastStop: undefined as StopInfo | undefined,
	step: vi.fn(async (_count: number) => {
		vm.sharedRegisters.setUint16(REG_PC_OFFSET, stepResult.address, true);
		return stepResult;
	}),
	reset: vi.fn(async () => {
		isRunning.value = false;
		vm.sharedRegisters.setUint16(REG_PC_OFFSET, 0xfa62, true);
	}),
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));

const { findTool } = await import("@/lib/mcp/tools");
const call = (name: string, input: Record<string, unknown> = {}) =>
	findTool(name)!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));

describe("step tool", () => {
	beforeEach(() => {
		isRunning.value = false;
		vm.step.mockClear();
	});

	it("steps one instruction by default and returns the registers", async () => {
		stepResult = { executed: 1, address: 0x301 };
		const result = await call("step");
		expect(vm.step).toHaveBeenCalledWith(1);
		expect(result).toMatchObject({ executed: 1, PC: "$0301", running: false });
		expect(result).not.toHaveProperty("stopped");
	});

	it("passes `count` and reports why it stopped early", async () => {
		stepResult = {
			executed: 3,
			address: 0x303,
			stop: { reason: "breakpoint", breakpointType: "pc", address: 0x303 },
		};
		expect(await call("step", { count: 10 })).toMatchObject({
			executed: 3,
			stopped: "breakpoint",
			breakpoint: { type: "pc", address: "$0303" },
			PC: "$0303",
		});
		expect(vm.step).toHaveBeenCalledWith(10);

		stepResult = { executed: 2, address: 0x307, stop: { reason: "hypercall", address: 0x305, cmd: 0x02 } };
		expect(await call("step", { count: 10 })).toMatchObject({ stopped: "hypercall", command: "LOG_REGS" });
	});

	it("refuses while running, and a bad count", async () => {
		await expect(call("step", { count: 0 })).rejects.toThrow(/count/);
		isRunning.value = true;
		await expect(call("step")).rejects.toThrow(/pause it first/);
		expect(vm.step).not.toHaveBeenCalled();
	});
});

describe("reset tool", () => {
	it("resets and returns the registers, paused", async () => {
		isRunning.value = true;
		expect(await call("reset")).toMatchObject({ running: false, PC: "$FA62" });
		expect(vm.reset).toHaveBeenCalled();
	});
});
