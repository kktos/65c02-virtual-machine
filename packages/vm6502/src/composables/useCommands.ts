import { ref, type Ref, watch } from "vue";
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
export type Command = {
	description: string;
	paramDef: ParamDef[];
	fn: (vm: VirtualMachine, progress: Ref<number>, params: ParamList) => string | Promise<string>;
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
	fn: (_vm: VirtualMachine, _progress, _params: ParamList) => {
		const commandHelp: string = typedKeys(COMMAND_LIST)
			.sort()
			.map((key) => {
				const cmd = COMMAND_LIST[key] as Command | CommandWrapper;
				const params = cmd.paramDef.map((p) => `<${p}>`).join(" ");
				return `${key.padEnd(8)} ${params.padEnd(30)} ${cmd?.description}`;
			})
			.join("\n");
		return `Available commands:\n${commandHelp}`;
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

	const value = getAddressForLabel(valStr);
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

export function useCommands() {
	const error = ref("");
	const success = ref("");
	const isLoading = ref(false);
	const progress = ref(0);
	const shouldClose = ref(false);

	const executeCommand = async (cmdInput: string, vm: VirtualMachine | null) => {
		if (!vm) {
			error.value = "Virtual Machine not initialized.";
			return false;
		}

		if (isLoading.value) return false;

		let input = cmdInput.trim();
		if (!input) input = "HELP";

		isLoading.value = true;
		progress.value = 0;
		error.value = "";
		success.value = "";
		shouldClose.value = false;

		// Find command
		const cmd = input.split(" ")[0]?.toUpperCase();
		const cmdKey = typedKeys(COMMAND_LIST).find((key) => cmd === key);

		try {
			if (cmdKey) {
				const cmdSpec = COMMAND_LIST[cmdKey] as Command | CommandWrapper;
				const paramStr = input.slice(cmdKey.length).trim();
				const paramsAsStr = paramStr.length > 0 ? paramStr.split(/\s+/) : [];

				const commandToRun = "base" in cmdSpec ? cmdSpec.base : cmdSpec;
				const paramDef = cmdSpec.paramDef;

				const requiredParams = paramDef.filter((p) => !p.endsWith("?")).length;
				const maxParams = paramDef.length;

				if (paramsAsStr.length < requiredParams || paramsAsStr.length > maxParams) {
					throw new Error(
						`Invalid parameters. Expected ${requiredParams}${
							requiredParams !== maxParams ? `-${maxParams}` : ""
						}, got ${paramsAsStr.length}.`,
					);
				}

				const userParams: (string | number)[] = [];
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

				const cleanInput = cmdInput.trim();
				if (cleanInput && commandHistory.value[commandHistory.value.length - 1] !== cleanInput) {
					commandHistory.value.push(cleanInput);
					if (commandHistory.value.length > HISTORY_MAX_SIZE) {
						commandHistory.value.splice(0, commandHistory.value.length - HISTORY_MAX_SIZE);
					}
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

				success.value = await commandToRun.fn(vm, progress, finalParams);
				if (cmdSpec.closeOnSuccess) shouldClose.value = true;
				return true;
			} else {
				throw new Error("Unknown command");
			}
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
	};
}
