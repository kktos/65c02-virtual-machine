import { ref } from "vue";

// Global state for routines
const routines = ref<Record<string, string[]>>({});

export function useRoutines() {
	const setRoutine = (name: string, content: string[]) => {
		routines.value[name] = content;
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

	return {
		setRoutine,
		getRoutine,
		getRoutineNames,
		deleteRoutine,
		routineExists,
	};
}
