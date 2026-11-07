import { ref } from "vue";

export interface Routine {
	lines: string[];
	args: string[];
	/** Defined by the machine sources (e.g. its init script): changes would be lost at the next restart */
	readonly?: boolean;
}

// Global state for routines
const routines = ref<Record<string, Routine>>({});

/** > 0 while a machine script runs: the routines it defines are part of the machine sources */
let machineScriptDepth = 0;

const assertWritable = (name: string) => {
	if (routines.value[name]?.readonly)
		throw new Error(`Routine '${name}' is read-only: it is part of the machine sources.`);
};

export function useRoutines() {
	/**
	 * Routines defined by the machine (explicitly, or while a machine script runs) are read-only.
	 * Only such a definition may replace a read-only routine, e.g. when the machine reboots.
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

	const getRoutine = (name: string) => {
		return routines.value[name];
	};

	const getRoutineNames = () => {
		return Object.keys(routines.value);
	};

	const deleteRoutine = (name: string) => {
		assertWritable(name);
		delete routines.value[name];
	};

	const routineExists = (name: string) => {
		return Object.prototype.hasOwnProperty.call(routines.value, name);
	};

	const isRoutineReadonly = (name: string) => !!routines.value[name]?.readonly;

	const clearRoutines = () => {
		routines.value = {};
	};

	return {
		setRoutine,
		runMachineScript,
		getRoutine,
		getRoutineNames,
		deleteRoutine,
		routineExists,
		isRoutineReadonly,
		clearRoutines,
	};
}
