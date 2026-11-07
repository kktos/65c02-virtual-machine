import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import type { StopInfo } from "@/types/stopinfo.interface";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// A fake machine: the test scripts what happens after `play()`.
const isRunning = ref(false);
type Step = { after: number; running: boolean; stop?: StopInfo };
let script: Step[] = [];

const later = (ms: number, fn: () => void) => setTimeout(fn, ms);
const vm = {
	ready: Promise.resolve(),
	sharedRegisters: new DataView(new ArrayBuffer(64)),
	lastStop: undefined as StopInfo | undefined,
	machineConfig: { name: "Apple //e" },
	play: vi.fn(() => {
		let t = 0;
		later(1, () => (isRunning.value = true));
		for (const step of script) {
			t += step.after;
			later(t, () => {
				if (step.stop) vm.lastStop = { ...step.stop }; // a new object per stop, like the real VM
				isRunning.value = step.running;
			});
		}
	}),
	pause: vi.fn(() => {
		vm.lastStop = { reason: "pause" };
		isRunning.value = false;
	}),
	addBP: vi.fn(),
	removeBP: vi.fn(),
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));

const { findTool } = await import("@/lib/mcp/tools");
const runUntil = (input: Record<string, unknown>) =>
	findTool("run_until")!.execute(input, {}).then((r) => JSON.parse(r));
const getRegisters = () => findTool("get_registers")!.execute({}, {}).then((r) => JSON.parse(r));

describe("run_until stop reason", () => {
	beforeEach(() => {
		isRunning.value = false;
		vm.lastStop = undefined;
		vm.pause.mockClear();
	});

	it("reached_address when the temporary breakpoint at `address` is hit", async () => {
		script = [{ after: 5, running: false, stop: { reason: "breakpoint", breakpointType: "pc", address: 0x300 } }];
		expect(await runUntil({ address: "$300" })).toMatchObject({ stopped: "reached_address", address: "$0300" });
	});

	it("breakpoint elsewhere, with its type and address", async () => {
		script = [{ after: 5, running: false, stop: { reason: "breakpoint", breakpointType: "write", address: 0x2000 } }];
		expect(await runUntil({ address: "$300" })).toMatchObject({
			stopped: "breakpoint",
			breakpoint: { type: "write", address: "$2000" },
		});
	});

	it("brk / step / error", async () => {
		script = [{ after: 5, running: false, stop: { reason: "brk", address: 0x0003 } }];
		expect(await runUntil({})).toMatchObject({ stopped: "brk", address: "$0003" });

		script = [{ after: 5, running: false, stop: { reason: "error", address: 0x1234, message: "Unimplemented opcode 02" } }];
		expect(await runUntil({})).toMatchObject({ stopped: "error", address: "$1234", message: "Unimplemented opcode 02" });
	});

	it("keeps waiting through a hypercall (the machine resumes by itself)", async () => {
		script = [
			{ after: 5, running: false, stop: { reason: "hypercall", address: 0x0800 } },
			{ after: 5, running: true },
			{ after: 5, running: false, stop: { reason: "brk", address: 0x0900 } },
		];
		expect(await runUntil({})).toMatchObject({ stopped: "brk", address: "$0900" });
	});

	it("timeout: pauses and says so", async () => {
		script = [];
		expect(await runUntil({ timeout_ms: 30 })).toMatchObject({ stopped: "timeout (paused)", running: false });
		expect(vm.pause).toHaveBeenCalled();
	});

	it("get_registers reports the last stop when not running", async () => {
		vm.lastStop = { reason: "brk", address: 0x0003 };
		expect(await getRegisters()).toMatchObject({ running: false, last_stop: { stopped: "brk", address: "$0003" } });
		isRunning.value = true;
		expect((await getRegisters()).last_stop).toBeUndefined();
	});
});
