import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandContext, ParamList } from "@/types/command";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
vi.stubGlobal("requestAnimationFrame", (cb: () => void) => cb());

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { logCmd } = await import("../log.cmd");
const { useLogWindows } = await import("@/composables/useLogWindows");

// A name as the parser gives it: its text and its value (a register, a label; undefined when unknown)
const name = (text: string, value?: number) => ({ text, value });
const run = async (...params: ParamList) => logCmd.fn({ params } as unknown as CommandContext);
const lines = () => useLogWindows().getLines("spk").map((entry) => entry.text);

describe("LOG command", () => {
	beforeEach(() => {
		useLogWindows().open("spk");
		useLogWindows().clear("spk");
	});

	it("logs a first arg that is a name by its value, not as an unknown subcommand (a hook's `log spk PC;run`)", async () => {
		expect(await run(name("spk"), name("PC", 0xfa62))).toBe("");
		expect(await run(name("spk"), name("A", 3), 8)).toBe("");
		expect(lines()).toEqual(["$FA62", "$03 $08"]);
	});

	it("logs strings and values (the args after the first come evaluated)", async () => {
		await run(name("spk"), "pc=", 0x300);
		expect(lines()).toEqual(["pc= $0300"]);
	});

	it("logs whole numbers in hex: a byte, a word, a banked address; the others as they are", async () => {
		await run(name("spk"), 0, 0xff, 0x100, 0xffff, 0x1c030);
		await run(name("spk"), -1, 1.5, undefined);
		await run(name("spk"), name("nolabel"));
		expect(lines()).toEqual(["$00 $FF $0100 $FFFF $01C030", "-1 1.5 undefined", "undefined"]);
	});

	it("still takes the subcommands, whatever their case", async () => {
		await run(name("spk"), "x");
		expect(await run(name("spk"), name("CLEAR"))).toBe("Log window 'spk' cleared.");
		expect(lines()).toEqual([]);
		expect(await run(name("spk"), name("open"))).toBe("Log window 'spk' opened.");
		expect(await run(name("spk"), name("close"))).toBe("Log window 'spk' closed.");
	});
});
