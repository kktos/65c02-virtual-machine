import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { CommandContext, ParamList } from "@/types/command";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { useBreakpoints } = await import("@/composables/useBreakpoints");
const { execAddBP } = await import("../addBP.cmd");
const { execRemoveBP } = await import("../removeBP.cmd");
const { listCmd } = await import("../list.cmd");

const vm = { addBP: vi.fn(), removeBP: vi.fn() } as unknown as VirtualMachine;
const ctx = (...params: ParamList) => ({ vm, params }) as unknown as CommandContext;
const list = async (...params: ParamList) => {
	const res = await listCmd.fn(ctx({ text: "bp", value: undefined }, ...params));
	return typeof res === "object" && res && "content" in res ? res.content : res;
};

beforeEach(async () => {
	const { breakpoints, removeBreakpoint } = useBreakpoints();
	for (const bp of breakpoints.value) removeBreakpoint(bp);
	vi.clearAllMocks();
});

describe("BP / BC report what actually happened", () => {
	it("says 'already set' instead of adding a duplicate", async () => {
		expect(await execAddBP("pc")(ctx(0xc600))).toBe("Breakpoint (pc) at $00:C600 added");
		expect(await execAddBP("pc")(ctx(0xc600))).toBe("Breakpoint (pc) at $00:C600 already set");
		expect(vm.addBP).toHaveBeenCalledTimes(1);
	});

	it("flags an existing breakpoint that is disabled", async () => {
		await execAddBP("write")(ctx({ start: 0x400, end: 0x7ff }));
		useBreakpoints().toggleBreakpointEnable({ type: "write", address: 0x400, endAddress: 0x7ff });
		expect(await execAddBP("write")(ctx({ start: 0x400, end: 0x7ff }))).toBe(
			"Breakpoint (write) at $00:0400-$00:07FF already set (disabled)",
		);
	});

	it("says when there is nothing to remove", async () => {
		expect(await execRemoveBP("pc")(ctx(0x300))).toBe("No breakpoint (pc) at $00:0300");
		expect(vm.removeBP).not.toHaveBeenCalled();
		await execAddBP("pc")(ctx(0x300));
		expect(await execRemoveBP("pc")(ctx(0x300))).toBe("Breakpoint (pc) at $00:0300 removed");
		expect(vm.removeBP).toHaveBeenCalledTimes(1);
	});

	it("only removes a breakpoint of the matching type", async () => {
		await execAddBP("read")(ctx(0xc000));
		expect(await execRemoveBP("pc")(ctx(0xc000))).toBe("No breakpoint (pc) at $00:C000");
		expect(useBreakpoints().breakpoints.value).toHaveLength(1);
	});
});

describe("LIST BREAKPOINTS", () => {
	it("reports when there are none", async () => {
		expect(await list()).toBe("No breakpoints defined.");
		expect(await list(0xc600)).toBe("No breakpoint at $00:C600.");
	});

	it("lists plain breakpoints and hooks together", async () => {
		await execAddBP("pc")(ctx(0xc600));
		useBreakpoints().addBreakpoint({ type: "read", address: 0xc000, command: "print a" });
		const out = await list();
		expect(out).toContain("| PC | $00:C600 | on |  |");
		expect(out).toContain("| READ | $00:C000 | on | print a |");
	});

	it("filters by address, matching ranges that contain it", async () => {
		await execAddBP("pc")(ctx(0xc600));
		await execAddBP("write")(ctx({ start: 0x400, end: 0x7ff }));
		const out = await list(0x500);
		expect(out).toContain("| WRITE | $00:0400-$00:07FF |");
		expect(out).not.toContain("C600");
		expect(await list(0x800)).toBe("No breakpoint at $00:0800.");
	});

	it("filters by range overlap and by label", async () => {
		await execAddBP("pc")(ctx(0xc600));
		await execAddBP("pc")(ctx(0xfded));
		expect(await list({ start: 0xc000, end: 0xcfff })).toContain("$00:C600");
		expect(await list({ start: 0xc000, end: 0xcfff })).not.toContain("FDED");
		expect(await list({ text: "COUT", value: 0xfded })).toContain("$00:FDED");
		await expect(list({ text: "NOPE", value: undefined })).rejects.toThrow("Unknown label 'NOPE'");
	});

	it("marks temporary breakpoints", async () => {
		useBreakpoints().addBreakpoint({ type: "pc", address: 0xffff, isTemporary: true });
		expect(await list()).toContain("| on (temp) |");
	});

	it("is reachable as BP, BPS and BREAKPOINTS; B still means buffers", async () => {
		for (const text of ["bp", "bps", "breakpoints", "br"]) {
			const res = await listCmd.fn(ctx({ text, value: undefined }));
			expect(res).toMatchObject({ content: "No breakpoints defined." });
		}
		const res = await listCmd.fn(ctx({ text: "b", value: undefined }));
		expect(res).not.toMatchObject({ content: "No breakpoints defined." });
	});
});

describe("through the command parser", () => {
	const run = async (input: string) => {
		const { useCommands } = await import("@/composables/useCommands");
		const report = await useCommands().runCommand(input, vm, { standalone: true });
		if (!report.ok) throw new Error(report.error);
		return report.output.map((o) => o.content).join("\n");
	};

	it("accepts an address or a range after LIST BP, and still a routine name after LIST ROUTINES", async () => {
		expect(await run("bp $c600")).toBe("Breakpoint (pc) at $00:C600 added");
		expect(await run("bpw $400:$7ff")).toBe("Breakpoint (write) at $00:0400-$00:07FF added");
		expect(await run("list bp $c600")).toContain("| PC | $00:C600 |");
		expect(await run("list bp $500")).toContain("| WRITE |");
		expect(await run("list bp $300:$3ff")).toBe("No breakpoint in $00:0300-$00:03FF.");
		expect(await run("list bp")).toContain("| WRITE |");
		expect(await run("list routines foo")).toBe("No routines defined."); // name still parses
	});
});
