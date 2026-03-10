export interface LogEntry {
	id: number;
	text: string;
	type: "input" | "output" | "error";
	format?: "text" | "markdown";
}
