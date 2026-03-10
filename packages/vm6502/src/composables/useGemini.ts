import { computed, ref, type Ref } from "vue";
import { useSettings } from "./useSettings";
import { toast } from "vue-sonner";
import { useDiskStorage } from "./useDiskStorage";
import { useMachine } from "./useMachine";

const geminiModels = [
	{
		name: "Gemini 1.5 Flash",
		url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent",
	},
	{
		name: "Gemini 1.5 Pro",
		url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent",
	},
	{
		name: "Gemini 2.5 Flash-Lite",
		url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
	},
	{
		name: "Gemini 2.5 Flash",
		url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
	},
	{
		name: "Gemini 2.5 Pro",
		url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
	},
	{
		name: "Gemini 3 Flash (Preview)",
		url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
	},
	{
		name: "Gemini 3 Pro (Preview)",
		url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent",
	},
	{
		name: "Gemini 3.1 Pro (Preview)",
		url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent",
	},
];

const EXPLAIN_CODE_SYSTEM_PROMPT = `
You are a world-class 65C02 CPU reverse engineer and assembly language expert.
You are analyzing code running on a %%MACHINE%% loaded from a disk named %%DISK%%.
When analyzing any routine, always identify: its inputs, its outputs, and the memory
addresses (variables) it references.`
	.replaceAll("\n", " ")
	.trim();

const EXPLAIN_CODE_USER_PROMPT_CONCISE = `
Analyze this 65C02 assembly code and explain its purpose.
Format the output as Markdown.
Start with a short, high-level summary in a single paragraph.
Then, use bullet points to list:
- **Inputs**: Registers and/or memory locations read.
- **Outputs**: Registers and/or memory locations written to.
- **Key Memory Addresses**: Any other important memory locations referenced.

The original code is:
\`\`\`asm
%%CODE%%
\`\`\``
	.replaceAll("\n", " ")
	.trim();

const EXPLAIN_CODE_USER_PROMPT_DETAILED = `
Analyze this 65C02 assembly code and produce a fully commented version.
For each instruction or logical block, add an inline comment explaining what it does
and why. Precede the commented listing with a short header block that describes:
- Overall purpose of the routine
- Inputs (registers/memory on entry)
- Outputs (registers/memory on exit)
- Side effects and memory addresses modified

Return the result as a code block using the same formatting as the input.

<code>
%%CODE%%
</code>`
	.replaceAll("\n", " ")
	.trim();

const explanation = ref<string | null>(null);
const isLoading = ref(false);

export function useGemini() {
	const { settings } = useSettings();
	const { lastLoadedDisk } = useDiskStorage();
	const { selectedMachine } = useMachine();

	const apiKey = computed(() => settings.disassembly.gemini.apiKey);
	const baseUrl = computed(() => settings.disassembly.gemini.url);
	const geminiApiUrl = computed(() => `${baseUrl.value}?key=${apiKey.value}`);

	const isConfigured = computed(() => !!apiKey.value);

	async function explainCode(
		codeBlock: string,
		mode: "DETAILED" | "CONCISE" = "CONCISE",
		options: { updatePanel?: boolean; progress?: Ref<number> } = {},
	): Promise<string | null> {
		const { updatePanel = true, progress } = options;
		if (!isConfigured.value) {
			toast.error("Gemini API Key is not configured in the settings.", { position: "bottom-center" });
			return null;
		}

		const systemPrompt = EXPLAIN_CODE_SYSTEM_PROMPT.replaceAll(
			"%%DISK%%",
			lastLoadedDisk.value?.name ?? "",
		).replaceAll("%%MACHINE%%", selectedMachine.value.name);

		isLoading.value = true;
		if (updatePanel) {
			explanation.value = null;
		}

		let progressInterval: ReturnType<typeof setInterval> | undefined;
		if (progress) {
			progress.value = 1;
			let currentProgress = 1;
			progressInterval = setInterval(() => {
				if (currentProgress < 95) {
					currentProgress += 1;
					progress.value = currentProgress;
				}
			}, 200);
		}

		const userQuery = (
			mode === "DETAILED" ? EXPLAIN_CODE_USER_PROMPT_DETAILED : EXPLAIN_CODE_USER_PROMPT_CONCISE
		).replaceAll("%%CODE%%", codeBlock);

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
				toast.error(
					`Error: API request failed with status ${response.status}. ${errorData?.error?.message ?? ""}`.trim(),
					{
						position: "bottom-center",
					},
				);
				return null;
			}

			const result = await response.json();
			const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

			if (text) {
				if (updatePanel) {
					explanation.value = text;
				}
				return text;
			} else {
				console.warn("Gemini API Warning: Response was empty or malformed.", result);
				toast.error("Could not retrieve explanation. API response was empty or malformed.", {
					position: "bottom-center",
				});
				return null;
			}
		} catch (error) {
			console.error("Gemini API Fetch Error:", error);
			toast.error("Error: Failed to connect to the analysis engine.", { position: "bottom-center" });
			return null;
		} finally {
			isLoading.value = false;
			if (progressInterval) clearInterval(progressInterval);
			if (progress) progress.value = 100;
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
