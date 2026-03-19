import type { Command } from "@/types/command";

export const writeCommand: Command = {
	description: "Save content to a file. Usage: `content_producer` |> WRITE `filename`",
	// First string is filename, second is content (usually piped)
	paramDef: ["string", "string"],
	group: "Streams",
	fn: async ({ params }) => {
		const filename = params[0] as string;
		const content = params[1] as string;

		try {
			// Create a Blob from the content
			const blob = new Blob([content], { type: "text/plain" });
			const url = URL.createObjectURL(blob);

			// Create a temporary anchor element to trigger the download
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();

			// Cleanup
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			return `File "${filename}" saved.`;
		} catch (e: any) {
			return `Error saving file: ${e.message}`;
		}
	},
};
