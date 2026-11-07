import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MACHINE = "Test Machine";

// Module-level state (routines, db connection): re-importing after resetModules simulates reloading the app
const loadApp = async () => {
	vi.resetModules();
	return {
		routines: (await import("@/composables/useRoutines")).useRoutines(),
		store: await import("@/lib/metadataStore"),
	};
};

/** Machine routines, as an init script would define them */
const machineInit = (routines: Awaited<ReturnType<typeof loadApp>>["routines"], names: string[]) => async () => {
	routines.setRoutine("init", "cls", [], { readonly: true });
	for (const name of names) routines.setRoutine(name, `; machine ${name}`);
};

// Saves are not awaited by callers: let IndexedDB settle
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});

describe("read-only routines", () => {
	it("keeps user routines editable", async () => {
		const { routines } = await loadApp();
		await routines.initRoutines(MACHINE);
		routines.setRoutine("mine", "print 1");
		routines.setRoutine("mine", "print 2");
		expect(routines.isRoutineReadonly("mine")).toBe(false);
		expect(routines.getRoutine("mine")?.lines).toEqual(["print 2"]);
		routines.deleteRoutine("mine");
		expect(routines.routineExists("mine")).toBe(false);
	});

	it("marks routines defined while a machine script runs as read-only", async () => {
		const { routines } = await loadApp();
		await routines.initRoutines(MACHINE, machineInit(routines, ["hd"]));
		routines.setRoutine("after", "print 1");

		expect(routines.isRoutineReadonly("init")).toBe(true);
		expect(routines.isRoutineReadonly("hd")).toBe(true);
		expect(routines.isRoutineReadonly("after")).toBe(false);
	});

	it("refuses user changes to a read-only routine, but lets the machine redefine it", async () => {
		const { routines } = await loadApp();
		await routines.initRoutines(MACHINE, machineInit(routines, ["hd"]));

		expect(() => routines.setRoutine("hd", "print 1")).toThrow(/read-only/);
		expect(() => routines.deleteRoutine("init")).toThrow(/read-only/);
		expect(routines.getRoutine("hd")?.lines).toEqual(["; machine hd"]);

		// Reboot: the machine defines it again
		await routines.initRoutines(MACHINE, machineInit(routines, ["hd"]));
		expect(routines.isRoutineReadonly("hd")).toBe(true);
	});

	it("leaves machine-script mode, and still loads the user routines, when the init fails", async () => {
		let app = await loadApp();
		await app.routines.initRoutines(MACHINE);
		app.routines.setRoutine("mine", "print 1");
		await settle();

		app = await loadApp();
		await expect(
			app.routines.initRoutines(MACHINE, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(app.routines.getRoutine("mine")?.lines).toEqual(["print 1"]);
		app.routines.setRoutine("other", "print 2");
		expect(app.routines.isRoutineReadonly("other")).toBe(false);
	});
});

describe("user routines persistence", () => {
	it("saves user routines per machine, never the machine ones", async () => {
		let app = await loadApp();
		await app.routines.initRoutines(MACHINE, machineInit(app.routines, ["hd"]));
		app.routines.setRoutine("mine", "print @a", ["@a"]);
		app.routines.setRoutine("gone", "print 1");
		app.routines.deleteRoutine("gone");
		await settle();

		expect(await app.store.loadMetadata("test_machine", "routines", "*")).toEqual([
			{ name: "mine", lines: ["print @a"], args: ["@a"] },
		]);

		app = await loadApp();
		await app.routines.initRoutines(MACHINE, machineInit(app.routines, ["hd"]));
		expect(app.routines.getRoutine("mine")).toEqual({ lines: ["print @a"], args: ["@a"] });
		expect(app.routines.routineExists("gone")).toBe(false);

		await app.routines.initRoutines("Other Machine");
		expect(app.routines.routineExists("mine")).toBe(false);
	});

	it("does not overwrite the saved routines with a change made before they are loaded", async () => {
		let app = await loadApp();
		await app.routines.initRoutines(MACHINE);
		app.routines.setRoutine("saved", "print 1");
		await settle();

		app = await loadApp();
		const booting = app.routines.initRoutines(MACHINE);
		app.routines.setRoutine("early", "print 2"); // while the saved routines are loading
		await booting;
		await settle();

		const stored = await app.store.loadMetadata<{ name: string }>("test_machine", "routines", "*");
		expect(stored?.map((r) => r.name).sort()).toEqual(["early", "saved"]);
	});

	it("renames a saved routine that a machine routine now shadows", async () => {
		let app = await loadApp();
		await app.routines.initRoutines(MACHINE);
		app.routines.setRoutine("hd", "my own hd");
		await settle();

		app = await loadApp();
		const renamed = await app.routines.initRoutines(MACHINE, machineInit(app.routines, ["hd"]));
		expect(renamed).toEqual([{ from: "hd", to: "hd_user" }]);
		expect(app.routines.getRoutine("hd")?.readonly).toBe(true);
		expect(app.routines.getRoutine("hd_user")?.lines).toEqual(["my own hd"]);
		await settle();

		const stored = await app.store.loadMetadata<{ name: string }>("test_machine", "routines", "*");
		expect(stored?.map((r) => r.name)).toEqual(["hd_user"]);
	});
});
