import { describe, expect, it, vi } from "vitest";
import type { CommandContext, ParamList } from "@/types/command";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { brkCmd } = await import("../brk.cmd");
const { useMachine } = await import("@/composables/useMachine");

const run = async (...params: ParamList) => brkCmd.fn({ params } as unknown as CommandContext);

describe("BRK command", () => {
	it("shows the setting, on by default", async () => {
		expect(await run()).toBe("Break on BRK: on");
	});

	it("switches it, and the toolbar sees the change", async () => {
		const setBreakOnBrk = vi.fn();
		useMachine().vm.value = { setBreakOnBrk } as never;

		expect(await run({ text: "off", value: undefined })).toBe("Break on BRK: off");
		expect(useMachine().breakOnBrk.value).toBe(false);
		expect(setBreakOnBrk).toHaveBeenLastCalledWith(false);

		expect(await run({ text: "ON", value: undefined })).toBe("Break on BRK: on");
		expect(setBreakOnBrk).toHaveBeenLastCalledWith(true);
		useMachine().vm.value = null;
	});

	it("rejects anything else", async () => {
		await expect(run({ text: "maybe", value: undefined })).rejects.toThrow("Expected `on` or `off`.");
		await expect(run(1)).rejects.toThrow("Expected `on` or `off`.");
	});
});
