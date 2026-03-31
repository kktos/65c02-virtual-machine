import { computed, ref, watch } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { ExpressionParser } from "@/lib/expressionParser/expressionParser";
import { COMMAND_LIST } from "@/commands";
import { minimonitor, type MiniMonitorCommandRequest } from "@/lib/mini-monitor";
import { useBreakpoints } from "./useBreakpoints";
import { REG_PC_OFFSET, REG_SP_OFFSET } from "@/virtualmachine/cpu/shared-memory";
import type {
	MultiLineRequest,
	CommandOutput,
	Command,
	ParamListItemIdentifier,
	ParamListItemRange,
	CommandContext,
	CommandResult,
	ErrorOutput,
} from "@/types/command";
import { useCmdConsole } from "./useCmdConsole";
import { parseParamList } from "@/lib/param-compiler.lib";
import type { OptionItemDef } from "@/types/options";
import { handleDoCommand } from "@/commands/do.cmd";
import type { QueueItem, Sink } from "@/types/queueitem";
import { handleIfCommand } from "@/commands/if.cmd";
import { handleWhileCommand } from "@/commands/while.cmd";
import { parseUserCommand, splitIntoCommands, splitTokensByPipe } from "@/lib/cli-commands.lib";
import { parseCommandParams } from "@/lib/cli-params.lib";

const HISTORY_MAX_SIZE = 50;
const LS_KEY_HISTORY = "vm6502-console-history";

type CommandRunResult = {
	success: CommandOutput[];
	error?: string;
	shouldClose: boolean;
};

const error = ref("");
const success = ref<CommandOutput[]>([]);
const last = ref<CommandOutput>();
const isLoading = ref(false);
const progress = ref(0);
const shouldClose = ref(false);
const multiLineSession = ref<MultiLineRequest | null>(null);
const isMultiLine = computed(() => multiLineSession.value !== null);
const multiLinePrompt = computed(() => multiLineSession.value?.prompt ?? "");
const commandHistory = ref<string[]>(JSON.parse(localStorage.getItem(LS_KEY_HISTORY) || "[]") as string[]);
const errorHistory = ref<string[]>([]);

const { addBreakpoint } = useBreakpoints();

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

export function defineCommand<O extends readonly OptionItemDef[]>(def: {
	description: string;
	group: string;
	paramDef?: string[];
	options?: O;
	fn: (context: CommandContext<O>) => Promise<CommandResult> | CommandResult;
	closeOnSuccess?: boolean;
	staticParams?: {
		prepend?: (string | number)[];
		append?: (string | number)[];
	};
}): Command<O> {
	return {
		...def,
		params: def.paramDef,
		paramDef: def.paramDef ? parseParamList(def.paramDef) : undefined,
	} as Command<O>;
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

	vm.saveRegisters();
	const lines = [`regs restore`, `print "done"`];
	addBreakpoint({ type: "pc", address: breakpointAddress, isTemporary: true, command: lines.join(";") }, vm);

	vm.sharedRegisters.setUint8(REG_SP_OFFSET, sp - 2);
	vm.writeDebug(0x0100 + sp, fakeReturnAddress >> 8);
	vm.writeDebug(0x0100 + sp - 1, fakeReturnAddress & 0xff);
	vm.sharedRegisters.setUint16(REG_PC_OFFSET, jsrAddress, true);
	vm.play();
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

export async function executeSubQueue(
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
			if (cmdParser.matchIdentifier("WHILE")) {
				handleWhileCommand(cmdParser, item, subQueue);
				continue;
			}
			if (cmdParser.matchIdentifier("BREAK")) {
				const headerIdx = subQueue.findIndex((i: any) => i.isLoopHeader);
				if (headerIdx !== -1) subQueue.splice(0, headerIdx + 1);
				continue;
			}

			// Chain Logic
			const chain = [item.tokens];
			if (item.chain) chain.push(...item.chain);

			let pipeValue: any = item.injectedPipe ?? undefined;

			for (let i = 0; i < chain.length; i++) {
				cmdParser.reset(chain[i]);

				const isLastInChain = i === chain.length - 1;
				const currentSink: Sink = (output: CommandOutput | MiniMonitorCommandRequest | ErrorOutput) => {
					if (isLastInChain) {
						if (isMiniMonitorCommandRequest(output)) {
							if (output.type === "JSR") handleJsrOutput(output, vm, result);
						} else {
							if ("error" in output) {
								result.error = output.error;
							} else result.success.push(output);
						}
					} else {
						pipeValue = isCommandOutput(output) ? output.content : output;
					}
				};

				const { cmd, paramIndex: initialParamIndex, userParams, isValidCmd } = parseUserCommand(cmdParser);

				if (!isValidCmd) {
					const output = await minimonitor(item.source, vm);
					currentSink(output);
					continue;
				}

				if (cmd === "DO") {
					try {
						await handleDoCommand(cmdParser, item, subQueue, isLastInChain, currentSink, pipeValue, vm);
					} catch (e) {
						currentSink({ error: (e as Error).message });
					}
					continue;
				}

				let paramIndex = initialParamIndex;
				const cmdSpec = COMMAND_LIST[cmd];
				const {
					params: finalParams,
					opts: finalOpts,
					injectedConsumed,
				} = parseCommandParams(cmdParser, cmd, paramIndex, userParams, cmdSpec, pipeValue);

				const cmdResult = await cmdSpec.fn({
					vm,
					progress,
					params: finalParams,
					opts: finalOpts,
					isPiped: isPiped || (chain.length > 1 && !isLastInChain),
				});

				if (isMultiLineRequest(cmdResult)) {
					const request = cmdResult;
					if (pipeValue) {
						if (!injectedConsumed) {
							// console.log(typeof pipeValue, pipeValue);
							pipeValue.split("\n").forEach(async (line: string, index: number) => {
								const res = await request.onLine(line, index);
								if (typeof res === "object" && res.error) currentSink({ error: res.error });
							});
						}
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
	last.value = success.value.at(-1);
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
		last,
		isLoading,
		progress,
		executeCommand,
		commandHistory,
		shouldClose,
		isMultiLine,
		multiLinePrompt,
	};
}
