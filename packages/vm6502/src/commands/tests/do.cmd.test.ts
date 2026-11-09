import "fake-indexeddb/auto";
import { useEventBus } from "@vueuse/core";
import { describe, expect, it, vi } from "vitest";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { useCommands } = await import("@/composables/useCommands");
const { useRoutines } = await import("@/composables/useRoutines");
const { useCmdConsole } = await import("@/composables/useCmdConsole");

const { runCommand } = useCommands();
const { setRoutine, getRoutine } = useRoutines();
const vm = {} as VirtualMachine;

describe("DO a script", () => {
	it("skips its own comments and blank lines but keeps those of a routine it defines", async () => {
		setRoutine(
			"script",
			[
				"; the script's comment",
				"",
				"routine inner @a",
				"  ; inner comment",
				"",
				"  print @a",
				"end",
				"  ; trailing script comment",
			].join("\n"),
		);

		const report = await runCommand("do script", vm, { standalone: true });

		expect(report.error).toBeUndefined();
		expect(report.ok).toBe(true);
		expect(getRoutine("inner")?.lines).toEqual(["  ; inner comment", "", "  print @a"]);
	});

	it("runs a routine whose body holds comments", async () => {
		const printed: string[] = [];
		const off = useEventBus<string>(useCmdConsole().BUS_KEY).on((event, payload) => {
			if (event === "print") printed.push((payload as [string, string])[1]);
		});
		setRoutine("commented", ["; header", "", "print 42", "  ; footer"].join("\n"));

		const report = await runCommand("do commented", vm, { standalone: true });
		off();

		expect(report.error).toBeUndefined();
		expect(printed).toEqual(["42"]);
	});
});
