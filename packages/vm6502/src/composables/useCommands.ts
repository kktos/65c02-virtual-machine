import { ref, type Ref } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { setA } from "@/commands/setA.cmd";
import { setPC } from "@/commands/setPC.cmd";
import { setX } from "@/commands/setX.cmd";
import { setY } from "@/commands/setY.cmd";
import { setSP } from "@/commands/setSP.cmd";
import { gl } from "@/commands/gl.cmd";

type ParamType = "byte" | "word" | "string";
type ParamDef = ParamType | `${ParamType}?`;
export type ParamList = (string | number | undefined)[];
export type Command = {
	description: string;
	paramDef: ParamDef[];
	fn: (vm: VirtualMachine, progress: Ref<number>, params: ParamList) => string | Promise<string>;
};

function typedKeys<T extends object>(obj: T): (keyof T)[] {
	return Object.keys(obj) as (keyof T)[];
}

export function useCommands() {
	const error = ref("");
	const success = ref("");
	const isLoading = ref(false);
	const progress = ref(0);

	const parseValue = (valStr: string, max: number): number => {
		const isHex = valStr.startsWith("$");
		const value = parseInt(isHex ? valStr.slice(1) : valStr, isHex ? 16 : 10);
		if (Number.isNaN(value)) throw new Error(`Invalid value: ${valStr}`);
		if (value > max) throw new Error(`Value exceeds range (max $${max.toString(16).toUpperCase()})`);
		return value;
	};

	const COMMAND_LIST: Record<string, Command> = {
		"A=": setA,
		"X=": setX,
		"Y=": setY,
		"PC=": setPC,
		"SP=": setSP,
		GL: gl,
		HELP: {
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
		},
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

		// Find command
		const cmdKey = typedKeys(COMMAND_LIST).find((key) => input.startsWith(key));

		try {
			if (cmdKey) {
				const commandDef = COMMAND_LIST[cmdKey] as Command;
				const paramStr = input.slice(cmdKey.length).trim();
				const paramsAsStr = paramStr.length > 0 ? paramStr.split(/\s+/) : [];

				const requiredParams = commandDef.paramDef.filter((p) => !p.endsWith("?")).length;
				const maxParams = commandDef.paramDef.length;

				if (paramsAsStr.length < requiredParams || paramsAsStr.length > maxParams) {
					throw new Error(
						`Invalid parameters. Expected ${requiredParams}${
							requiredParams !== maxParams ? `-${maxParams}` : ""
						}, got ${paramsAsStr.length}.`,
					);
				}

				const params: (string | number)[] = [];
				for (let i = 0; i < paramsAsStr.length; i++) {
					const param = paramsAsStr[i] as string;
					let paramDef = commandDef.paramDef[i] as ParamDef;
					if (paramDef.endsWith("?")) paramDef = paramDef.slice(0, -1) as ParamType;

					if (paramDef === "byte") params.push(parseValue(param, 0xff));
					else if (paramDef === "word") params.push(parseValue(param, 0xffff));
					else if (paramDef === "string") params.push(param);
					else throw `Unknown parameter type: ${paramDef}`;
				}
				success.value = await commandDef.fn(vm, progress, params);
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
	};
}
