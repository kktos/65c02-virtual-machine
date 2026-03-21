import { computed, ref, watch } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useRoutines, type Routine } from "./useRoutines";
import { ExpressionParser, TokenType } from "@/lib/expressionParser";
import { COMMAND_LIST, type COMMANDS } from "@/commands";
import { minimonitor, type MiniMonitorCommandRequest } from "@/lib/mini-monitor";
import { useBreakpoints } from "./useBreakpoints";
import {
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import type {
	MultiLineRequest,
	CommandOutput,
	ParamList,
	Command,
	ParamDef,
	ParamListItem,
	ParamListItemIdentifier,
	CommandSegment,
	ParamListItemRange,
} from "@/types/command";
import { useCmdConsole } from "./useCmdConsole";

const HISTORY_MAX_SIZE = 50;
const LS_KEY_HISTORY = "vm6502-console-history";
const END_ROUTINE_MARKER = "--END-ROUTINE--";

type QueueItemLine = {
	type: "line";
	source: string;
	tokens?: CommandSegment;
	chain?: CommandSegment[] | null;
	injectedPipe?: any;
};
type QueueItemMarker = { type: "marker"; value: string };
type QueueItem = QueueItemLine | QueueItemMarker;
type Sink = (output: any) => void;
type CommandRunResult = {
	success: CommandOutput[];
	error?: string;
	shouldClose: boolean;
};

const error = ref("");
const success = ref<CommandOutput[]>([]);
const isLoading = ref(false);
const progress = ref(0);
const shouldClose = ref(false);
const multiLineSession = ref<MultiLineRequest | null>(null);
const isMultiLine = computed(() => multiLineSession.value !== null);
const multiLinePrompt = computed(() => multiLineSession.value?.prompt ?? "");
const commandHistory = ref<string[]>(JSON.parse(localStorage.getItem(LS_KEY_HISTORY) || "[]") as string[]);
const errorHistory = ref<string[]>([]);

const { addBreakpoint } = useBreakpoints();
const { getRoutine } = useRoutines();

watch(commandHistory, (history) => localStorage.setItem(LS_KEY_HISTORY, JSON.stringify(history)), { deep: true });
watch(error, (err) => err && errorHistory.value.push(err));

export function isMultiLineRequest(r: unknown): r is MultiLineRequest {
	return typeof r === "object" && r !== null && "__isMultiLineRequest" in r;
}
export function isCommandOutput(r: unknown): r is CommandOutput {
	return typeof r === "object" && r !== null && "content" in r && "format" in r;
}
export function isMiniMonitorCommandRequest(r: unknown): r is MiniMonitorCommandRequest {
	return typeof r === "object" && r !== null && "type" in r;
}
export function isParamListItemIdentifier(r: unknown): r is ParamListItemIdentifier {
	return typeof r === "object" && r !== null && "text" in r && "value" in r;
}
export function isParamListItemRange(r: unknown): r is ParamListItemRange {
	return typeof r === "object" && r !== null && "start" in r && "end" in r;
}

function parseUserCommand(cmdParser: ExpressionParser) {
	const userParams: ParamList = [];
	let paramIndex = 0;
	let cmd = "" as COMMANDS;
	let isValidCmd = false;
	const tok = cmdParser.peek();

	if (cmdParser.match(TokenType.AND)) {
		const nextTok = cmdParser.peek();
		cmd = "DO";
		paramIndex = 1;
		userParams.push(nextTok.text);
		isValidCmd = true;
	} else if (cmdParser.match(TokenType.IDENTIFIER)) {
		const nextTok = cmdParser.peek();
		if (nextTok?.type === TokenType.ASSIGN) {
			cmd = "SET";
			paramIndex = 1;
			userParams.push(tok.text);
			cmdParser.consume();
		} else {
			cmd = tok.text.toUpperCase() as COMMANDS;
		}
		isValidCmd = !!COMMAND_LIST[cmd];
	}

	return { cmd, paramIndex, userParams, isValidCmd };
}

function parseCommandParams(
	cmdParser: ExpressionParser,
	cmd: COMMANDS,
	paramIndex: number,
	userParams: ParamList,
	cmdSpec: Command,
	injectedValue?: any,
) {
	const paramDef = cmdSpec.paramDef;
	const hasRestParam = paramDef?.at(-1)?.startsWith("rest");
	const paramCount = paramDef?.length ?? 0;
	const minParamCount = paramDef?.filter((p) => !p.endsWith("?")).length ?? 0;

	while (!cmdParser.eof()) {
		if (!hasRestParam && paramIndex >= paramCount)
			throw new Error(`Too many parameters for command "${cmd}". Max is ${paramCount}. Got ${paramIndex - 1}.`);

		let paramDefStr = paramDef?.[paramIndex] ?? "rest";
		const isOptional = paramDefStr.endsWith("?");
		if (isOptional) paramDefStr = paramDefStr.slice(0, -1) as ParamDef;
		const allowedTypes = paramDefStr.split("|");

		const paramValue = cmdParser.parse();
		cmdParser.match(TokenType.COMMA);
		paramIndex++;

		let parsedValue: ParamListItem;
		switch (paramValue.type) {
			case TokenType.STRING:
				if (!(hasRestParam || allowedTypes.includes("string")))
					throw new Error(`Expected a [${allowedTypes.join(" or ")}].`);
				parsedValue = paramValue.value;
				break;
			case TokenType.AT:
				parsedValue = paramValue.raw;
				break;
			case TokenType.REGEX:
				parsedValue = paramValue.value;
				break;
			case TokenType.IDENTIFIER:
				if (allowedTypes.includes("name")) {
					parsedValue = { text: paramValue.raw, value: paramValue.value as number };
					break;
				}
				if (
					!(
						hasRestParam ||
						allowedTypes.includes("byte") ||
						allowedTypes.includes("word") ||
						allowedTypes.includes("address")
					)
				)
					throw new Error(`Expected a [${allowedTypes.join(" or ")}].`);
				parsedValue = paramValue.value as number;
				break;
			case TokenType.FLOAT:
				if (!(hasRestParam || allowedTypes.includes("number")))
					throw new Error(`Expected a [${allowedTypes.join(" or ")}].`);
				parsedValue = paramValue.value;
				break;
			case TokenType.INTEGER:
				if (
					!(
						hasRestParam ||
						allowedTypes.includes("byte") ||
						allowedTypes.includes("word") ||
						allowedTypes.includes("range") ||
						allowedTypes.includes("address")
					)
				)
					throw new Error(`Expected a [${allowedTypes.join(" or ")}].`);

				if (cmdParser.match(TokenType.COLON)) {
					const secondValue = cmdParser.parse();
					if (secondValue.type !== TokenType.INTEGER)
						throw new Error(`Expected a [${allowedTypes.join(" or ")}].`);
					let start = paramValue.value as number;
					let end = secondValue.value as number;
					if (start > end) [start, end] = [end, start];
					parsedValue = { start, end };
				} else {
					parsedValue = paramValue.value;
				}
				break;
			default:
				throw new Error(`Unsupported token type ${paramValue.type}`);
		}
		userParams.push(parsedValue);
	}

	// Handle injected value (from pipe)
	if (injectedValue !== undefined) {
		if (!hasRestParam && paramIndex >= paramCount)
			throw new Error(
				`Too many parameters for command "${cmd}" (input piped). Max is ${paramCount}. Got ${paramIndex - 1}.`,
			);

		let paramDefStr = paramDef?.[paramIndex] ?? "rest";
		if (paramDefStr.endsWith("?")) paramDefStr = paramDefStr.slice(0, -1) as ParamDef;
		const allowedTypes = paramDefStr.split("|");

		const valType = typeof injectedValue;
		let typeOk = false;
		if (allowedTypes.includes("rest")) typeOk = true;
		else if (valType === "string" && allowedTypes.includes("string")) typeOk = true;
		else if (
			valType === "number" &&
			(allowedTypes.includes("byte") ||
				allowedTypes.includes("word") ||
				allowedTypes.includes("address") ||
				allowedTypes.includes("number"))
		)
			typeOk = true;
		else if (valType === "object" && allowedTypes.includes("range") && "start" in injectedValue) typeOk = true;

		if (!typeOk) {
			if (valType === "number" && allowedTypes.includes("string")) {
				injectedValue = injectedValue.toString();
				typeOk = true;
			}
		}

		userParams.push(injectedValue);
		paramIndex++;
	}

	if (paramIndex < minParamCount) throw new Error(`Missing required parameter(s) for "${cmd}".`);

	let finalParams: ParamList = userParams;
	if (cmdSpec.staticParams) {
		if (cmdSpec.staticParams.prepend) finalParams = [...cmdSpec.staticParams.prepend, ...finalParams];
		if (cmdSpec.staticParams.append) finalParams = [...finalParams, ...cmdSpec.staticParams.append];
	}

	return finalParams;
}

function handleJsrOutput(output: any, vm: VirtualMachine, result: CommandRunResult) {
	const jsrAddress = output.address ?? vm.sharedRegisters.getUint16(REG_PC_OFFSET, true);
	const fakeReturnAddress = 0xfffe;
	const breakpointAddress = 0xffff;

	const sp = vm.sharedRegisters.getUint8(REG_SP_OFFSET);
	if (sp < 2) {
		result.error = "Stack overflow risk.  SP < 2.  Cannot execute JSR command.";
		return;
	}

	const pc = vm.sharedRegisters.getUint16(REG_PC_OFFSET, true);
	const a = vm.sharedRegisters.getUint8(REG_A_OFFSET);
	const x = vm.sharedRegisters.getUint8(REG_X_OFFSET);
	const y = vm.sharedRegisters.getUint8(REG_Y_OFFSET);
	const p = vm.sharedRegisters.getUint8(REG_STATUS_OFFSET);
	const lines = [`pc=${pc}`, `sp=${sp}`, `a=${a}`, `x=${x}`, `y=${y}`, `p=${p}`, `print "done"`];

	addBreakpoint({ type: "pc", address: breakpointAddress, isTemporary: true, command: lines.join(";") }, vm);

	vm.sharedRegisters.setUint8(REG_SP_OFFSET, sp - 2);
	vm.writeDebug(0x0100 + sp, fakeReturnAddress >> 8);
	vm.writeDebug(0x0100 + sp - 1, fakeReturnAddress & 0xff);
	vm.sharedRegisters.setUint16(REG_PC_OFFSET, jsrAddress, true);
	vm.play();
}

function handleIfCommand(cmdParser: ExpressionParser, item: QueueItemLine, commandQueue: QueueItem[]) {
	let isTrue = false;

	const expr = cmdParser.parse();
	const condition = expr.value;

	if (typeof condition === "string") isTrue = condition.length > 0;
	else isTrue = condition !== 0;

	if (!isTrue) return;

	if (cmdParser.isIdentifier("THEN")) cmdParser.consume();

	const nextTok = cmdParser.peek();
	if (!nextTok) return;
	const source = item.source.slice(nextTok.start).trim();
	if (!source) return;

	commandQueue.unshift({
		type: "line",
		source,
	});
}

function expandRoutineLines(routine: Routine, args: string[]) {
	const expandedLines: QueueItem[] = [];

	routine.lines
		.filter((line) => !line.trim().startsWith(";") && line.trim() !== "")
		.forEach((line) => {
			let processed = line;
			routine.args.forEach((argName, index) => {
				processed = processed.replaceAll(`@${argName}`, args[index]);
			});

			expandedLines.push({
				type: "line",
				source: processed,
			});
		});

	return expandedLines;
}

function parseRoutineArgs(cmdParser: ExpressionParser, pipeValue: unknown) {
	const args: string[] = [];
	while (!cmdParser.eof()) {
		const argToken = cmdParser.peek();
		switch (argToken.type) {
			case TokenType.STRING:
				args.push(`"${argToken.text}"`);
				break;
			default:
				args.push(argToken.text);
				break;
		}
		cmdParser.consume();
	}
	if (pipeValue !== undefined) {
		if (typeof pipeValue === "string") args.push(`"${pipeValue}"`);
		else args.push(String(pipeValue));
	}

	return args;
}

async function handleDoCommand(
	cmdParser: ExpressionParser,
	item: QueueItemLine,
	subQueue: QueueItem[],
	isLastInChain: boolean,
	currentSink: Sink,
	pipeValue: unknown,
	vm: VirtualMachine,
) {
	const token = cmdParser.peek();
	if (!cmdParser.matchIdentifier()) throw new Error("DO needs a routine name !!!.");

	const routineName = token.text;
	const routine = getRoutine(routineName);
	if (!routine) throw new Error(`Routine '${routineName}' not found.`);

	const args = parseRoutineArgs(cmdParser, pipeValue);
	if (args.length !== routine.args.length)
		throw new Error(`Routine '${routineName}' expects ${routine.args.length} argument(s), but got ${args.length}.`);

	const expandedLines = expandRoutineLines(routine, args);

	if (isLastInChain) {
		subQueue.unshift(...expandedLines, { type: "marker", value: END_ROUTINE_MARKER });
	} else {
		const res = await executeSubQueue([...expandedLines], new ExpressionParser("", vm), true, vm);
		if (res.error) throw new Error(res.error);
		res.success.forEach((out) => currentSink(out));
	}

	item.injectedPipe = undefined;
}

function resolveAlias(cmd: COMMANDS) {
	let cmdSpecOrAlias: Command | string = COMMAND_LIST[cmd];
	if (typeof cmdSpecOrAlias === "string") cmdSpecOrAlias = COMMAND_LIST[cmdSpecOrAlias as COMMANDS];
	if (typeof cmdSpecOrAlias === "string" || !cmdSpecOrAlias)
		throw new Error(`Invalid command alias configuration for '${cmd}'.`);
	return cmdSpecOrAlias;
}

function splitIntoCommands(input: string, vm: VirtualMachine): QueueItem[] {
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

async function processMultilineSession(input: string) {
	const result: CommandRunResult = { success: [], shouldClose: false };
	const session = multiLineSession.value!;

	const trimmedInput = input.trim().toUpperCase();
	if (trimmedInput === session.terminator) {
		multiLineSession.value = null;
		try {
			const res = await session.onComplete();
			if (typeof res === "string") result.success.push({ content: res, format: "text" });
			else result.error = res.error;
		} catch (e: any) {
			result.error = e.message || "Execution failed";
		}
	} else {
		session.lines?.push(input);
		const res = await session.onLine(input, session.lines ? session.lines.length - 1 : 0);
		if (res) {
			if (res.error) result.error = res.error;
			if (res.content) result.success.push({ content: res.content, format: "text" });
			if (res.prompt) session.prompt = res.prompt;
		}
	}
	return result;
}

function splitTokensByPipe(tokens: CommandSegment): {
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

async function executeSubQueue(
	subQueue: QueueItem[],
	cmdParser: ExpressionParser,
	isPiped: boolean,
	vm: VirtualMachine,
): Promise<CommandRunResult> {
	const result: CommandRunResult = { success: [], shouldClose: false };

	try {
		while (subQueue.length > 0) {
			const item = subQueue.shift()!;
			if (item.type === "marker") continue;

			if (!item.tokens) {
				const parser = new ExpressionParser(item.source, vm);
				const tokens = parser.getTokens();

				const { first, chain } = splitTokensByPipe(tokens);
				item.tokens = first;
				item.chain = chain;
			}

			cmdParser.reset(item.tokens);
			if (cmdParser.matchIdentifier("IF")) {
				handleIfCommand(cmdParser, item, subQueue);
				continue;
			}

			// Chain Logic
			const chain = [item.tokens];
			if (item.chain) chain.push(...item.chain);

			let pipeValue: any = item.injectedPipe ?? undefined;

			for (let i = 0; i < chain.length; i++) {
				cmdParser.reset(chain[i]);

				const isLastInChain = i === chain.length - 1;
				const currentSink: Sink = (output: CommandOutput | MiniMonitorCommandRequest) => {
					if (isLastInChain) {
						if (isMiniMonitorCommandRequest(output)) {
							if (output.type === "JSR") handleJsrOutput(output, vm, result);
						} else {
							result.success.push(output);
						}
					} else {
						pipeValue = isCommandOutput(output) ? output.content : output;
					}
				};

				const { cmd, paramIndex: initialParamIndex, userParams, isValidCmd } = parseUserCommand(cmdParser);

				if (!isValidCmd) {
					const output = minimonitor(item.source, vm);
					currentSink(output);
					continue;
				}

				if (cmd === "DO") {
					try {
						await handleDoCommand(cmdParser, item, subQueue, isLastInChain, currentSink, pipeValue, vm);
					} catch (e) {
						currentSink({ content: (e as Error).message, format: "text" });
					}
					continue;
				}

				let paramIndex = initialParamIndex;
				const cmdSpec = resolveAlias(cmd);
				const finalParams = parseCommandParams(cmdParser, cmd, paramIndex, userParams, cmdSpec, pipeValue);

				const cmdResult = await cmdSpec.fn({
					vm,
					progress,
					params: finalParams,
					isPiped: isPiped || (chain.length > 1 && !isLastInChain),
				});

				if (isMultiLineRequest(cmdResult)) {
					const request = cmdResult;
					if (pipeValue) {
						const res = await request.onComplete();
						if (typeof res === "string") currentSink({ content: res, format: "text" });
						else throw new Error(res.error);
						continue;
					}

					const isInsideRoutine = subQueue.length > 0 && subQueue.some((i) => i.type === "marker");
					if (isInsideRoutine) {
						let foundTerminator = false;
						let lineIndex = 0;
						while (subQueue.length > 0) {
							const nextItem = subQueue.shift();
							if (!nextItem || nextItem.type !== "line") continue;

							if (nextItem.source.trim().toUpperCase() === request.terminator) {
								foundTerminator = true;
								break;
							}
							const res = await request.onLine(nextItem.source, lineIndex);
							if (res) {
								if (res.error) throw new Error(res.error);
								if (res.content) result.success.push({ content: res.content, format: "text" });
								if (res.prompt && multiLineSession.value) multiLineSession.value.prompt = res.prompt;
							}
							lineIndex++;
						}
						if (!foundTerminator)
							throw new Error(
								`Multi-line command started in routine but terminator '${request.terminator}' was not found.`,
							);
						const res = await request.onComplete();
						if (typeof res === "string") currentSink({ content: res, format: "text" });
						else throw new Error(res.error);
						continue;
					}

					if (!isLastInChain) throw new Error("Cannot pipe from a multi-line command request.");

					if (subQueue.length > 0)
						throw new Error(
							"Commands that start multi-line mode cannot be combined with other commands using ';'.",
						);
					multiLineSession.value = {
						__isMultiLineRequest: true,
						prompt: request.prompt,
						terminator: request.terminator,
						onComplete: request.onComplete,
						onLine: request.onLine,
						lines: [],
					};
					result.success.push({
						content: `Type '${request.terminator}' on a new line to finish.`,
						format: "text",
					});
					return result;
				}

				if (cmdResult) {
					if (typeof cmdResult === "string") currentSink({ content: cmdResult, format: "text" });
					else currentSink(cmdResult);
				}

				if (cmdSpec.closeOnSuccess) result.shouldClose = true;

				item.injectedPipe = undefined;
			}
		}
	} catch (e) {
		result.error = (e as Error).message || "Execution failed";
	}
	return result;
}

async function processLine(cmdInput: string, vm: VirtualMachine): Promise<CommandRunResult> {
	let result: CommandRunResult = { success: [], shouldClose: false };

	if (multiLineSession.value) return processMultilineSession(cmdInput);

	const input = cmdInput.trim();
	if (!input) return result;

	const cmdParser = new ExpressionParser(input, vm);
	const commandQueue = splitIntoCommands(input, vm);
	return executeSubQueue(commandQueue, cmdParser, false, vm);
}

async function executeCommand(cmdInput: string, vm: VirtualMachine | null) {
	if (!vm) {
		error.value = "Virtual Machine not initialized.";
		return false;
	}
	if (isLoading.value) return false;

	isLoading.value = true;
	progress.value = 0;
	error.value = "";
	success.value = [];
	shouldClose.value = false;

	let input = cmdInput;
	const lines = input.split(/\r?\n/);

	const { print } = useCmdConsole();

	try {
		for (const line of lines) {
			const result = await processLine(line, vm);
			if (result.error) {
				print("error", result.error);
				error.value = result.error;
				break;
			}
			if (result.success.length > 0) success.value.push(...result.success);
			if (result.shouldClose) shouldClose.value = true;
		}

		const cleanInput = cmdInput.trim();
		if (cleanInput && commandHistory.value[commandHistory.value.length - 1] !== cleanInput) {
			commandHistory.value.push(cleanInput);
			if (commandHistory.value.length > HISTORY_MAX_SIZE)
				commandHistory.value.splice(0, commandHistory.value.length - HISTORY_MAX_SIZE);
		}
		return !error.value;
	} catch (e: any) {
		error.value = e.message || "Execution failed";
		return false;
	} finally {
		isLoading.value = false;
	}
}

export function useCommands() {
	return {
		error,
		errorHistory,
		success,
		isLoading,
		progress,
		executeCommand,
		commandHistory,
		shouldClose,
		isMultiLine,
		multiLinePrompt,
	};
}
