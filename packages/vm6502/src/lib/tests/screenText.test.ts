import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import type { TextMode } from "@/types/bus.interface";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

let mode: TextMode | undefined;
const getTextScreen = vi.fn(() => ["HELLO"]);
const vm = {
	ready: Promise.resolve(),
	machineConfig: { name: "Apple //e" },
	syncBusState: vi.fn(),
	bus: { getTextScreen, getTextMode: () => mode } as Record<string, unknown>,
};
vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm) }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));

const { findTool } = await import("@/lib/mcp/tools");
const screenText = (input: Record<string, unknown> = {}) => findTool("screen_text")!.execute(input, {});

describe("screen_text", () => {
	beforeEach(() => {
		mode = { page: 1, cols: 80, shown: "full" };
		getTextScreen.mockClear();
		vm.syncBusState.mockClear();
		vm.bus.getTextMode = () => mode;
	});

	it("reads the displayed screen by default, with fresh soft switches, and says which", async () => {
		expect(await screenText()).toBe("[page 1, 80 cols]\nHELLO");
		expect(vm.syncBusState).toHaveBeenCalled();
		expect(getTextScreen).toHaveBeenCalledWith({ page: 1, cols: 80 });
	});

	it("explicit page / cols win, and the header says what is displayed instead", async () => {
		expect((await screenText({ page: 2, cols: 40 })).split("\n")[0]).toBe(
			"[page 2, 40 cols — displayed: page 1, 80 cols]",
		);
		expect(getTextScreen).toHaveBeenCalledWith({ page: 2, cols: 40 });
	});

	it("says when the text isn't (all) on screen", async () => {
		mode = { page: 1, cols: 40, shown: "hidden" };
		expect((await screenText()).split("\n")[0]).toBe("[page 1, 40 cols — graphics mode: no text on screen]");
		mode = { page: 1, cols: 40, shown: "mixed" };
		expect((await screenText()).split("\n")[0]).toBe(
			"[page 1, 40 cols — mixed mode: only the last 4 rows are on screen]",
		);
	});

	it("a machine that doesn't know its display mode: page 1, 40 columns", async () => {
		vm.bus.getTextMode = undefined;
		expect(await screenText()).toBe("[page 1, 40 cols]\nHELLO");
	});

	it("validates page / cols (numeric strings accepted)", async () => {
		await expect(screenText({ page: 3 })).rejects.toThrow("page: must be 1 or 2");
		await expect(screenText({ cols: 50 })).rejects.toThrow("cols: must be 40 or 80");
		expect((await screenText({ page: "2" })).split("\n")[0]).toMatch(/^\[page 2,/);
	});
});
