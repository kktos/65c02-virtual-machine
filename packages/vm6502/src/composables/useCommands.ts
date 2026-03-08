import { computed, ref, type Ref, watch } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { setA } from "@/commands/setA.cmd";
import { setPC } from "@/commands/setPC.cmd";
import { setX } from "@/commands/setX.cmd";
import { setY } from "@/commands/setY.cmd";
import { setSP } from "@/commands/setSP.cmd";
import { gl } from "@/commands/gl.cmd";
import { run } from "@/commands/run.cmd";
import { pause } from "@/commands/pause.cmd";
import { setDisasmView } from "@/commands/setDisasmView.cmd";
import { setMemView } from "@/commands/setMemView.cmd";
import { reset } from "@/commands/reset.cmd";
import { reboot } from "@/commands/reboot.cmd";
import { explain } from "@/commands/explainCode.cmd";
import { speed } from "@/commands/speed.cmd";
import { useSymbols } from "./useSymbols";
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

type ParamType = "byte" | "word" | "long" | "number" | "address" | "range" | "string";
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
};

function typedKeys<T extends object>(obj: T): (keyof T)[] {
	return Object.keys(obj) as (keyof T)[];
}

const HISTORY_MAX_SIZE = 50;
const LS_KEY_HISTORY = "vm6502-console-history";
const commandHistory = ref<string[]>(JSON.parse(localStorage.getItem(LS_KEY_HISTORY) || "[]"));
const routines = ref<Record<string, string[]>>({});

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

const parseValue = (valStr: string, max: number): number => {
	const isHex = valStr.startsWith("$");
	const cleanStr = isHex ? valStr.slice(1) : valStr;

	if (isHex && !/^[0-9A-Fa-f]+$/.test(cleanStr)) throw new Error(`Invalid hex format: ${valStr}`);
	if (!isHex && !/^\d+$/.test(cleanStr)) throw new Error(`Invalid number format: ${valStr}`);

	const value = Number.parseInt(cleanStr, isHex ? 16 : 10);
	if (Number.isNaN(value)) throw new Error(`Invalid value: ${valStr}`);
	if (value > max) throw new Error(`Value exceeds range (max $${max.toString(16).toUpperCase()})`);
	return value;
};

const { getAddressForLabel } = useSymbols();

const parseAddress = (valStr: string): number => {
	const isHex = valStr.startsWith("$");
	if (isHex) return parseValue(valStr, 0xffff);

	const [ns, label] = valStr.split("::") as [string, string | undefined];
	const value = label ? getAddressForLabel(label, ns) : getAddressForLabel(ns);
	if (value === undefined) throw new Error(`Uknown label: ${valStr}`);

	return value;
};

const parseRange = (valStr: string): { start: number; end: number } => {
	const separator = valStr.includes(":") ? ":" : valStr.includes("-") ? "-" : null;
	if (!separator) throw new Error("Invalid range format");

	const [startStr, endStr] = valStr.split(separator);
	if (!startStr || !endStr) throw new Error("Invalid range format");

	return { start: parseAddress(startStr.trim()), end: parseAddress(endStr.trim()) };
};

const labelsCmd: Command = {
	description: "Define multiple labels. Usage: LABELS <namespace> [<scope>] ... END",
	paramDef: ["string", "string?"],
	fn: (_vm, _progress, params) => {
		const namespace = params[0] as string;
		const scope = (params[1] as string) || "main";

		return {
			__isMultiLineRequest: true,
			prompt: `LABELS ${namespace}|`,
			terminator: "END",
			onComplete: async (lines: string[]) => {
				const { addManySymbols } = useSymbols();
				const symbols: { ns: string; label: string; addr: number; scope: string }[] = [];

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;

					const parts = trimmed.split(/\s+/) as [string, string];
					if (parts.length < 2)
						throw new Error(`Invalid line format: "${line}". Expected: <address> <label>`);

					const addrStr = parts[0];
					const label = parts[1];
					const addr = parseValue(addrStr, 0xffffff);

					symbols.push({ ns: namespace, label, addr, scope });
				}

				if (symbols.length > 0) {
					await addManySymbols(symbols);
					return `Defined ${symbols.length} labels in namespace '${namespace}' (scope: ${scope}).`;
				}
				return "No labels defined.";
			},
		};
	},
};

const cmdHelp: Command = {
	description: "Lists all available commands.",
	paramDef: [],
	fn: (_vm: VirtualMachine, _progress, _params: ParamList) => {
		const commandHelp: string = typedKeys(COMMAND_LIST)
			.sort()
			.map((key) => {
				const cmd = COMMAND_LIST[key] as Command | CommandWrapper;
				const params = cmd.paramDef.map((p) => `<${p}>`).join(" ");
				return `${key.padEnd(10)} ${params.padEnd(28)} ${cmd?.description}`;
			})
			.join("\n");
		const routineHelp = [
			"DO".padEnd(11) + "<name>".padEnd(29) + "Execute a defined routine.",
			"ROUTINE".padEnd(11) + "<name> ... END".padEnd(29) + "Define a routine.",
		].join("\n");
		return `Available commands:\n${commandHelp}\n\n${routineHelp}`;
	},
};

const listRoutinesCmd: Command = {
	description: "Lists all defined routines.",
	paramDef: [],
	fn: () => {
		const routineNames = Object.keys(routines.value);
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
				routines.value[routineName] = lines;
				return `Routine '${routineName}' defined.`;
			},
		};
	},
};

const COMMAND_LIST: Record<string, Command | CommandWrapper> = {
	"A=": setA,
	"X=": setX,
	"Y=": setY,
	"PC=": setPC,
	"SP=": setSP,
	GL: gl,
	RUN: { ...run, closeOnSuccess: true },
	PAUSE: pause,
	RESET: reset,
	REBOOT: reboot,
	SPEED: speed,
	D: setDisasmView,
	M: setMemView,
	CODE: defCode,
	DB: {
		description: "define n bytes at <address> with n = <word>",
		paramDef: ["address", "word"],
		base: defData,
		staticParams: { prepend: ["byte"] },
	},
	DW: {
		description: "define n words at <address> with n = <word>",
		paramDef: ["address", "word"],
		base: defData,
		staticParams: { prepend: ["word"] },
	},
	DA: {
		description: "define a string/ascii at <address> with length <word>",
		paramDef: ["address", "word"],
		base: defData,
		staticParams: { prepend: ["string"] },
	},
	DEF: defLabel,
	UNDEF: undefLabel,
	REN: renLabel,
	FIND: findLabel,
	FONT: font,
	LABELS: labelsCmd,
	M1: {
		description: "set MemViewer(1) <address>",
		paramDef: ["address"],
		base: setMemView,
		staticParams: { append: [1] },
	},
	M2: {
		description: "set MemViewer(2) <address>",
		paramDef: ["address"],
		base: setMemView,
		staticParams: { append: [2] },
	},
	M3: {
		description: "set MemViewer(3) <address>",
		paramDef: ["address"],
		base: setMemView,
		staticParams: { append: [3] },
	},
	BP: {
		description: "Add execution breakpoint",
		paramDef: ["range|address"],
		fn: execAddBP("pc"),
	},
	BPA: {
		description: "Add Mem Access breakpoint",
		paramDef: ["range|address"],
		fn: execAddBP("access"),
	},
	BPW: {
		description: "Add Mem Write breakpoint",
		paramDef: ["range|address"],
		fn: execAddBP("write"),
	},
	BPR: {
		description: "Add Mem Read breakpoint",
		paramDef: ["range|address"],
		fn: execAddBP("read"),
	},
	BC: {
		description: "Remove execution breakpoint",
		paramDef: ["range|address"],
		fn: execRemoveBP("pc"),
	},
	BCA: {
		description: "Remove Mem Access breakpoint",
		paramDef: ["range|address"],
		fn: execRemoveBP("access"),
	},
	BCW: {
		description: "Remove Mem Write breakpoint",
		paramDef: ["range|address"],
		fn: execRemoveBP("write"),
	},
	BCR: {
		description: "Remove Mem Read breakpoint",
		paramDef: ["range|address"],
		fn: execRemoveBP("read"),
	},
	EXPLAIN: { ...explain, closeOnSuccess: true },
	ROUTINE: defineRoutineCmd,
	ROUTINES: listRoutinesCmd,
	HELP: cmdHelp,
	CLS: {
		description: "Clear console",
		paramDef: [],
		fn: (_vm, _progress, _params: ParamList) => {
			useCmdConsole().clearConsole();
			return "";
		},
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

			if (singleCmdTrimmed === END_ROUTINE_MARKER) {
				continue;
			}

			const cmd = singleCmdTrimmed.split(" ")[0]?.toUpperCase();

			if (cmd === "DO") {
				const parts = singleCmdTrimmed.split(/\s+/);
				if (parts.length < 2) throw new Error("Routine name missing for DO command.");

				const routineName = parts[1] as string;
				const routineCmds = routines.value[routineName];
				if (!routineCmds) throw new Error(`Routine '${routineName}' not found.`);

				commandQueue.unshift(...routineCmds, END_ROUTINE_MARKER);
				const msg = `Executing routine '${routineName}'...`;
				success.value = success.value ? success.value + "\n" + msg : msg;
				continue;
			}

			const cmdKey = typedKeys(COMMAND_LIST).find((key) => cmd === key);

			if (cmdKey) {
				const cmdSpec = COMMAND_LIST[cmdKey] as Command | CommandWrapper;
				const paramStr = singleCmdTrimmed.slice(cmdKey.length).trim();
				const paramsAsStr = paramStr.length > 0 ? paramStr.split(/\s+/) : [];

				const commandToRun = "base" in cmdSpec ? cmdSpec.base : cmdSpec;
				const paramDef = cmdSpec.paramDef;

				const requiredParams = paramDef.filter((p) => !p.endsWith("?")).length;
				const maxParams = paramDef.length;

				if (paramsAsStr.length < requiredParams || paramsAsStr.length > maxParams) {
					throw new Error(
						`Invalid parameters for "${cmdKey}". Expected ${requiredParams}${
							requiredParams !== maxParams ? `-${maxParams}` : ""
						}, got ${paramsAsStr.length}.`,
					);
				}

				const userParams: ParamList = [];
				for (let i = 0; i < paramsAsStr.length; i++) {
					const param = paramsAsStr[i] as string;
					let paramDefStr = cmdSpec.paramDef[i] as string;
					if (paramDefStr.endsWith("?")) paramDefStr = paramDefStr.slice(0, -1);

					const allowedTypes = paramDefStr.split("|");
					let parsedValue: any = undefined;
					let lastError: Error | null = null;

					for (const type of allowedTypes) {
						try {
							switch (type) {
								case "byte":
									parsedValue = parseValue(param, 0xff);
									break;
								case "word":
									parsedValue = parseValue(param, 0xffff);
									break;
								case "long":
									parsedValue = parseValue(param, 0xffffffff);
									break;
								case "address":
									parsedValue = parseAddress(param);
									break;
								case "range":
									parsedValue = parseRange(param);
									break;
								case "number":
									parsedValue = Number.parseFloat(param);
									if (Number.isNaN(parsedValue)) throw new Error("Invalid number");
									break;
								case "string":
									parsedValue = param;
									break;
								default:
									throw new Error(`Unknown parameter type: ${type}`);
							}
							if (parsedValue !== undefined) break;
						} catch (e: any) {
							lastError = e;
						}
					}

					if (parsedValue === undefined) throw lastError || new Error("Invalid parameter");
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
		routines,
	};
}
