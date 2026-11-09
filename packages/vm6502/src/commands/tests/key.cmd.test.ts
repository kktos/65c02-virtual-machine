import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyboardState } from "@/types/bus.interface";
import type { CommandContext, ParamList } from "@/types/command";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

// Load the registry first, as the app does: going through useCommands first trips its import cycle.
await import("@/commands");
const { keyCmd } = await import("../key.cmd");
const { useMachine } = await import("@/composables/useMachine");

const state: KeyboardState = { queued: 0, held: null, delay: 10_000, latch: 0, strobe: false, keyDown: false };
const answer = () => Promise.resolve({ state: { ...state } });
const vm = {
	bus: { getKeyboardState: () => state },
	typeText: vi.fn(async (text: string) => ({
		state: { ...state, queued: text.length },
		queued: text.length,
		skipped: 0,
	})),
	holdKey: vi.fn(answer),
	clearKeys: vi.fn(answer),
	setKeyDelay: vi.fn(answer),
	getKeyboardState: vi.fn(answer),
};

const id = (text: string) => ({ text, value: undefined });
const run = (...params: ParamList) => keyCmd.fn({ vm, params } as unknown as CommandContext);

describe("KEY command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useMachine().vm.value = vm as never;
	});

	it("shows the keyboard state", async () => {
		expect(await run()).toBe("Keys queued: 0, held: none, delay: 10000 cycles, latch: $00, key down: no");
	});

	it("types a string", async () => {
		expect(await run("RUN\r")).toMatch(/^Typed 4 keys\. Keys queued: 4/);
		expect(vm.typeText).toHaveBeenCalledWith("RUN\r");
	});

	it("holds a key (a character or a code) and releases it", async () => {
		await run(id("hold"), "A");
		expect(vm.holdKey).toHaveBeenLastCalledWith("A");
		await run(id("HOLD"), 0x20);
		expect(vm.holdKey).toHaveBeenLastCalledWith(0x20);
		await run(id("release"));
		expect(vm.holdKey).toHaveBeenLastCalledWith(null);
		await expect(run(id("hold"))).rejects.toThrow("KEY HOLD needs a key");
	});

	it("clears the queue", async () => {
		await run(id("clear"));
		expect(vm.clearKeys).toHaveBeenCalled();
	});

	it("sets the delay, kept for the next machine", async () => {
		await run(id("delay"), 50_000);
		expect(vm.setKeyDelay).toHaveBeenCalledWith(50_000);
		expect(useMachine().keyDelay.value).toBe(50_000);
		await expect(run(id("delay"))).rejects.toThrow("KEY DELAY needs a number");
	});

	it("rejects anything else, and a machine without keyboard", async () => {
		await expect(run(id("press"))).rejects.toThrow("Expected");
		await expect(keyCmd.fn({ vm: {}, params: [] } as unknown as CommandContext)).rejects.toThrow("no keyboard");
	});
});

describe("string escapes for keys", async () => {
	const { ExpressionParser } = await import("@/lib/expressionParser/expressionParser");
	const text = (source: string) => new ExpressionParser(source, vm as never).getTokens()[0]?.text;

	it("has \\e for Esc and \\xNN for any code", () => {
		expect(text('"a\\eb"')).toBe("a\x1bb");
		expect(text('"\\x03\\x7F!"')).toBe("\x03\x7f!");
		expect(text('"\\n\\t"')).toBe("\n\t");
		expect(() => text('"\\xZ1"')).toThrow("two hex digits");
	});
});
