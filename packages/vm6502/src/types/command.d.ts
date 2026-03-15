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

export type ParamListItemIdentifier = { text: string; value: number | string | undefined };
export type ParamListItemRange = { start: number; end: number };

export type ParamListItem = string | number | undefined | ParamListItemRange | ParamListItemIdentifier;
export type ParamList = ParamListItem[];

export type ResultOnLinePayload = { content?: string; prompt?: string; error?: string } | void;
export type ResultOnLineFn = ResultOnLinePayload | Promise<ResultOnLinePayload>;

export type MultiLineRequest = {
	__isMultiLineRequest: true;
	prompt: string;
	lines?: string[];
	terminator: string;
	onComplete: (lines: string[]) => string | Promise<string>;
	onLine?: (line: string) => ResultOnLineFn;
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
