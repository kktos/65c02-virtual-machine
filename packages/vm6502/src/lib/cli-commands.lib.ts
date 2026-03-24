import type { CommandSegment, ParamList } from "@/types/command";
import { ExpressionParser, TokenType } from "./expressionParser";
import type { QueueItem } from "@/types/queueitem";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { type COMMANDS, COMMAND_LIST } from "@/commands";

export function splitTokensByPipe(tokens: CommandSegment): {
	first: CommandSegment;
	chain: CommandSegment[] | null;
} {
	const segments: CommandSegment[] = [];

	let segStart = 0;

	for (let i = 0; i < tokens.length; i++) {
		const tok = tokens[i];

		if (tok.type === TokenType.PIPE) {
			const seg = tokens.slice(segStart, i).filter((t) => t.type !== TokenType.EOF);
			if (seg.length > 0) segments.push(seg);
			segStart = i + 1;
		}
	}

	// final segment
	const last = tokens.slice(segStart).filter((t) => t.type !== TokenType.EOF);
	if (last.length > 0) segments.push(last);

	if (segments.length === 0) return { first: [], chain: null };

	return {
		first: segments[0],
		chain: segments.length > 1 ? segments.slice(1) : null,
	};
}

export function splitIntoCommands(input: string, vm: VirtualMachine): QueueItem[] {
	const parser = new ExpressionParser(input, vm);
	const tokens = parser.getTokens();

	const result: QueueItem[] = [];
	let sliceStart = 0;

	for (const tok of tokens) {
		if (tok.type === TokenType.SEMICOLON || tok.type === TokenType.EOF) {
			const sliceEnd = tok.start;
			const source = input.slice(sliceStart, sliceEnd).trim();

			if (source) {
				result.push({
					type: "line",
					source,
				});
			}

			sliceStart = tok.end;
		}
	}

	return result;
}

export function parseUserCommand(cmdParser: ExpressionParser) {
	const userParams: ParamList = [];
	let paramIndex = 0;
	let cmd = "" as COMMANDS;
	let isValidCmd = false;
	const tok = cmdParser.peek();

	//
	// do <routine> | & <routine>
	//
	if (cmdParser.match(TokenType.AND)) {
		const nextTok = cmdParser.peek();
		cmd = "DO";
		paramIndex = 1;
		userParams.push(nextTok.text);
		isValidCmd = true;
	} else if (cmdParser.match(TokenType.IDENTIFIER)) {
		//
		// <dest> = <value> => SET <dest> <value>
		//
		const nextTok = cmdParser.peek();
		if (nextTok?.type === TokenType.ASSIGN) {
			cmd = "SET";
			paramIndex = 1;
			userParams.push(tok.text);
			cmdParser.consume();
		} else cmd = tok.text.toUpperCase() as COMMANDS;

		isValidCmd = !!COMMAND_LIST[cmd];
	}

	return { cmd, paramIndex, userParams, isValidCmd };
}
