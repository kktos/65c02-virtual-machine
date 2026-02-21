import { ref, watch } from "vue";

const NOTES_KEY = "vm6502_debugger_notes";

// Singleton state
const notes = ref<Record<string, string>>({});

const loadNotes = () => {
	try {
		const saved = localStorage.getItem(NOTES_KEY);
		if (saved) {
			return JSON.parse(saved);
		}
	} catch (e) {
		console.error("Failed to load notes from localStorage", e);
	}
	return {};
};

notes.value = loadNotes();

watch(
	notes,
	(newNotes) => {
		localStorage.setItem(NOTES_KEY, JSON.stringify(newNotes));
	},
	{ deep: true },
);

export function useNotes() {
	return { notes };
}
