// --- LLM Constants and Utilities (Outside Vue component definitions) ---
const API_KEY = "";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;

// --- LLM Handler (Code Explanation) ---
export async function handleExplainCode(codeBlock: string, setExplanation, setIsLoading) {
	const systemPrompt =
		"You are a world-class 6502 CPU reverse engineer and assembly language expert. Analyze the provided block of 6502 assembly code and provide a concise, single-paragraph explanation of its overall purpose and function, focusing on the high-level logic (e.g., 'This loop copies X bytes from address A to address B').";
	const userQuery = `Analyze this 6502 assembly code block and explain its function: \n\n${codeBlock}`;

	const payload = {
		contents: [{ parts: [{ text: userQuery }] }],
		systemInstruction: { parts: [{ text: systemPrompt }] },
	};

	try {
		const result = await fetch(GEMINI_API_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
		if (text) {
			setExplanation.value = text;
		} else {
			setExplanation.value = "Could not retrieve explanation. API response was empty or malformed.";
		}
	} catch (error) {
		console.error("Gemini API Error:", error);
		setExplanation.value = "Error: Failed to connect to the analysis engine.";
	} finally {
		setIsLoading.value = false;
	}
}
