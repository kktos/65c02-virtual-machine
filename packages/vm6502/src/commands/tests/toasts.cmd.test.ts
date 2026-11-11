import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "vue-sonner";
import type { CommandContext, ParamList } from "@/types/command";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
vi.stubGlobal("requestAnimationFrame", (cb: () => void) => cb());

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { toastsCmd } = await import("../toasts.cmd");

const run = async (...params: ParamList) => toastsCmd.fn({ params } as unknown as CommandContext);

describe("TOASTS command", () => {
	afterEach(() => {
		for (const t of toast.getToasts()) toast.dismiss(t.id);
	});

	it("lists the toasts on screen", async () => {
		expect(await run()).toBe("No toasts.");
		toast.error("BRK hit at $6000");
		toast("hello");
		expect(await run()).toBe("[error] BRK hit at $6000\nhello");
	});

	it("`clear` closes them all", async () => {
		toast.error("BRK hit at $6000");
		toast.error("BRK hit at $6000");
		expect(await run({ text: "clear", value: undefined })).toBe("2 toast(s) cleared.");
		expect(await run()).toBe("No toasts.");
		expect(await run({ text: "CLEAR", value: undefined })).toBe("No toasts.");
	});

	it("rejects anything else", async () => {
		await expect(run({ text: "all", value: undefined })).rejects.toThrow("Expected `clear`.");
	});
});
