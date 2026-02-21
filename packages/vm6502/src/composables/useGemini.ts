import { computed, ref } from "vue";
import { useSettings } from "./useSettings";
import { toast } from "vue-sonner";

const geminiModels = [
	{ name: "Gemini 1.5 Flash", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent" },
	{ name: "Gemini 1.5 Pro", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent" },
	{ name: "Gemini 2.5 Flash-Lite", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent" },
	{ name: "Gemini 2.5 Flash", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" },
	{ name: "Gemini 2.5 Pro", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent" },
	{ name: "Gemini 3 Flash (Preview)", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent" },
	{ name: "Gemini 3 Pro (Preview)", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent" },
	{ name: "Gemini 3.1 Pro (Preview)", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent" },
];

export function useGemini() {
	const { settings } = useSettings();
	const explanation = ref<string | null>(null);
	const isLoading = ref(false);

	const apiKey = computed(() => settings.disassembly.gemini.apiKey);
	const baseUrl = computed(() => settings.disassembly.gemini.url);
	const geminiApiUrl = computed(() => `${baseUrl.value}?key=${apiKey.value}`);

	const isConfigured = computed(() => !!apiKey.value);

	async function explainCode(codeBlock: string): Promise<string | null> {
		if (!isConfigured.value) {
			toast.error("Gemini API Key is not configured in the settings.", { position: "bottom-center" });
			return null;
		}

		isLoading.value = true;
		explanation.value = null;

		const systemPrompt =
			"You are a world-class 65C02 CPU reverse engineer and assembly language expert. Analyze the provided block of 65C02 assembly code and provide a concise, single-paragraph explanation of its overall purpose and function, focusing on the high-level logic (e.g., 'This loop copies X bytes from address A to address B').";
		const userQuery = `Analyze this 65C02 assembly code block and explain its function: \n\n${codeBlock}`;

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
				toast.error(`Error: API request failed with status ${response.status}. ${errorData?.error?.message ?? ""}`.trim(), {
					position: "bottom-center",
				});
				return null;
			}

			const result = await response.json();
			const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

			if (text) {
				explanation.value = text;
				return text;
			} else {
				console.warn("Gemini API Warning: Response was empty or malformed.", result);
				toast.error("Could not retrieve explanation. API response was empty or malformed.", { position: "bottom-center" });
				return null;
			}
		} catch (error) {
			console.error("Gemini API Fetch Error:", error);
			toast.error("Error: Failed to connect to the analysis engine.", { position: "bottom-center" });
			return null;
		} finally {
			isLoading.value = false;
		}
	}

	return {
		explanation,
		isLoading,
		isConfigured,
		explainCode,
		geminiModels,
	};
}
