import { ref } from "vue";
import { createMetadataSync } from "@/lib/metadataStore";

export interface Routine {
	lines: string[];
	args: string[];
	/** Defined by the machine sources (e.g. its init script): never saved, changes would be lost at the next restart */
	readonly?: boolean;
}

/** What is persisted for a user routine */
export type StoredRoutine = { name: string; lines: string[]; args: string[] };

/**
 * User routines are saved per machine, under the system disk key.
 * Routines written for a specific disk would use that disk's key instead.
 */
const USER_ROUTINES_DISK = "*";

// Global state for routines
const routines = ref<Record<string, Routine>>({});

/** > 0 while a machine script runs: the routines it defines are part of the machine sources */
let machineScriptDepth = 0;

const store = createMetadataSync("routines");
/** Saving before the stored routines are loaded would overwrite them: the save is deferred until then */
let userRoutinesLoaded = false;
let saveAfterLoad = false;
/** Guards against a load from a previous machine (re)load finishing after a newer one */
let loadGeneration = 0;

const assertWritable = (name: string) => {
	if (routines.value[name]?.readonly)
		throw new Error(`Routine '${name}' is read-only: it is part of the machine sources.`);
};

/** First free name among `base`, `base2`, `base3`... */
const uniqueRoutineName = (base: string) => {
	let name = base;
	for (let i = 2; Object.prototype.hasOwnProperty.call(routines.value, name); i++) name = `${base}${i}`;
	return name;
};

const saveUserRoutines = () => {
	if (!userRoutinesLoaded) {
		saveAfterLoad = true;
		return;
	}
	// Snapshot taken synchronously, as plain objects (IndexedDB cannot clone Vue proxies)
	const items: StoredRoutine[] = Object.entries(routines.value)
		.filter(([, r]) => !r.readonly)
		.map(([name, r]) => ({ name, lines: [...r.lines], args: [...r.args] }));
	store.save(USER_ROUTINES_DISK, items).catch((e) => console.error("Routines: failed to save", e));
};

/**
 * Loads the saved user routines into memory, after the machine routines are defined.
 * Returns the routines renamed because a machine routine now has their name.
 */
const loadUserRoutines = async (generation: number) => {
	const stored = await store.load<StoredRoutine>(USER_ROUTINES_DISK);
	if (generation !== loadGeneration) return [];

	const renamed: { from: string; to: string }[] = [];
	for (const r of stored ?? []) {
		const existing = routines.value[r.name];
		// Already defined by the user while loading: the in-memory one is newer
		if (existing && !existing.readonly) continue;

		let name = r.name;
		if (existing?.readonly) {
			name = uniqueRoutineName(`${r.name}_user`);
			renamed.push({ from: r.name, to: name });
			saveAfterLoad = true;
		}
		routines.value[name] = { lines: r.lines, args: r.args };
	}

	userRoutinesLoaded = true;
	if (saveAfterLoad) saveUserRoutines();
	return renamed;
};

export function useRoutines() {
	/**
	 * Routines defined by the machine (explicitly, or while a machine script runs) are read-only.
	 * Only such a definition may replace a read-only routine, e.g. when the machine reboots.
	 * User routines are saved on every change.
	 */
	const setRoutine = (
		name: string,
		content: string | string[],
		args: string[] = [],
		options: { readonly?: boolean } = {},
	) => {
		const readonly = options.readonly ?? machineScriptDepth > 0;
		if (!readonly) assertWritable(name);
		const lines = typeof content === "string" ? content.split("\n") : content;
		routines.value[name] = { lines, args, ...(readonly && { readonly: true }) };
		if (!readonly) saveUserRoutines();
	};

	/** Runs a machine script (e.g. its init): every routine it defines becomes read-only */
	const runMachineScript = async <T>(script: () => Promise<T>) => {
		machineScriptDepth++;
		try {
			return await script();
		} finally {
			machineScriptDepth--;
		}
	};

	/**
	 * Machine (re)load: drops all routines, runs the machine's init (its routines are read-only),
	 * then loads the user routines saved for this machine.
	 * Returns the user routines that were renamed because a machine routine has their name.
	 */
	const initRoutines = async (machineName: string, runInitScript?: () => Promise<unknown>) => {
		const generation = ++loadGeneration;
		store.setMachine(machineName);
		userRoutinesLoaded = false;
		saveAfterLoad = false;
		routines.value = {};

		// Even if the init fails, the user routines must be loaded (and saving re-enabled)
		let initError: unknown;
		try {
			if (runInitScript) await runMachineScript(runInitScript);
		} catch (e) {
			initError = e;
		}
		const renamed = await loadUserRoutines(generation);
		if (initError) throw initError;
		return renamed;
	};

	const getRoutine = (name: string) => {
		return routines.value[name];
	};

	const getRoutineNames = () => {
		return Object.keys(routines.value);
	};

	const deleteRoutine = (name: string) => {
		assertWritable(name);
		if (!routineExists(name)) return;
		delete routines.value[name];
		saveUserRoutines();
	};

	const routineExists = (name: string) => {
		return Object.prototype.hasOwnProperty.call(routines.value, name);
	};

	const isRoutineReadonly = (name: string) => !!routines.value[name]?.readonly;

	return {
		initRoutines,
		setRoutine,
		runMachineScript,
		getRoutine,
		getRoutineNames,
		deleteRoutine,
		routineExists,
		isRoutineReadonly,
		uniqueRoutineName,
	};
}
