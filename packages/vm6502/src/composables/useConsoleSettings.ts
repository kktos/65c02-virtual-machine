import { ref, watch } from "vue";

const LS_KEY_HEIGHT = "vm6502-console-height";
const LS_KEY_FONT_SIZE = "vm6502-console-font-size";
const LS_KEY_FONT_FAMILY = "vm6502-console-font-family";
const LS_KEY_FONT_COLOR = "vm6502-console-font-color";

const MIN_SIZE = 8;
const MAX_SIZE = 24;

const height = ref(200);
const fontSize = ref(12);
const fontFamily = ref("monospace"); // Default font
const fontColor = ref("#4ade80"); // Default green-400

const loadSettings = () => {
	const savedHeight = localStorage.getItem(LS_KEY_HEIGHT);
	if (savedHeight) height.value = Math.max(100, Number.parseInt(savedHeight, 10));

	const savedFontSize = localStorage.getItem(LS_KEY_FONT_SIZE);
	if (savedFontSize) fontSize.value = Math.max(8, Number.parseInt(savedFontSize, 10));

	const savedFontFamily = localStorage.getItem(LS_KEY_FONT_FAMILY);
	if (savedFontFamily) fontFamily.value = savedFontFamily;

	const savedFontColor = localStorage.getItem(LS_KEY_FONT_COLOR);
	if (savedFontColor) fontColor.value = savedFontColor;
};

watch(height, (newHeight) => localStorage.setItem(LS_KEY_HEIGHT, newHeight.toString()));
watch(fontSize, (newSize) => localStorage.setItem(LS_KEY_FONT_SIZE, newSize.toString()));
watch(fontFamily, (newFamily) => localStorage.setItem(LS_KEY_FONT_FAMILY, newFamily));
watch(fontColor, (newColor) => localStorage.setItem(LS_KEY_FONT_COLOR, newColor));

const increaseFontSize = () => {
	if (MAX_SIZE) fontSize.value++;
};

const decreaseFontSize = () => {
	if (fontSize.value > MIN_SIZE) fontSize.value--;
};

export function useConsoleSettings() {
	return {
		height,
		fontSize,
		MAX_SIZE,
		MIN_SIZE,
		fontFamily,
		fontColor,
		loadSettings,
		increaseFontSize,
		decreaseFontSize,
	};
}
