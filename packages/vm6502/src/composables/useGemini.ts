import { computed, ref } from "vue";
import { useSettings } from "./useSettings";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

export function useGemini() {
	const { settings } = useSettings();
	const explanation = ref<string | null>(null);
	const isLoading = ref(false);

	if (settings.disassembly.gemini.url.trim() === "") {
		settings.disassembly.gemini.url = GEMINI_BASE_URL;
	}

	const apiKey = computed(() => settings.disassembly.gemini.apiKey);
	const baseUrl = computed(() => settings.disassembly.gemini.url);
	const geminiApiUrl = computed(() => `${baseUrl.value}?key=${apiKey.value}`);

	const isConfigured = computed(() => !!apiKey.value);

	async function explainCode(codeBlock: string) {
		if (!isConfigured.value) {
			explanation.value = "Error: Gemini API Key is not configured in the settings.";
			return;
		}

		isLoading.value = true;
		explanation.value = null;

		const systemPrompt =
			"You are a world-class 6502 CPU reverse engineer and assembly language expert. Analyze the provided block of 6502 assembly code and provide a concise, single-paragraph explanation of its overall purpose and function, focusing on the high-level logic (e.g., 'This loop copies X bytes from address A to address B').";
		const userQuery = `Analyze this 6502 assembly code block and explain its function: \n\n${codeBlock}`;

		const payload = {
			contents: [{ parts: [{ text: userQuery }] }],
			systemInstruction: { parts: [{ text: systemPrompt }] },
		};

		try {
			const response = await fetch(geminiApiUrl.value, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				console.error("Gemini API Error Response:", errorData);
				explanation.value = `Error: API request failed with status ${response.status}. ${errorData?.error?.message ?? ""}`.trim();
				return;
			}

			const result = await response.json();
			const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

			if (text) {
				explanation.value = text;
			} else {
				console.warn("Gemini API Warning: Response was empty or malformed.", result);
				explanation.value = "Could not retrieve explanation. API response was empty or malformed.";
			}
		} catch (error) {
			console.error("Gemini API Fetch Error:", error);
			explanation.value = "Error: Failed to connect to the analysis engine.";
		} finally {
			isLoading.value = false;
		}
	}

	return {
		explanation,
		isLoading,
		isConfigured,
		explainCode,
	};
}
