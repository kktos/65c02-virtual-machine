import { readonly, ref } from "vue";

const isOpen = ref(false);
const x = ref(0);
const y = ref(0);

export function useRoutineEditor() {
	const open = (event?: MouseEvent) => {
		if (event) {
			x.value = event.clientX;
			y.value = event.clientY;
		} else {
			x.value = window.innerWidth / 2 - 240; // center it
			y.value = window.innerHeight / 2 - 160;
		}
		isOpen.value = true;
	};

	const close = () => {
		isOpen.value = false;
	};

	return {
		isOpen: readonly(isOpen),
		x: readonly(x),
		y: readonly(y),
		open,
		close,
	};
}
