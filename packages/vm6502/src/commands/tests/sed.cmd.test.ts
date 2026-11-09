import { describe, expect, it, vi } from "vitest";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { useCommands } = await import("@/composables/useCommands");

const { runCommand } = useCommands();
const vm = {} as VirtualMachine;

describe("SED", () => {
	it("edits the piped content", async () => {
		// The pipeline of the Apple II `hd` routine, fed with a line of the HD command
		const report = await runCommand(
			String.raw`print "0300: A9 00 8D  ..." |> tr text |> sed //.+?:\s*((?:[0-9A-F]{2} )+)\s+.+// "$1"`,
			vm,
			{ standalone: true },
		);

		expect(report.error).toBeUndefined();
		expect(report.output.map((o) => o.content)).toEqual(["A9 00 8D "]);
	});

	it("still takes the content as an argument", async () => {
		const report = await runCommand(`sed //b// "B" "abc"`, vm, { standalone: true });

		expect(report.error).toBeUndefined();
		expect(report.output.map((o) => o.content)).toEqual(["aBc"]);
	});
});
