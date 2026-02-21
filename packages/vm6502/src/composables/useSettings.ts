import { reactive, watch } from "vue";

const SETTINGS_KEY = "vm6502_debugger_settings";

// Define the shape of our settings
interface DebuggerSettings {
	disassembly: {
		showCycles: boolean;
		scopeColors: Record<string, string>;
		gemini: {
			apiKey: string;
			url: string;
		};
	};
}

// Default settings
const defaultSettings: DebuggerSettings = {
	disassembly: {
		showCycles: true,
		scopeColors: {
			main: "#000000",
		},
		gemini: {
			apiKey: "",
			url: "",
		},
	},
};

// Load initial settings from localStorage or use defaults
const loadSettings = (): DebuggerSettings => {
	try {
		const saved = localStorage.getItem(SETTINGS_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			// Merge with defaults to handle new settings being added later
			return {
				...defaultSettings,
				disassembly: {
					...defaultSettings.disassembly,
					...parsed.disassembly,
					scopeColors: {
						...defaultSettings.disassembly.scopeColors,
						...(parsed.disassembly?.scopeColors || {}),
					},
					gemini: {
						...defaultSettings.disassembly.gemini,
						...(parsed.disassembly?.gemini || {}),
					},
				},
			};
		}
	} catch (e) {
		console.error("Failed to load settings from localStorage", e);
	}
	return defaultSettings;
};

// The reactive settings object
const settings = reactive<DebuggerSettings>(loadSettings());

// Watch for changes and save to localStorage
watch(
	settings,
	(newSettings) => {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
	},
	{ deep: true },
);

// The composable function
export function useSettings() {
	return { settings };
}
