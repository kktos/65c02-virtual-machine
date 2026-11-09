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

// The registers are read when `pc` is parsed: it is one, as well as a breakpoint type.
const vm = {
	addBP: vi.fn(),
	removeBP: vi.fn(),
	sharedRegisters: { getUint8: () => 0, getUint16: () => 0 },
} as unknown as VirtualMachine;
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

	it("BD / BE disable and enable, by type or across types, and say when there is nothing to do", async () => {
		await run("bp $300");
		await run("bpa $300");
		await run("bpw $400:$7ff");

		expect(await run("bd pc $300")).toBe("Breakpoint (pc) at $00:0300 disabled");
		expect(await run("bd pc $300")).toBe("Breakpoint (pc) at $00:0300 already disabled");
		expect(await run("list bp $300")).toContain("| PC | $00:0300 | off |");
		expect(await run("list bp $300")).toContain("| ACCESS | $00:0300 | on |");

		// No type: all those at exactly that address, not the ranges it falls in.
		expect(await run("be $300")).toBe(
			"Breakpoint (pc) at $00:0300 enabled\nBreakpoint (access) at $00:0300 already enabled",
		);
		expect(await run("bd $500")).toBe("No breakpoint at $00:0500");
		expect(await run("bd write $400:$7ff")).toBe("Breakpoint (write) at $00:0400-$00:07FF disabled");
		expect(await run("bd read $300")).toBe("No breakpoint (read) at $00:0300");
	});

	it("BD / BE all, but the temporary breakpoints", async () => {
		expect(await run("bd all")).toBe("No breakpoints defined.");
		await run("bp $300");
		await run("bpr $c000");
		useBreakpoints().addBreakpoint({ type: "pc", address: 0xffff, isTemporary: true });
		expect(await run("bd all")).toBe(
			"Breakpoint (pc) at $00:0300 disabled\nBreakpoint (read) at $00:C000 disabled",
		);
		expect(useBreakpoints().getBreakpoint({ type: "pc", address: 0xffff })?.enabled).toBe(true);
		expect(await run("be all")).toContain("Breakpoint (read) at $00:C000 enabled");
	});

	it("BD takes a label for the address, and rejects an unknown type", async () => {
		await expect(run("bd nope")).rejects.toThrow("Unknown label 'nope'");
		await expect(run("bd foo $300")).rejects.toThrow("Unknown breakpoint type 'foo'");
		await expect(run("bd all $300")).rejects.toThrow("Nothing expected after `all`");
	});

	it("ON sets a hook, with or without `do`; OFF turns it off and ON alone back on", async () => {
		expect(await run('on access $c057 do "print 1"')).toBe("Hook set on ACCESS @ $00:C057");
		expect(useBreakpoints().getBreakpoint({ type: "access", address: 0xc057 })?.command).toBe("print 1;run");
		expect(await run('on pc $300 "regs"')).toBe("Hook set on PC @ $00:0300");

		expect(await run("off access $c057")).toBe("Hook on ACCESS @ $00:C057 off");
		expect(await run("off access $c057")).toBe("Hook on ACCESS @ $00:C057 already off");
		const hook = useBreakpoints().getBreakpoint({ type: "access", address: 0xc057 });
		expect(hook).toMatchObject({ enabled: false, command: "print 1;run" });

		expect(await run("on access $c057")).toBe("Hook on ACCESS @ $00:C057 on");
		expect(await run("on access $c057")).toBe("Hook on ACCESS @ $00:C057 already on");
		// The hooks are breakpoints: BD / BE work on them too.
		expect(await run("bd pc $300")).toBe("Breakpoint (pc) at $00:0300 disabled");
	});

	it("OFF on no hook is not an error; ON with no hook and no command is", async () => {
		expect(await run("off pc $300")).toBe("No hook on PC @ $00:0300");
		await run("bp $300"); // a plain breakpoint is not a hook
		expect(await run("off pc $300")).toBe("No hook on PC @ $00:0300");
		await expect(run("on pc $300")).rejects.toThrow("No hook on PC @ $00:0300 to turn on");
		await expect(run("on pc $300 nop")).rejects.toThrow("Expected `once` or `do`, got 'nop'");
		await expect(run("on pc $300 do")).rejects.toThrow("Missing command to execute after `do`");
		await expect(run('on foo $300 "x"')).rejects.toThrow("Invalid hook type 'foo'");
	});

	it("ON ... once sets a hook turned off on its first hit, which ON turns back on", async () => {
		expect(await run('on access $c057 once do "print 1"')).toBe("Hook set on ACCESS @ $00:C057 (once)");
		expect(await run('on pc $300 once "regs"')).toBe("Hook set on PC @ $00:0300 (once)");
		expect(await run("list bp $c057")).toContain("| ACCESS | $00:C057 | on (once) | print 1;run |");
		expect(await run("list hooks")).toContain("| ACCESS | $00:C057 | on (once) | print 1;run |");

		const { takeHit, getBreakpoint } = useBreakpoints();
		expect(takeHit("read", 0xc057, vm)?.command).toBe("print 1;run");
		expect(getBreakpoint({ type: "access", address: 0xc057 })).toMatchObject({ enabled: false, once: true });
		expect(takeHit("write", 0xc057, vm)).toBeUndefined(); // off: no longer fires

		// ON alone turns it back on, still once.
		expect(await run("on access $c057")).toBe("Hook on ACCESS @ $00:C057 on (once)");
		expect(takeHit("read", 0xc057, vm)).toBeDefined();
		expect(getBreakpoint({ type: "access", address: 0xc057 })?.enabled).toBe(false);
	});

	it("ON with a command and no `once` sets an ordinary hook again; ON <type> <address> once makes it once", async () => {
		await run('on pc $300 once "regs"');
		expect(await run('on pc $300 "regs"')).toBe("Hook set on PC @ $00:0300");
		expect(useBreakpoints().getBreakpoint({ type: "pc", address: 0x300 })?.once).toBeUndefined();

		expect(await run("on pc $300 once")).toBe("Hook on PC @ $00:0300 on (once)");
		expect(useBreakpoints().getBreakpoint({ type: "pc", address: 0x300 })).toMatchObject({
			enabled: true,
			once: true,
			command: "regs;run",
		});
		await expect(run("on pc $300 once nop")).rejects.toThrow("Expected `do`, got 'nop'");
	});

	it("ON ... do takes one command unquoted, as typed; `;` and `|>` end it, as anywhere else", async () => {
		const command = () => useBreakpoints().getBreakpoint({ type: "pc", address: 0x300 })?.command;

		expect(await run("on pc $300 do nop")).toBe("Hook set on PC @ $00:0300");
		expect(command()).toBe("nop;run");
		await run("on pc $300 once do a=$10");
		expect(command()).toBe("a=$10;run");
		await run('on pc $300 DO print "a;b" --x');
		expect(command()).toBe('print "a;b" --x;run');
		await run("on pc $300 do &fix");
		expect(command()).toBe("&fix;run");

		// `bp $400` is not the hook's: it runs now.
		expect(await run("on pc $300 do print 1; bp $400")).toBe(
			"Hook set on PC @ $00:0300\nBreakpoint (pc) at $00:0400 added",
		);
		expect(command()).toBe("print 1;run");
		await run("on pc $300 do regs |> nop");
		expect(command()).toBe("regs;run");

		// Several commands: quoted, in either quotes.
		await run(`on pc $300 do 'print "x"; regs'`);
		expect(command()).toBe('print "x"; regs;run');
	});

	it("ON ... do wants a command: a routine is run with &", async () => {
		await expect(run("on pc $300 do myRoutine")).rejects.toThrow(
			"Unknown command 'myRoutine' (a routine is run with &myRoutine)",
		);
		await expect(run('on pc $300 do "regs" "cls"')).rejects.toThrow(
			`Nothing expected after the quoted command, got '"cls"'`,
		);
	});
});
