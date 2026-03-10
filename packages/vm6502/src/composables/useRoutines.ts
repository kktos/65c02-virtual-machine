import { ref } from "vue";

// Global state for routines
const routines = ref<Record<string, string[]>>({});

export function useRoutines() {
	const setRoutine = (name: string, content: string | string[]) => {
		routines.value[name] = typeof content === "string" ? content.split("\n") : content;
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
