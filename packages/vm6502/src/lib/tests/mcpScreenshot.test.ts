import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import type { Screenshot } from "@/virtualmachine/virtualmachine.class";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });

const vm = {
	ready: Promise.resolve(),
	machineConfig: { name: "Apple //e" },
	isRunning: false,
	screenshot: vi.fn(async (): Promise<Screenshot | undefined> => ({
		width: 640,
		height: 480,
		png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	})),
};
vi.mock("@/composables/useMachine", () => ({ useMachine: () => ({ vm: shallowRef(vm) }) }));
vi.mock("@/composables/useCommands", () => ({ useCommands: () => ({}) }));
vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));

const { findTool } = await import("@/lib/mcp/tools");
const screenshot = () => findTool("screenshot")!.execute({}, {});

describe("screenshot", () => {
	beforeEach(() => vm.screenshot.mockClear());

	it("answers a PNG image block and its size", async () => {
		const result = await screenshot();
		if (typeof result === "string") throw new Error("content blocks expected");
		const [image, info] = result.content;

		expect(image).toMatchObject({ type: "image", mimeType: "image/png" });
		const png = Uint8Array.from(atob((image as { data: string }).data), (c) => c.charCodeAt(0));
		expect([...png]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // the PNG, in base64

		expect(info?.type).toBe("text");
		expect(JSON.parse((info as { text: string }).text)).toEqual({ width: 640, height: 480, running: false });
		expect(vm.screenshot).toHaveBeenCalledOnce();
	});

	it("fails on a machine without video", async () => {
		vm.screenshot.mockResolvedValueOnce(undefined);
		await expect(screenshot()).rejects.toThrow("No video output for Apple //e");
	});
});
