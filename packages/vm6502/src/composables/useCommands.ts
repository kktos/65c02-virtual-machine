import { computed, ref, watch } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useRoutines } from "./useRoutines";
import { ExpressionParser, TokenType } from "@/lib/expressionParser";
import { COMMAND_LIST, type COMMANDS } from "@/commands";
import { minimonitor } from "@/lib/mini-monitor";
import type { Command, CommandOutput, MultiLineRequest, ParamDef, ParamList } from "@/types/command";
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

const commandHistory = ref<string[]>(JSON.parse(localStorage.getItem(LS_KEY_HISTORY) || "[]") as string[]);

const multiLineSession = ref<{
	prompt: string;
	terminator: string;
	onComplete: (lines: string[]) => string | Promise<string>;
	lines: string[];
} | null>(null);

watch(
	commandHistory,
	(history) => {
		localStorage.setItem(LS_KEY_HISTORY, JSON.stringify(history));
	},
	{ deep: true },
);

const errorHistory = ref<string[]>([]);

export function useCommands() {
	const error = ref("");
	const success = ref<CommandOutput[]>([]);
	const isLoading = ref(false);
	const progress = ref(0);
	const shouldClose = ref(false);
	const isMultiLine = computed(() => multiLineSession.value !== null);
	const multiLinePrompt = computed(() => multiLineSession.value?.prompt ?? "");

	const processLine = async (cmdInput: string, vm: VirtualMachine) => {
		const input = cmdInput.trim();

		// Handle multi-line input
		if (multiLineSession.value) {
			const trimmedInput = input.toUpperCase();
			if (trimmedInput === multiLineSession.value.terminator) {
				const { onComplete, lines } = multiLineSession.value;
				multiLineSession.value = null;
				try {
					const res = await onComplete(lines);
					if (res) success.value.push({ content: res, format: "text" });
				} catch (e: any) {
					error.value = e.message || "Execution failed";
				}
			} else {
				multiLineSession.value.lines.push(cmdInput);
			}
			return;
		}

		if (!input) return;

		shouldClose.value = false;

		const commandQueue = input.split(";").filter((c) => c.trim() !== "");
		while (commandQueue.length > 0) {
			const singleCmdTrimmed = commandQueue.shift()?.trim() as string;

			if (singleCmdTrimmed === END_ROUTINE_MARKER) continue;

			const userParams: ParamList = [];

			const cmdParser = new ExpressionParser(singleCmdTrimmed, vm);

			let paramIndex = 0;
			let isValidCmd = false;
			let cmd = "" as COMMANDS;
			const tok = cmdParser.peek();

			if (cmdParser.match(TokenType.IDENTIFIER)) {
				const nextTok = cmdParser.peek();

				if (nextTok?.type === TokenType.ASSIGN) {
					cmd = "SET";
					paramIndex = 1;
					userParams.push(tok.text);
					cmdParser.consume();
				} else cmd = tok.text.toUpperCase() as COMMANDS;

				isValidCmd = !!COMMAND_LIST[cmd];
			}

			if (!isValidCmd) {
				const output = minimonitor(singleCmdTrimmed, vm);
				// success.value.push(output);

				if (output && "type" in output && output.type === "JSR") {
					const { addBreakpoint } = useBreakpoints();
					const jsrAddress = output.address ?? vm.sharedRegisters.getUint16(REG_PC_OFFSET, true);
					const fakeReturnAddress = 0xfffe;
					const breakpointAddress = 0xffff;

					const sp = vm.sharedRegisters.getUint8(REG_SP_OFFSET);
					if (sp < 2) {
						error.value = "Stack overflow risk.  SP < 2.  Cannot execute JSR command.";
						continue;
					}

					const pc = vm.sharedRegisters.getUint16(REG_PC_OFFSET, true);
					const a = vm.sharedRegisters.getUint8(REG_A_OFFSET);
					const x = vm.sharedRegisters.getUint8(REG_X_OFFSET);
					const y = vm.sharedRegisters.getUint8(REG_Y_OFFSET);
					const p = vm.sharedRegisters.getUint8(REG_STATUS_OFFSET);
					const lines = [`pc=${pc}`, `sp=${sp}`, `a=${a}`, `x=${x}`, `y=${y}`, `p=${p}`, `print "done"`];
					addBreakpoint(
						{ type: "pc", address: breakpointAddress, isTemporary: true, command: lines.join("\n") },
						vm,
					);

					vm.sharedRegisters.setUint8(REG_SP_OFFSET, sp - 2);
					vm.writeDebug(0x0100 + sp, fakeReturnAddress >> 8);
					vm.writeDebug(0x0100 + sp - 1, fakeReturnAddress & 0xff);

					vm.sharedRegisters.setUint16(REG_PC_OFFSET, jsrAddress, true);

					vm.play();

					// success.value.push({ content: `${formatAddress(jsrAddress)}`, format: "text" });
				} else {
					// @ts-expect-error
					success.value.push(output);
				}

				continue;
			}

			if (cmd === "IF") {
				const parser = new ExpressionParser(singleCmdTrimmed.substring(2), vm);
				const result = parser.parse();
				const condition = result.value;
				const restIndex = parser.getRestIndex();
				let rest = singleCmdTrimmed.substring(2 + restIndex).trim();
				if (rest.toUpperCase().startsWith("THEN")) rest = rest.substring(4).trim();

				let isTrue = false;
				if (typeof condition === "string") isTrue = condition.length > 0;
				else isTrue = condition !== 0;

				if (isTrue) commandQueue.unshift(rest);
				continue;
			}

			if (cmd === "DO") {
				const parts = singleCmdTrimmed.split(/\s+/);
				if (parts.length < 2) throw new Error("Routine name missing for DO command.");

				const routineName = parts[1] as string;
				const { getRoutine } = useRoutines();
				const routineCmds = getRoutine(routineName);
				if (!routineCmds) throw new Error(`Routine '${routineName}' not found.`);

				commandQueue.unshift(
					...routineCmds.filter((line) => !line.trim().startsWith(";") && line.trim() !== ""),
					END_ROUTINE_MARKER,
				);

				continue;
			}

			let cmdSpecOrAlias: Command | string = COMMAND_LIST[cmd];
			if (typeof cmdSpecOrAlias === "string") cmdSpecOrAlias = COMMAND_LIST[cmdSpecOrAlias as COMMANDS];

			if (typeof cmdSpecOrAlias === "string" || !cmdSpecOrAlias)
				throw new Error(`Invalid command alias configuration for '${cmd}'.`);

			const cmdSpec = cmdSpecOrAlias;
			const paramDef = cmdSpec.paramDef;
			const hasRestParam = paramDef?.at(-1)?.startsWith("rest");
			const paramCount = paramDef?.length ?? 0;
			const minParamCount = paramDef?.filter((p) => !p.endsWith("?")).length ?? 0;

			let parsedValue: string | number | undefined | { start: number; end: number };

			while (!cmdParser.eof()) {
				if (!hasRestParam && paramIndex >= paramCount)
					throw new Error(`Too many parameters for command "${cmd}".`);

				let paramDefStr = paramDef?.[paramIndex] ?? "rest";
				const isOptional = paramDefStr.endsWith("?");
				if (isOptional) paramDefStr = paramDefStr.slice(0, -1) as ParamDef;
				const allowedTypes = paramDefStr.split("|");

				const paramValue = cmdParser.parse();

				cmdParser.match(TokenType.COMMA);
				paramIndex++;

				switch (paramValue.type) {
					case TokenType.STRING: {
						if (!(hasRestParam || allowedTypes.includes("string")))
							throw new Error(`Expected a [${allowedTypes.join(" or ")}].`);
						parsedValue = paramValue.value;
						break;
					}
					case TokenType.IDENTIFIER: {
						if (allowedTypes.includes("name")) {
							parsedValue = paramValue.raw;
							break;
						}

						const isValidType =
							hasRestParam ||
							allowedTypes.includes("byte") ||
							allowedTypes.includes("word") ||
							allowedTypes.includes("address");

						if (!isValidType) throw new Error(`Expected a [${allowedTypes.join(" or ")}].`);

						parsedValue = paramValue.value as number;
						break;
					}
					case TokenType.FLOAT: {
						if (!(hasRestParam || allowedTypes.includes("number")))
							throw new Error(`Expected a [${allowedTypes.join(" or ")}].`);
						parsedValue = paramValue.value;
						break;
					}
					case TokenType.INTEGER: {
						const isValidType =
							hasRestParam ||
							allowedTypes.includes("byte") ||
							allowedTypes.includes("word") ||
							allowedTypes.includes("range") ||
							allowedTypes.includes("address");

						if (!isValidType) throw new Error(`Expected a [${allowedTypes.join(" or ")}].`);

						// if (type === "byte" && (value > 0xff || value < -128))
						// 	throw new Error(`Byte value out of range: ${value}`);
						// if (type === "word" && (value > 0xffff || value < -32768))
						// 	throw new Error(`Word value out of range: ${value}`);
						// if (type === "address" && (value > 0xffffff || value < 0))
						// 	throw new Error(`Address out of range: ${value}`);

						// range <start>:<end>
						if (cmdParser.match(TokenType.COLON)) {
							if (!hasRestParam && !allowedTypes.includes("range"))
								throw new Error(`Expected a [${allowedTypes.join(" or ")}].`);
							const secondValue = cmdParser.parse();
							if (secondValue.type !== TokenType.INTEGER)
								throw new Error(`Expected a [${allowedTypes.join(" or ")}].`);
							let start = paramValue.value as number;
							let end = secondValue.value as number;
							if (start > end) [start, end] = [end, start];
							parsedValue = { start, end };
						} else parsedValue = paramValue.value;
						break;
					}
				}

				userParams.push(parsedValue);
			}

			if (paramIndex < minParamCount) throw new Error(`Missing required parameter(s) for "${cmd}".`);

			let finalParams: ParamList = userParams;
			if (cmdSpec.staticParams) {
				if (cmdSpec.staticParams.prepend) finalParams = [...cmdSpec.staticParams.prepend, ...finalParams];
				if (cmdSpec.staticParams.append) finalParams = [...finalParams, ...cmdSpec.staticParams.append];
			}

			const result = await cmdSpec.fn(vm, progress, finalParams);

			if (typeof result === "object" && result !== null && (result as any).__isMultiLineRequest) {
				const request = result as MultiLineRequest;

				const isInsideRoutine = commandQueue.length > 0 && commandQueue.at(-1) === END_ROUTINE_MARKER;
				if (isInsideRoutine) {
					// Auto-feed from command queue for routines
					const linesForMultiLine: string[] = [];
					let foundTerminator = false;

					while (commandQueue.length > 0) {
						const nextLine = commandQueue.shift();
						if (nextLine === undefined) break;

						if (nextLine.trim().toUpperCase() === request.terminator) {
							foundTerminator = true;
							break;
						}
						linesForMultiLine.push(nextLine);
					}

					if (!foundTerminator) {
						throw new Error(
							`Multi-line command started in routine but terminator '${request.terminator}' was not found.`,
						);
					}

					// Execute the callback and continue the main command loop
					const res = await request.onComplete(linesForMultiLine);
					if (res) {
						if (typeof res === "string") {
							success.value.push({ content: res, format: "text" });
						} else if (typeof res === "object" && "content" in res) {
							success.value.push(res);
						}
					}
					continue; // Continue with the next command in the routine
				}

				// Interactive multi-line session for user input
				if (commandQueue.length > 0) {
					throw new Error(
						"Commands that start multi-line mode cannot be combined with other commands using ';'.",
					);
				}
				multiLineSession.value = {
					prompt: request.prompt,
					terminator: request.terminator,
					onComplete: request.onComplete,
					lines: [],
				};
				const msg = `Type '${request.terminator}' on a new line to finish.`;
				success.value.push({ content: msg, format: "text" });
				return; // Exit to wait for user input
			}

			if (result) {
				if (typeof result === "string") {
					success.value.push({ content: result, format: "text" });
				} else if (typeof result === "object" && "content" in result) {
					// It's a CommandOutput
					success.value.push(result);
				}
			}
			if (cmdSpec.closeOnSuccess) shouldClose.value = true;
		}
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
		if (!input.trim() && !multiLineSession.value) input = "HELP";

		const lines = input.split(/\r?\n/);

		try {
			for (const line of lines) {
				await processLine(line, vm);
				if (error.value) break;
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
		if (err) {
			errorHistory.value.push(err);
		}
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
