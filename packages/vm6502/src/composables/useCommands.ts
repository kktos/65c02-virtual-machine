import { ref, type Ref } from "vue";
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
import { addBreakpointCommand } from "@/commands/addBP.cmd";
import { removeBreakpointCommand } from "@/commands/removeBP.cmd";
import { reset } from "@/commands/reset.cmd";
import { reboot } from "@/commands/reboot.cmd";
import { explain } from "@/commands/explainCode.cmd";
import { speed } from "@/commands/speed.cmd";

type ParamType = "byte" | "word" | "long" | "number" | "string";
type ParamDef = ParamType | `${ParamType}?`;
export type ParamList = (string | number | undefined)[];
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

const commandHistory = ref<string[]>([]);

export function useCommands() {
	const error = ref("");
	const success = ref("");
	const isLoading = ref(false);
	const progress = ref(0);
	const shouldClose = ref(false);

	const parseValue = (valStr: string, max: number): number => {
		const isHex = valStr.startsWith("$");
		const value = Number.parseInt(isHex ? valStr.slice(1) : valStr, isHex ? 16 : 10);
		if (Number.isNaN(value)) throw new Error(`Invalid value: ${valStr}`);
		if (value > max) throw new Error(`Value exceeds range (max $${max.toString(16).toUpperCase()})`);
		return value;
	};

	const cmdHelp: Command = {
		description: "Lists all available commands.",
		paramDef: [],
		fn: (_vm: VirtualMachine, _progress, _params: ParamList) => {
			const commandHelp: string = typedKeys(COMMAND_LIST)
				.sort()
				.map((key) => {
					const cmd = COMMAND_LIST[key];
					return `${key.padEnd(8)} ${cmd?.description}`;
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
		M1: {
			description: "set MemViewer(1) address. Params: <address>",
			paramDef: ["long"],
			base: setMemView,
			staticParams: { append: [1] },
		},
		M2: {
			description: "set MemViewer(2) address. Params: <address>",
			paramDef: ["long"],
			base: setMemView,
			staticParams: { append: [2] },
		},
		M3: {
			description: "set MemViewer(3) address. Params: <address>",
			paramDef: ["long"],
			base: setMemView,
			staticParams: { append: [3] },
		},
		BP: {
			description: "Add execution breakpoint",
			paramDef: ["long"],
			base: addBreakpointCommand,
			staticParams: { prepend: ["pc"] },
		},
		BPA: {
			description: "Add Mem Access breakpoint",
			paramDef: ["long"],
			base: addBreakpointCommand,
			staticParams: { prepend: ["access"] },
		},
		BPW: {
			description: "Add Mem Write breakpoint",
			paramDef: ["long"],
			base: addBreakpointCommand,
			staticParams: { prepend: ["write"] },
		},
		BPR: {
			description: "Add Mem Read breakpoint",
			paramDef: ["long"],
			base: addBreakpointCommand,
			staticParams: { prepend: ["read"] },
		},
		BC: {
			description: "Remove execution breakpoint",
			paramDef: ["long"],
			base: removeBreakpointCommand,
			staticParams: { prepend: ["pc"] },
		},
		BCA: {
			description: "Remove Mem Access breakpoint",
			paramDef: ["long"],
			base: removeBreakpointCommand,
			staticParams: { prepend: ["access"] },
		},
		BCW: {
			description: "Remove Mem Write breakpoint",
			paramDef: ["long"],
			base: removeBreakpointCommand,
			staticParams: { prepend: ["write"] },
		},
		BCR: {
			description: "Remove Mem Read breakpoint",
			paramDef: ["long"],
			base: removeBreakpointCommand,
			staticParams: { prepend: ["read"] },
		},
		EXPLAIN: { ...explain, closeOnSuccess: true },
		HELP: cmdHelp,
	};

	const executeCommand = async (cmdInput: string, vm: VirtualMachine | null) => {
		if (!vm) {
			error.value = "Virtual Machine not initialized.";
			return false;
		}

		if (isLoading.value) return false;

		let input = cmdInput.trim().toUpperCase();
		if (!input) input = "HELP";

		isLoading.value = true;
		progress.value = 0;
		error.value = "";
		success.value = "";
		shouldClose.value = false;

		// Find command
		const cmd = input.split(" ")[0];
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
					let paramDef = cmdSpec.paramDef[i] as ParamDef;
					if (paramDef.endsWith("?")) paramDef = paramDef.slice(0, -1) as ParamType;

					switch (paramDef) {
						case "byte":
							userParams.push(parseValue(param, 0xff));
							break;
						case "word":
							userParams.push(parseValue(param, 0xffff));
							break;
						case "long":
							userParams.push(parseValue(param, 0xffffffff));
							break;
						case "number":
							userParams.push(Number.parseFloat(param));
							break;
						case "string":
							userParams.push(param);
							break;
						default:
							throw `Unknown parameter type: ${paramDef}`;
					}
				}

				const cleanInput = cmdInput.trim();
				if (cleanInput && commandHistory.value[commandHistory.value.length - 1] !== cleanInput)
					commandHistory.value.push(cleanInput);

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
