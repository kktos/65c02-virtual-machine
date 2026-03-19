import { ref } from "vue";

export interface Routine {
	lines: string[];
	args: string[];
}

// Global state for routines
const routines = ref<Record<string, Routine>>({});

export function useRoutines() {
	const setRoutine = (name: string, content: string | string[], args: string[] = []) => {
		const lines = typeof content === "string" ? content.split("\n") : content;
		routines.value[name] = { lines, args };
	};

	const getRoutine = (name: string) => {
		return routines.value[name];
	};

	const getRoutineNames = () => {
		return Object.keys(routines.value);
	};

	const deleteRoutine = (name: string) => {
		delete routines.value[name];
	};

	const routineExists = (name: string) => {
		return Object.prototype.hasOwnProperty.call(routines.value, name);
	};

	const clearRoutines = () => {
		routines.value = {};
	};

	return {
		setRoutine,
		getRoutine,
		getRoutineNames,
		deleteRoutine,
		routineExists,
		clearRoutines,
	};
}
