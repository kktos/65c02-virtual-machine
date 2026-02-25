import { ref } from "vue";

interface Viewer {
	id: number;
	address?: number;
}

const STORAGE_KEY = "memory-viewers-layout";
const activeViewerId = ref(0);
const nextId = ref(1);
const viewers = ref<Viewer[]>([{ id: 0 }]);

const saveLayout = () => {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(viewers.value));
};

const loadLayout = () => {
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored) {
		try {
			const loaded: Viewer[] = JSON.parse(stored);
			if (Array.isArray(loaded) && loaded.length > 0) viewers.value = loaded;
			const maxId = loaded.reduce((max, v) => Math.max(max, v.id), 0);
			nextId.value = maxId + 1;
			if (!viewers.value.some((v) => v.id === activeViewerId.value))
				activeViewerId.value = viewers.value[0]?.id ?? 0;
		} catch (e) {
			console.error("Failed to load memory viewers layout", e);
		}
	}
};

const updateViewerAddress = (index: number, address: number) => {
	if (viewers.value[index]) {
		viewers.value[index].address = address;
		saveLayout();
	}
};

const addViewer = (index: number, currentAddress?: number) => {
	viewers.value.splice(index + 1, 0, {
		id: nextId.value++,
		address: currentAddress,
	});
	saveLayout();
};

const removeViewer = (index: number) => {
	const removedId = viewers.value[index]?.id;
	viewers.value.splice(index, 1);
	if (removedId === activeViewerId.value) activeViewerId.value = viewers.value[0]?.id ?? 0;
	saveLayout();
};

export function useMemView() {
	return {
		activeViewerId,
		viewers,
		loadLayout,
		updateViewerAddress,
		addViewer,
		removeViewer,
	};
}
