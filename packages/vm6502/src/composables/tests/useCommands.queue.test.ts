import { describe, expect, it, vi } from "vitest";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// A slow command the test releases by hand, a fast one, and a multi-line one (terminator END).
let releaseSlow = () => {};
const order: string[] = [];
vi.mock("@/commands", () => ({
	COMMAND_LIST: {
		SLOW: {
			fn: () =>
				new Promise<string>((resolve) => {
					releaseSlow = () => {
						order.push("slow");
						resolve("slow done");
					};
				}),
		},
		FAST: {
			fn: () => {
				order.push("fast");
				return "fast done";
			},
		},
		FAIL: {
			fn: () => {
				throw new Error("boom");
			},
		},
		MULTI: {
			fn: () => ({
				__isMultiLineRequest: true,
				prompt: "* ",
				terminator: "END",
				onLine: () => undefined,
				onComplete: () => "multi done",
			}),
		},
	},
}));
// Cut the import cycles / heavy deps that the queue doesn't need.
vi.mock("@/commands/do.cmd", () => ({ handleDoCommand: vi.fn(), END_ROUTINE_MARKER: "__end__" }));
vi.mock("@/lib/mini-monitor/mini-monitor", () => ({ minimonitor: vi.fn() }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));

const { useCommands } = await import("@/composables/useCommands");
const { executeCommand, runCommand, isMultiLine } = useCommands();
const vm = {} as VirtualMachine;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("command queue", () => {
	it("runs a command issued while another is running after it, with its own output", async () => {
		order.length = 0;
		const consoleCall = executeCommand("SLOW", vm);
		await flush();
		const mcpCall = runCommand("FAST", vm, { standalone: true });
		await flush();
		expect(order).toEqual([]); // FAST waits for SLOW

		releaseSlow();
		expect(await consoleCall).toBe(true);
		const report = await mcpCall;
		expect(order).toEqual(["slow", "fast"]);
		expect(report).toEqual({ ok: true, output: [{ content: "fast done", format: "text" }], error: undefined });
	});

	it("keeps going after a failing command", async () => {
		const failing = runCommand("FAIL", vm);
		const next = runCommand("FAST", vm);
		expect(await failing).toMatchObject({ ok: false, error: "boom" });
		expect((await next).ok).toBe(true);
	});

	it("standalone: refuses to feed lines into the user's multi-line session", async () => {
		expect(await executeCommand("MULTI", vm)).toBe(true);
		expect(isMultiLine.value).toBe(true);

		const report = await runCommand("FAST", vm, { standalone: true });
		expect(report.ok).toBe(false);
		expect(report.error).toMatch(/multi-line mode .*'END'/);
		expect(isMultiLine.value).toBe(true); // user's session untouched

		await executeCommand("END", vm);
		expect(isMultiLine.value).toBe(false);
	});

	it("standalone: runs a whole multi-line command in one call", async () => {
		const report = await runCommand("MULTI\nline 1\nEND", vm, { standalone: true });
		expect(report.ok).toBe(true);
		expect(report.output.map((o) => o.content)).toContain("multi done");
		expect(isMultiLine.value).toBe(false);
	});

	it("standalone: closes a multi-line session it left open", async () => {
		const report = await runCommand("MULTI\nline 1", vm, { standalone: true });
		expect(report.ok).toBe(false);
		expect(report.error).toMatch(/not terminated.*'END'/);
		expect(isMultiLine.value).toBe(false);
	});
});
