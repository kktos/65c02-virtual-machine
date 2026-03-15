import { computed, ref } from "vue";

export interface WindowInstance {
	open: (options?: { x?: number; y?: number; width?: number; height?: number }) => void;
	close: () => void;
	toggle: () => void;
	title: string;
}

const windows = ref(new Map<string, WindowInstance>());
const globalZIndex = ref(50);
const activeWindowId = ref<string | null>(null);

export function useFloatingWindows() {
	const register = (id: string, instance: WindowInstance) => {
		windows.value.set(id, instance);
	};

	const unregister = (id: string) => {
		windows.value.delete(id);
	};

	const setActiveWindow = (id: string | null) => {
		activeWindowId.value = id;
	};

	const open = (id: string) => {
		const instance = windows.value.get(id);
		if (instance) instance.open();
	};

	const close = (id: string) => {
		const instance = windows.value.get(id);
		if (instance) instance.close();
	};

	const toggle = (id: string) => {
		const instance = windows.value.get(id);
		if (instance) instance.toggle();
	};

	const availableWindows = computed(() => {
		return Array.from(windows.value.entries()).map(([id, instance]) => ({
			id,
			title: instance.title,
		}));
	});

	const nextZIndex = () => {
		globalZIndex.value++;
		return globalZIndex.value;
	};

	return {
		register,
		unregister,
		open,
		close,
		toggle,
		availableWindows,
		activeWindowId,
		setActiveWindow,
		nextZIndex,
	};
}
