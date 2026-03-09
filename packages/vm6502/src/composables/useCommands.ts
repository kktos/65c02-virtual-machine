import { computed, ref, watch } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useRoutines } from "./useRoutines";
import { ExpressionParser } from "@/lib/expressionParser";
import {
	COMMAND_LIST,
	typedKeys,
	type Command,
	type CommandWrapper,
	type MultiLineRequest,
	type ParamList,
} from "@/commands";
import { minimonitor } from "@/lib/mini-monitor";

const HISTORY_MAX_SIZE = 50;
const LS_KEY_HISTORY = "vm6502-console-history";
const commandHistory = ref<string[]>(JSON.parse(localStorage.getItem(LS_KEY_HISTORY) || "[]"));

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

export function useCommands() {
	const error = ref("");
	const success = ref("");
	const isLoading = ref(false);
	const progress = ref(0);
	const shouldClose = ref(false);
	const isMultiLine = computed(() => multiLineSession.value !== null);
	const multiLinePrompt = computed(() => multiLineSession.value?.prompt ?? "");

	const processLine = async (cmdInput: string, vm: VirtualMachine) => {
		// Handle multi-line input
		if (multiLineSession.value) {
			const trimmedInput = cmdInput.trim();
			if (trimmedInput.toUpperCase() === multiLineSession.value.terminator) {
				const { onComplete, lines } = multiLineSession.value;
				multiLineSession.value = null;
				try {
					const res = await onComplete(lines);
					if (res) success.value = success.value ? success.value + "\n" + res : res;
				} catch (e: any) {
					error.value = e.message || "Execution failed";
				}
			} else {
				multiLineSession.value.lines.push(cmdInput);
			}
			return;
		}

		const input = cmdInput.trim();
		if (!input) return;

		shouldClose.value = false;

		const commandQueue = input.split(";").filter((c) => c.trim() !== "");
		const END_ROUTINE_MARKER = "--END-ROUTINE--";

		while (commandQueue.length > 0) {
			const singleCmdTrimmed = commandQueue.shift()?.trim() as string;
			if (singleCmdTrimmed === END_ROUTINE_MARKER) continue;

			const cmd = singleCmdTrimmed.split(" ")[0]?.toUpperCase() as string;

			if (cmd === "IF") {
				const parser = new ExpressionParser(singleCmdTrimmed.substring(2), vm);
				const condition = parser.parse();
				const restIndex = parser.getRestIndex();
				let rest = singleCmdTrimmed.substring(2 + restIndex).trim();
				if (rest.toUpperCase().startsWith("THEN")) rest = rest.substring(4).trim();
				if (condition !== 0) commandQueue.unshift(rest);
				continue;
			}

			if (cmd === "DO") {
				const parts = singleCmdTrimmed.split(/\s+/);
				if (parts.length < 2) throw new Error("Routine name missing for DO command.");

				const routineName = parts[1] as string;
				const { getRoutine } = useRoutines();
				const routineCmds = getRoutine(routineName);
				if (!routineCmds) throw new Error(`Routine '${routineName}' not found.`);

				commandQueue.unshift(...routineCmds.filter((line) => !line.trim().startsWith(";")), END_ROUTINE_MARKER);
				const msg = `Executing routine '${routineName}'...`;
				success.value = success.value ? success.value + "\n" + msg : msg;
				continue;
			}

			const cmdKey = typedKeys(COMMAND_LIST).find((key) => cmd === key);

			if (!cmdKey) {
				try {
					const output = minimonitor(singleCmdTrimmed, vm) + "\n";
					success.value = success.value ? `${success.value}\n${output}` : output;
					// oxlint-disable-next-line no-unused-vars
				} catch (e) {
					if (cmd) throw new Error(`Unknown command: ${cmd}`);
				}
				continue;
			}

			const cmdSpec = COMMAND_LIST[cmdKey] as Command | CommandWrapper;

			const commandToRun = "base" in cmdSpec ? cmdSpec.base : cmdSpec;
			const paramDef = cmdSpec.paramDef;

			let paramStr = singleCmdTrimmed.slice(cmdKey.length).trim();
			const userParams: ParamList = [];

			if (paramDef)
				for (let i = 0; i < paramDef.length; i++) {
					let paramDefStr = paramDef[i] as string;
					const isOptional = paramDefStr.endsWith("?");
					if (isOptional) paramDefStr = paramDefStr.slice(0, -1);

					if (!paramStr && !isOptional) {
						const requiredRemaining = paramDef.slice(i).filter((p) => !p.endsWith("?")).length;
						if (requiredRemaining > 0) {
							throw new Error(`Missing required parameter(s) for "${cmdKey}".`);
						}
						break; // All remaining are optional
					}

					if (!paramStr && isOptional) {
						userParams.push(undefined);
						continue;
					}
					if (paramDefStr === "rest") {
						userParams.push(paramStr);
						paramStr = "";
						continue;
					}

					const allowedTypes = paramDefStr.split("|");
					let parsedValue: any = undefined;
					let lastError: Error | null = null;
					const originalParamStr = paramStr;

					for (const type of allowedTypes) {
						paramStr = originalParamStr; // Reset for each type attempt
						try {
							switch (type) {
								case "byte":
								case "word":
								case "long":
								case "address": {
									const parser = new ExpressionParser(paramStr, vm);
									const value = parser.parse();
									const restIndex = parser.getRestIndex();
									paramStr = paramStr.substring(restIndex).trim();

									if (type === "byte" && (value > 0xff || value < -128))
										throw new Error(`Byte value out of range: ${value}`);
									if (type === "word" && (value > 0xffff || value < -32768))
										throw new Error(`Word value out of range: ${value}`);
									if (type === "address" && (value > 0xffffff || value < 0))
										throw new Error(`Address out of range: ${value}`);

									parsedValue = value;
									break;
								}
								case "range": {
									const parser1 = new ExpressionParser(paramStr, vm);
									const startVal = parser1.parse();
									const restAfter1 = paramStr.substring(parser1.getRestIndex()).trim();

									const hasSeparator = restAfter1.startsWith(":") || restAfter1.startsWith("-");
									if (!hasSeparator) throw new Error("Invalid range: missing '-' or ':' separator.");

									const afterSep = restAfter1.substring(1).trim();
									const parser2 = new ExpressionParser(afterSep, vm);
									const endVal = parser2.parse();

									paramStr = afterSep.substring(parser2.getRestIndex()).trim();
									parsedValue = { start: startVal, end: endVal };
									break;
								}
								case "string": {
									let value: string;
									if (paramStr.startsWith('"')) {
										const endQuoteIdx = paramStr.indexOf('"', 1);
										if (endQuoteIdx === -1) throw new Error("Unterminated string literal");
										value = paramStr.substring(1, endQuoteIdx);
										paramStr = paramStr.substring(endQuoteIdx + 1).trim();
									} else {
										const spaceIdx = paramStr.indexOf(" ");
										if (spaceIdx === -1) {
											value = paramStr;
											paramStr = "";
										} else {
											value = paramStr.substring(0, spaceIdx);
											paramStr = paramStr.substring(spaceIdx).trim();
										}
									}
									parsedValue = value;
									break;
								}
								case "number": {
									const parser = new ExpressionParser(paramStr, vm);
									parsedValue = parser.parse();
									break;
								}
								default:
									throw new Error(`Unknown parameter type: ${type}`);
							}
							if (parsedValue !== undefined) break;
						} catch (e: any) {
							lastError = e;
							parsedValue = undefined;
						}
					}

					if (parsedValue === undefined) {
						if (isOptional) {
							userParams.push(undefined);
							paramStr = originalParamStr;
							continue;
						}
						throw lastError || new Error(`Invalid parameter for "${cmdKey}".`);
					}
					userParams.push(parsedValue);
				}

			let finalParams: ParamList = userParams;
			if ("base" in cmdSpec && cmdSpec.staticParams) {
				if (cmdSpec.staticParams.prepend) {
					finalParams = [...cmdSpec.staticParams.prepend, ...finalParams];
				}
				if (cmdSpec.staticParams.append) {
					finalParams = [...finalParams, ...cmdSpec.staticParams.append];
				}
			}

			const result = await commandToRun.fn(vm, progress, finalParams);

			if (typeof result === "object" && result !== null && (result as any).__isMultiLineRequest) {
				const request = result as MultiLineRequest;
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
				const msg = `Defining routine. Type '${request.terminator}' to finish.`;
				success.value = success.value ? success.value + "\n" + msg : msg;
				return;
			}

			const resultMessage = result as string;
			if (resultMessage) success.value = success.value ? success.value + "\n" + resultMessage : resultMessage;
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
		success.value = "";
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

	return {
		error,
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
