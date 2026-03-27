import { reactive, watch } from "vue";

const SETTINGS_KEY = "vm6502_debugger_settings";

// Define the shape of our settings
interface DebuggerSettings {
	disassembly: {
		showCycles: boolean;
		showInfo: boolean;
		showComments: boolean;
		showBytes: boolean;
		highlightPc: boolean;
		addressWidth: number;
		lowercase: boolean;
		scopeColors: Record<string, string>;
		syntax: {
			addr: string;
			opcode: string;
			pseudo: string;
			number: string;
			label: string;
			register: string;
			punctuation: string;
			comment: string;
			bytes: string;
			info: string;
			pcLine: string;
		};
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
		showInfo: true,
		showComments: true,
		showBytes: true,
		highlightPc: true,
		addressWidth: 4,
		lowercase: false,
		scopeColors: {
			main: "#000000",
		},
		syntax: {
			addr: "#a3b3ff",
			opcode: "#60A5FA",
			pseudo: "#C084FC",
			number: "#5EEAD4",
			label: "#c3cc7f",
			register: "#60A5FA",
			punctuation: "#60A5FA",
			comment: "#0ba229",
			pcLine: "#422006",
			info: "#99a1af",
			bytes: "#99a1af",
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
					syntax: {
						...defaultSettings.disassembly.syntax,
						...(parsed.disassembly?.syntax || {}),
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
