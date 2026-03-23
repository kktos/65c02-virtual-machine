import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";
import type { Token } from "../lib/expressionParser";
import type { ParamDef } from "@/types/params";
import type { OptionItemDef, ResolveOptions } from "@/types/options";

export type CommandOutput = {
	content: string;
	format: "text" | "markdown";
};

export type ErrorOutput = {
	error: string;
};

export type CommandResult = string | CommandOutput | ErrorOutput | MultiLineRequest;

export type ParamListItemIdentifier = { text: string; value: number | string | undefined };
export type ParamListItemRange = { start: number; end: number };
export type ParamListItem = string | number | RegExp | undefined | ParamListItemRange | ParamListItemIdentifier;
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

// ─── Context ──────────────────────────────────────────────────────────────────
export type CommandContext<O extends readonly OptionItemDef[] = []> = {
	vm: VirtualMachine;
	progress: Ref<number>;
	params: ParamList;
	opts: ResolveOptions<O>;
	isPiped: boolean;
};

// ─── Command types ────────────────────────────────────────────────────────────
export type Command<O extends readonly OptionItemDef[] = readonly OptionItemDef[]> = {
	description: string;
	paramDef?: ParamDef[];
	params?: string[];
	options?: O;
	group: string;
	fn: (context: CommandContext<O>) => Promise<CommandResult> | CommandResult;
	closeOnSuccess?: boolean;
	staticParams?: {
		prepend?: (string | number)[];
		append?: (string | number)[];
	};
};

export type CommandDef<O extends readonly OptionItemDef[] = readonly OptionItemDef[]> = {
	description: string;
	paramDef?: string[];
	options?: O;
	group: string;
	fn: (context: CommandContext<O>) => Promise<CommandResult> | CommandResult;
	closeOnSuccess?: boolean;
	staticParams?: {
		prepend?: (string | number)[];
		append?: (string | number)[];
	};
};
