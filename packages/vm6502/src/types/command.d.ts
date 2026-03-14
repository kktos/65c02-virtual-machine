export type CommandOutput = {
	content: string;
	format: "text" | "markdown";
};

export type CommandResult = string | CommandOutput | MultiLineRequest;

type ParamType = "byte" | "word" | "number" | "address" | "range" | "string" | "bool" | "name" | "rest";
type ParamDef =
	| ParamType
	| `${ParamType}?`
	| `${ParamType}|${ParamType}`
	| `${ParamType}|${ParamType}|${ParamType}`
	| `${ParamType}|${ParamType}|${ParamType}|${ParamType}`;
export type ParamList = (string | number | { start: number; end: number } | undefined)[];

export type MultiLineRequest = {
	__isMultiLineRequest: true;
	prompt: string;
	terminator: string;
	onComplete: (lines: string[]) => string | Promise<string>;
};

export type Command = {
	description: string;
	paramDef?: ParamDef[];
	group: string;
	fn: (vm: VirtualMachine, progress: Ref<number>, params: ParamList) => Promise<CommandResult> | CommandResult;
	closeOnSuccess?: boolean;
	staticParams?: {
		prepend?: (string | number)[];
		append?: (string | number)[];
	};
};
