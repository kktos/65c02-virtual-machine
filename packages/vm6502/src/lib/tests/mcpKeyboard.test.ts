import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import type { KeyboardState } from "@/types/bus.interface";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const isRunning = ref(false);
const state: KeyboardState = { queued: 0, held: null, delay: 10_000, latch: 0, strobe: false, keyDown: false };
const vm = {
	ready: Promise.resolve(),
	typeText: vi.fn(async (text: string) => ({
		state: { ...state, queued: text.length },
		queued: text.length,
		skipped: 0,
	})),
	holdKey: vi.fn(async (key: string | number | null) => ({
		state: { ...state, held: typeof key === "string" ? key.charCodeAt(0) : key },
	})),
};

vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm), isRunning }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));

const { findTool } = await import("@/lib/mcp/tools");
const call = (name: string, input: Record<string, unknown> = {}) =>
	findTool(name)!
		.execute(input, {})
		.then((r) => JSON.parse(r as string));

describe("type_keys tool", () => {
	beforeEach(() => vi.clearAllMocks());

	it("queues the keys while paused, and says when they're read", async () => {
		isRunning.value = false;
		expect(await call("type_keys", { text: "RUN\n" })).toEqual({
			queued: 4,
			keyboard: { ...state, queued: 4 },
			note: "The machine is paused: the keys are read when it runs",
		});
		expect(vm.typeText).toHaveBeenCalledWith("RUN\n");
	});

	it("running, no note", async () => {
		isRunning.value = true;
		expect(await call("type_keys", { text: "A" })).not.toHaveProperty("note");
	});
});

describe("hold_key tool", () => {
	beforeEach(() => vi.clearAllMocks());

	it("holds a character or a code, releases with no key", async () => {
		expect((await call("hold_key", { key: "A" })).keyboard.held).toBe(0x41);
		await call("hold_key", { key: 32 });
		expect(vm.holdKey).toHaveBeenLastCalledWith(32);
		await call("hold_key");
		expect(vm.holdKey).toHaveBeenLastCalledWith(null);
	});

	it("rejects an empty key or a code out of range", async () => {
		await expect(call("hold_key", { key: "" })).rejects.toThrow("character expected");
		await expect(call("hold_key", { key: 200 })).rejects.toThrow("between 0 and 127");
	});
});
