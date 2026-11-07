import { beforeEach, describe, expect, it, vi } from "vitest";

const loadRoutines = async () => {
	vi.resetModules();
	return (await import("@/composables/useRoutines")).useRoutines();
};

describe("read-only routines", () => {
	let routines: Awaited<ReturnType<typeof loadRoutines>>;
	beforeEach(async () => {
		routines = await loadRoutines();
	});

	it("keeps user routines editable", () => {
		routines.setRoutine("mine", "print 1");
		routines.setRoutine("mine", "print 2");
		expect(routines.isRoutineReadonly("mine")).toBe(false);
		expect(routines.getRoutine("mine")?.lines).toEqual(["print 2"]);
		routines.deleteRoutine("mine");
		expect(routines.routineExists("mine")).toBe(false);
	});

	it("marks routines defined while a machine script runs as read-only", async () => {
		await routines.runMachineScript(async () => {
			routines.setRoutine("hd", "hd @from @to", ["@from", "@to"]);
		});
		routines.setRoutine("after", "print 1");

		expect(routines.isRoutineReadonly("hd")).toBe(true);
		expect(routines.isRoutineReadonly("after")).toBe(false);
	});

	it("refuses user changes to a read-only routine, but lets the machine redefine it", async () => {
		routines.setRoutine("init", "cls", [], { readonly: true });

		expect(() => routines.setRoutine("init", "print 1")).toThrow(/read-only/);
		expect(() => routines.deleteRoutine("init")).toThrow(/read-only/);
		expect(routines.getRoutine("init")?.lines).toEqual(["cls"]);

		// Reboot: the machine defines it again
		await routines.runMachineScript(async () => routines.setRoutine("init", "cls\nprint 2"));
		expect(routines.getRoutine("init")?.lines).toEqual(["cls", "print 2"]);
		expect(routines.isRoutineReadonly("init")).toBe(true);
	});

	it("leaves machine-script mode even when the script fails", async () => {
		await expect(
			routines.runMachineScript(async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		routines.setRoutine("mine", "print 1");
		expect(routines.isRoutineReadonly("mine")).toBe(false);
	});
});
