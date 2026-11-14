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

const apple = {
	name: "Apple //e",
	disk: { enabled: true, extensions: [".po"], formats: ["apple2"], viewers: ["hgr"] },
};
const pet = { name: "PET", disk: { enabled: true, extensions: [".d64"], formats: ["cbm"], viewers: ["disasm"] } };

describe("useDiskEditor: closeDisk", () => {
	const editor = useDiskEditor();

	beforeEach(() => {
		editor.setMachine(apple);
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

describe("useDiskEditor: the machine's formats and viewers", () => {
	const editor = useDiskEditor();

	beforeEach(() => {
		editor.setMachine(apple);
		editor.closeDisk();
		vi.clearAllMocks();
	});

	it("opens a disk with the machine's format, at its home", async () => {
		await editor.openDisk("blank.po");
		expect(editor.analysis.value?.badge.label).toBe("Unknown format");
		expect(editor.view.value).toEqual({ kind: "sector", track: 0, sector: 0 });
		expect(editor.viewers.value).toEqual(["hgr"]);
	});

	it("says why when none of the machine's formats takes the disk", async () => {
		editor.setMachine(pet);
		await editor.openDisk("blank.po");
		expect(editor.analysis.value).toBeNull();
		expect(editor.formatError.value).toMatch(/not a disk the editor reads as Commodore/);
	});

	it("another machine closes the disk; the same one again keeps it", async () => {
		await editor.openDisk("blank.po");
		editor.setMachine({ ...apple });
		expect(editor.source.value?.key).toBe("blank.po");
		editor.setMachine(pet);
		expect(editor.source.value).toBeNull();
		expect(editor.viewers.value).toEqual(["disasm"]);
	});
});
