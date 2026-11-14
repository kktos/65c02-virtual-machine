import { beforeEach, describe, expect, it, vi } from "vitest";

const windows = { open: vi.fn(), close: vi.fn() };
let release: (() => void) | undefined;
const loadDisk = vi.fn(async (key: string) => {
	if (key === "slow.po") await new Promise<void>((resolve) => (release = resolve));
	return { type: "physical", name: key, path: key, data: new ArrayBuffer(143360) };
});

vi.mock("@/composables/useFloatingWindows", () => ({ useFloatingWindows: () => windows }));
vi.mock("@/composables/useDiskStorage", () => ({ useDiskStorage: () => ({ loadDisk }) }));

const { DISK_EDITOR_ID, useDiskEditor } = await import("@/composables/useDiskEditor");

describe("useDiskEditor: closeDisk", () => {
	const editor = useDiskEditor();

	beforeEach(() => {
		editor.closeDisk();
		vi.clearAllMocks();
	});

	it("closes the window and forgets the disk", async () => {
		await editor.openDisk("conan.po");
		editor.viewer.value = "hgr";
		editor.expanded.add("/CONAN");
		expect(editor.source.value?.key).toBe("conan.po");

		editor.closeDisk();
		expect(windows.close).toHaveBeenCalledWith(DISK_EDITOR_ID);
		expect(editor.source.value).toBeNull();
		expect(editor.analysis.value).toBeNull();
		expect(editor.viewer.value).toBe("hex");
		expect(editor.expanded.size).toBe(0);
	});

	it("the same disk opened again is loaded again", async () => {
		await editor.openDisk("conan.po");
		editor.closeDisk();
		await editor.openDisk("conan.po");
		expect(loadDisk).toHaveBeenCalledTimes(2);
		expect(editor.source.value?.key).toBe("conan.po");
	});

	it("a load in flight when it closes is dropped", async () => {
		const opening = editor.openDisk("slow.po");
		await vi.waitFor(() => expect(release).toBeDefined());
		editor.closeDisk();
		release?.();
		await opening;
		expect(editor.source.value).toBeNull();
		expect(editor.loading.value).toBe(false);
	});
});
