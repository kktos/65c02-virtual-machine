import { computed, ref, watch } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useRoutines } from "./useRoutines";
import { ExpressionParser, TokenType } from "@/lib/expressionParser";
import { COMMAND_LIST, type COMMANDS } from "@/commands";
import { minimonitor } from "@/lib/mini-monitor";
import type { Command, CommandOutput, MultiLineRequest, ParamDef, ParamList, ParamListItem } from "@/types/command";
import { useBreakpoints } from "./useBreakpoints";
import {
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";

const HISTORY_MAX_SIZE = 50;
const LS_KEY_HISTORY = "vm6502-console-history";
const END_ROUTINE_MARKER = "--END-ROUTINE--";

type QueueItem = { type: "line" | "marker"; value: string };

const commandHistory = ref<string[]>(JSON.parse(localStorage.getItem(LS_KEY_HISTORY) || "[]") as string[]);
const { addBreakpoint } = useBreakpoints();
const { getRoutine } = useRoutines();

const multiLineSession = ref<MultiLineRequest | null>(null);

watch(commandHistory, (history) => localStorage.setItem(LS_KEY_HISTORY, JSON.stringify(history)), { deep: true });

const errorHistory = ref<string[]>([]);

type CommandRunResult = {
	success: CommandOutput[];
	error?: string;
	shouldClose: boolean;
};

function parseUserCommand(singleCmdTrimmed: string, vm: VirtualMachine) {
	const cmdParser = new ExpressionParser(singleCmdTrimmed, vm);
	const userParams: ParamList = [];
	let paramIndex = 0;
	let cmd = "" as COMMANDS;
	let isValidCmd = false;
	const tok = cmdParser.peek();

	if (cmdParser.match(TokenType.IDENTIFIER)) {
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

	return { cmd, cmdParser, paramIndex, userParams, isValidCmd };
}

function parseCommandParams(
	cmdParser: ExpressionParser,
	cmd: COMMANDS,
	paramIndex: number,
	userParams: ParamList,
	cmdSpec: Command,
) {
	const paramDef = cmdSpec.paramDef;
	const hasRestParam = paramDef?.at(-1)?.startsWith("rest");
	const paramCount = paramDef?.length ?? 0;
	const minParamCount = paramDef?.filter((p) => !p.endsWith("?")).length ?? 0;

	while (!cmdParser.eof()) {
		if (!hasRestParam && paramIndex >= paramCount) throw new Error(`Too many parameters for command "${cmd}".`);

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
			case TokenType.IDENTIFIER:
				if (allowedTypes.includes("name")) {
					parsedValue = { text: paramValue.raw, value: paramValue.value };
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

	console.log("----userParams", userParams);

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

	addBreakpoint({ type: "pc", address: breakpointAddress, isTemporary: true, command: lines.join("\n") }, vm);

	vm.sharedRegisters.setUint8(REG_SP_OFFSET, sp - 2);
	vm.writeDebug(0x0100 + sp, fakeReturnAddress >> 8);
	vm.writeDebug(0x0100 + sp - 1, fakeReturnAddress & 0xff);
	vm.sharedRegisters.setUint16(REG_PC_OFFSET, jsrAddress, true);
	vm.play();
}

function handleNonCommandOutput(output: any, result: CommandRunResult, vm: VirtualMachine) {
	if (output && "type" in output && output.type === "JSR") {
		handleJsrOutput(output, vm, result);
	} else {
		result.success.push(output);
	}
}

function handleIfCommand(cmdParser: ExpressionParser, singleCmdTrimmed: string, commandQueue: QueueItem[]) {
	const expr = cmdParser.parse();
	const condition = expr.value;
	let isTrue = false;
	if (typeof condition === "string") isTrue = condition.length > 0;
	else isTrue = condition !== 0;

	if (!isTrue) return;

	let token = cmdParser.peek();
	if (token.type === TokenType.IDENTIFIER && token.text.toUpperCase() === "THEN") {
		cmdParser.consume();
		token = cmdParser.peek();
	}

	const restIndex = cmdParser.getRestIndex();
	const rest = singleCmdTrimmed.substring(restIndex).trim();
	commandQueue.unshift({ type: "line", value: rest });
}

function handleDoCommand(cmdParser: ExpressionParser, commandQueue: QueueItem[]) {
	const token = cmdParser.peek();
	if (token.type !== TokenType.IDENTIFIER) throw new Error("DO needs a routine name.");
	cmdParser.consume();
	if (!cmdParser.eof()) throw new Error("Too many parameters for DO; it needs only a routine name.");

	const routineName = token.text;
	const routineCmds = getRoutine(routineName);
	if (!routineCmds) throw new Error(`Routine '${routineName}' not found.`);

	const items: QueueItem[] = routineCmds
		.filter((line) => !line.trim().startsWith(";") && line.trim() !== "")
		.map((line) => ({ type: "line", value: line }));

	commandQueue.unshift(...items, { type: "marker", value: END_ROUTINE_MARKER });
}

function resolveAlias(cmd: COMMANDS) {
	let cmdSpecOrAlias: Command | string = COMMAND_LIST[cmd];
	if (typeof cmdSpecOrAlias === "string") cmdSpecOrAlias = COMMAND_LIST[cmdSpecOrAlias as COMMANDS];
	if (typeof cmdSpecOrAlias === "string" || !cmdSpecOrAlias)
		throw new Error(`Invalid command alias configuration for '${cmd}'.`);
	return cmdSpecOrAlias;
}

function isMultiLineRequest(r: unknown): r is MultiLineRequest {
	return typeof r === "object" && r !== null && "__isMultiLineRequest" in r;
}

export function useCommands() {
	const error = ref("");
	const success = ref<CommandOutput[]>([]);
	const isLoading = ref(false);
	const progress = ref(0);
	const shouldClose = ref(false);
	const isMultiLine = computed(() => multiLineSession.value !== null);
	const multiLinePrompt = computed(() => multiLineSession.value?.prompt ?? "");

	const processLine = async (cmdInput: string, vm: VirtualMachine): Promise<CommandRunResult> => {
		const result: CommandRunResult = { success: [], shouldClose: false };

		const input = cmdInput.trim();

		if (multiLineSession.value) {
			const trimmedInput = input.toUpperCase();
			if (trimmedInput === multiLineSession.value.terminator) {
				const { onComplete, lines } = multiLineSession.value;
				multiLineSession.value = null;
				try {
					const res = await onComplete(lines ?? []);
					if (res) result.success.push({ content: res, format: "text" });
				} catch (e: any) {
					result.error = e.message || "Execution failed";
				}
			} else {
				multiLineSession.value.lines?.push(cmdInput);
				if (multiLineSession.value.onLine) {
					const res = await multiLineSession.value.onLine(cmdInput);
					if (res) {
						if (res.error) result.error = res.error;
						if (res.content) result.success.push({ content: res.content, format: "text" });
						if (res.prompt) multiLineSession.value.prompt = res.prompt;
					}
				}
			}
			return result;
		}

		if (!input) return result;

		const commandQueue: QueueItem[] = input
			.split(";")
			.filter((c) => c.trim() !== "")
			.map((c) => ({ type: "line", value: c.trim() }));

		while (commandQueue.length > 0) {
			const item = commandQueue.shift()!;
			if (item.type === "marker") continue;

			const singleCmdTrimmed = item.value;

			const {
				cmd,
				cmdParser,
				paramIndex: initialParamIndex,
				userParams,
				isValidCmd,
			} = parseUserCommand(singleCmdTrimmed, vm);
			let paramIndex = initialParamIndex;

			if (!isValidCmd) {
				const output = minimonitor(singleCmdTrimmed, vm);
				handleNonCommandOutput(output, result, vm);
				if (result.error) break;
				continue;
			}

			if (cmd === "IF") {
				handleIfCommand(cmdParser, singleCmdTrimmed, commandQueue);
				continue;
			}

			if (cmd === "DO") {
				handleDoCommand(cmdParser, commandQueue);
				continue;
			}

			const cmdSpec = resolveAlias(cmd);
			const finalParams = parseCommandParams(cmdParser, cmd, paramIndex, userParams, cmdSpec);
			const cmdResult = await cmdSpec.fn(vm, progress, finalParams);

			if (isMultiLineRequest(cmdResult)) {
				const request = cmdResult;
				const isInsideRoutine = commandQueue.length > 0 && commandQueue.some((i) => i.type === "marker");
				if (isInsideRoutine) {
					const linesForMultiLine: string[] = [];
					let foundTerminator = false;
					while (commandQueue.length > 0) {
						const nextItem = commandQueue.shift();
						if (!nextItem) break;
						if (nextItem.type !== "line") continue;

						if (nextItem.value.trim().toUpperCase() === request.terminator) {
							foundTerminator = true;
							break;
						}
						linesForMultiLine.push(nextItem.value);
					}
					if (!foundTerminator)
						throw new Error(
							`Multi-line command started in routine but terminator '${request.terminator}' was not found.`,
						);
					const res = await request.onComplete(linesForMultiLine);
					if (res) result.success.push({ content: res, format: "text" });
					continue;
				}

				if (commandQueue.length > 0)
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
				if (typeof cmdResult === "string") result.success.push({ content: cmdResult, format: "text" });
				else result.success.push(cmdResult);
			}

			if (cmdSpec.closeOnSuccess) result.shouldClose = true;
		}
		return result;
	};

	const executeCommand = async (cmdInput: string, vm: VirtualMachine | null) => {
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

		try {
			for (const line of lines) {
				const result = await processLine(line, vm);
				if (result.error) {
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
	};

	watch(error, (err) => {
		if (err) errorHistory.value.push(err);
	});

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
