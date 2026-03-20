import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";
import type { Token } from "../lib/expressionParser";

export type CommandOutput = {
	content: string;
	format: "text" | "markdown";
};

export type ErrorOutput = {
	error: string;
};

export type CommandResult = string | CommandOutput | ErrorOutput | MultiLineRequest;

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

export type CommandSegment = Token[];
export type MultiLineRequest = {
	__isMultiLineRequest: true;
	prompt: string;
	lines?: (CommandSegment | string)[];
	terminator: string;
	onComplete: () => string | ErrorOutput | Promise<string | ErrorOutput>;
	onLine: (line: string, index: number) => ResultOnLineFn;
};

export interface CommandContext {
	vm: VirtualMachine;
	progress: Ref<number>;
	params: ParamList;
	isPiped: boolean;
}

export type Command = {
	description: string;
	paramDef?: ParamDef[];
	group: string;
	fn: (context: CommandContext) => Promise<CommandResult> | CommandResult;
	closeOnSuccess?: boolean;
	staticParams?: {
		prepend?: (string | number)[];
		append?: (string | number)[];
	};
};
