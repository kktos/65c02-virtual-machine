import { computed, ref, type Ref, watch } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { setA } from "@/commands/setA.cmd";
import { setPC } from "@/commands/setPC.cmd";
import { setX } from "@/commands/setX.cmd";
import { setY } from "@/commands/setY.cmd";
import { setSP } from "@/commands/setSP.cmd";
import { hook } from "@/commands/hook.cmd";
import { listHooks } from "@/commands/listHooks.cmd";
import { gl } from "@/commands/gl.cmd";
import { run } from "@/commands/run.cmd";
import { pause } from "@/commands/pause.cmd";
import { setDisasmView } from "@/commands/setDisasmView.cmd";
import { setMemView } from "@/commands/setMemView.cmd";
import { reset } from "@/commands/reset.cmd";
import { reboot } from "@/commands/reboot.cmd";
import { explain } from "@/commands/explainCode.cmd";
import { speed } from "@/commands/speed.cmd";
import { execAddBP } from "@/commands/addBP.cmd";
import { execRemoveBP } from "@/commands/removeBP.cmd";
import { useCmdConsole } from "./useCmdConsole";
import { defData } from "@/commands/defData.cmd";
import { defCode } from "@/commands/defCode.cmd";
import { defLabel } from "@/commands/defLabel.cmd";
import { renLabel } from "@/commands/renLabel.cmd";
import { undefLabel } from "@/commands/undefLabel.cmd";
import { findLabel } from "@/commands/findLabel.cmd";
import { font } from "@/commands/font.cmd";
import { logCmd } from "@/commands/log.cmd";
import { labelsCmd } from "@/commands/labels.cmd";
import { printCmd } from "@/commands/print.cmd";
import { useRoutines } from "./useRoutines";
import { useRoutineEditor } from "./useRoutineEditor";
import { ExpressionParser } from "@/lib/expressionParser";
type ParamType = "byte" | "word" | "long" | "number" | "address" | "range" | "string" | "rest";
type ParamDef = ParamType | `${ParamType}?` | string;
export type ParamList = (string | number | { start: number; end: number } | undefined)[];

export type MultiLineRequest = {
	__isMultiLineRequest: true;
	prompt: string;
	terminator: string;
	onComplete: (lines: string[]) => string | Promise<string>;
};

export type Command = {
	description: string;
	paramDef: ParamDef[];
	fn: (
		vm: VirtualMachine,
		progress: Ref<number>,
		params: ParamList,
	) => string | Promise<string> | MultiLineRequest | Promise<MultiLineRequest>;
	closeOnSuccess?: boolean;
	group?: string;
};
export type CommandWrapper = {
	description: string;
	paramDef: ParamDef[];
	base: Command;
	staticParams?: {
		prepend?: (string | number)[];
		append?: (string | number)[];
	};
	closeOnSuccess?: boolean;
	group?: string;
};

function typedKeys<T extends object>(obj: T): (keyof T)[] {
	return Object.keys(obj) as (keyof T)[];
}

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

const cmdHelp: Command = {
	description: "Lists all available commands.",
	paramDef: [],
	group: "Console",
	fn: (_vm: VirtualMachine, _progress, _params: ParamList) => {
		const groups: Record<string, { key: string; cmd: Command | CommandWrapper }[]> = {};

		typedKeys(COMMAND_LIST)
			.sort()
			.forEach((key) => {
				const cmd = COMMAND_LIST[key] as Command | CommandWrapper;
				const groupName = cmd.group ?? "General";
				if (!groups[groupName]) {
					groups[groupName] = [];
				}
				groups[groupName]!.push({ key, cmd });
			});

		let output = "Available commands:";

		const sortedGroupNames = Object.keys(groups).sort();

		const wrapText = (text: string, indent: number, maxWidth: number) => {
			const words = text.split(" ");
			const lines: string[] = [];
			let currentLine = "";

			words.forEach((word) => {
				if ((currentLine + word).length > maxWidth) {
					lines.push(currentLine);
					currentLine = "";
				}
				currentLine += (currentLine.length > 0 ? " " : "") + word;
			});
			if (currentLine) lines.push(currentLine);

			return lines.join("\n" + " ".repeat(indent));
		};

		for (const groupName of sortedGroupNames) {
			output += `\n\n[ ${groupName} ]`;
			const commandsInGroup = groups[groupName]!;
			if (groupName === "Scripting") {
				commandsInGroup.push({
					key: "DO",
					cmd: {
						description: "Execute a defined routine.",
						paramDef: ["string"],
						fn: () => "",
					},
				});
				commandsInGroup.push({
					key: "IF",
					cmd: {
						description: "Conditional: IF <expression> [THEN] <command>",
						paramDef: ["expr"],
						fn: () => "",
					},
				});
			}
			const commandHelp = commandsInGroup
				.map(({ key, cmd }) => {
					const params = cmd.paramDef.map((p) => `<${p}>`).join(" ");
					const prefix = `${key.padEnd(10)} ${params.padEnd(28)} `;
					const desc = wrapText(cmd.description || "", 40, 60);
					return `\n${prefix}${desc}`;
				})
				.join("");
			output += commandHelp;
		}

		return output;
	},
};

const listRoutinesCmd: Command = {
	description: "Lists all defined routines.",
	paramDef: [],
	fn: () => {
		const { getRoutineNames } = useRoutines();
		const routineNames = getRoutineNames();
		if (routineNames.length === 0) return "No routines defined.";

		return "Defined routines:\n" + routineNames.map((name) => `- ${name}`).join("\n");
	},
};

const defineRoutineCmd: Command = {
	description: "Define a routine on multiple lines, ended by END.",
	paramDef: ["string"],
	fn: (_vm, _progress, params) => {
		const routineName = params[0] as string;
		if (!routineName) {
			throw new Error("Routine name missing.");
		}

		return {
			__isMultiLineRequest: true,
			prompt: `${routineName}|`,
			terminator: "END",
			onComplete: (lines: string[]) => {
				const { setRoutine } = useRoutines();
				setRoutine(routineName, lines);
				return `Routine '${routineName}' defined.`;
			},
		};
	},
};

const COMMAND_LIST: Record<string, Command | CommandWrapper> = {
	"A=": { ...setA, group: "Registers" },
	"X=": { ...setX, group: "Registers" },
	"Y=": { ...setY, group: "Registers" },
	"PC=": { ...setPC, group: "Registers" },
	"SP=": { ...setSP, group: "Registers" },
	GL: { ...gl, group: "Memory" },
	RUN: { ...run, closeOnSuccess: true, group: "Execution" },
	PAUSE: { ...pause, group: "Execution" },
	RESET: { ...reset, group: "Execution" },
	REBOOT: { ...reboot, group: "Execution" },
	SPEED: { ...speed, group: "Execution" },
	D: { ...setDisasmView, group: "Viewers" },
	M: { ...setMemView, group: "Viewers" },
	CODE: { ...defCode, group: "Memory" },
	DB: {
		description: "define n bytes at <address> with n = <word>",
		paramDef: ["address", "word"],
		base: defData,
		staticParams: { prepend: ["byte"] },
		group: "Memory",
	},
	DW: {
		description: "define n words at <address> with n = <word>",
		paramDef: ["address", "word"],
		base: defData,
		staticParams: { prepend: ["word"] },
		group: "Memory",
	},
	DA: {
		description: "define a string/ascii at <address> with length <word>",
		paramDef: ["address", "word"],
		base: defData,
		staticParams: { prepend: ["string"] },
		group: "Memory",
	},
	DEF: { ...defLabel, group: "Symbols" },
	UNDEF: { ...undefLabel, group: "Symbols" },
	REN: { ...renLabel, group: "Symbols" },
	FIND: { ...findLabel, group: "Symbols" },
	FONT: { ...font, group: "Console" },
	HOOK: { ...hook, group: "Breakpoints" },
	HOOKS: { ...listHooks, group: "Breakpoints" },
	LABELS: { ...labelsCmd, group: "Symbols" },
	M1: {
		description: "set MemViewer(1) <address>",
		paramDef: ["address"],
		base: setMemView,
		staticParams: { append: [1] },
		group: "Viewers",
	},
	M2: {
		description: "set MemViewer(2) <address>",
		paramDef: ["address"],
		base: setMemView,
		staticParams: { append: [2] },
		group: "Viewers",
	},
	M3: {
		description: "set MemViewer(3) <address>",
		paramDef: ["address"],
		base: setMemView,
		staticParams: { append: [3] },
		group: "Viewers",
	},
	BP: {
		description: "Add execution breakpoint",
		paramDef: ["range|address"],
		fn: execAddBP("pc"),
		group: "Breakpoints",
	},
	BPA: {
		description: "Add Mem Access breakpoint",
		paramDef: ["range|address"],
		fn: execAddBP("access"),
		group: "Breakpoints",
	},
	BPW: {
		description: "Add Mem Write breakpoint",
		paramDef: ["range|address"],
		fn: execAddBP("write"),
		group: "Breakpoints",
	},
	BPR: {
		description: "Add Mem Read breakpoint",
		paramDef: ["range|address"],
		fn: execAddBP("read"),
		group: "Breakpoints",
	},
	BC: {
		description: "Remove execution breakpoint",
		paramDef: ["range|address"],
		fn: execRemoveBP("pc"),
		group: "Breakpoints",
	},
	BCA: {
		description: "Remove Mem Access breakpoint",
		paramDef: ["range|address"],
		fn: execRemoveBP("access"),
		group: "Breakpoints",
	},
	BCW: {
		description: "Remove Mem Write breakpoint",
		paramDef: ["range|address"],
		fn: execRemoveBP("write"),
		group: "Breakpoints",
	},
	BCR: {
		description: "Remove Mem Read breakpoint",
		paramDef: ["range|address"],
		fn: execRemoveBP("read"),
		group: "Breakpoints",
	},
	EXPLAIN: { ...explain, closeOnSuccess: true, group: "AI" },
	LOG: { ...logCmd, group: "Logging" },
	PRINT: { ...printCmd, group: "Console" },
	ROUTINE: { ...defineRoutineCmd, group: "Scripting" },
	ROUTINES: { ...listRoutinesCmd, group: "Scripting" },
	HELP: cmdHelp,
	EDITROUTINES: {
		description: "Open the routine editor window.",
		paramDef: [],
		fn: () => {
			useRoutineEditor().open();
			return "Opening routine editor...";
		},
		closeOnSuccess: true,
		group: "Scripting",
	},
	CLS: {
		description: "Clear console",
		paramDef: [],
		fn: (_vm, _progress, _params: ParamList) => {
			useCmdConsole().clearConsole();
			return "";
		},
		group: "Console",
	},
};

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
			const singleCmd = commandQueue.shift() as string;
			const singleCmdTrimmed = singleCmd.trim();

			if (singleCmdTrimmed === END_ROUTINE_MARKER) continue;

			const cmd = singleCmdTrimmed.split(" ")[0]?.toUpperCase();

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

			if (cmdKey) {
				const cmdSpec = COMMAND_LIST[cmdKey] as Command | CommandWrapper;

				const commandToRun = "base" in cmdSpec ? cmdSpec.base : cmdSpec;
				const paramDef = cmdSpec.paramDef;

				let paramStr = singleCmdTrimmed.slice(cmdKey.length).trim();
				const userParams: ParamList = [];

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
			} else {
				if (cmd) throw new Error(`Unknown command: ${cmd}`);
			}
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
				if (commandHistory.value.length > HISTORY_MAX_SIZE) {
					commandHistory.value.splice(0, commandHistory.value.length - HISTORY_MAX_SIZE);
				}
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
