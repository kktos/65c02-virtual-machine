import { useCmdConsole } from "@/composables/useCmdConsole";
import { useRoutineEditor } from "@/composables/useRoutineEditor";
import { execAddBP } from "./addBP.cmd";
import { defCode } from "./defCode.cmd";
import { defData } from "./defData.cmd";
import { defLabel } from "./defLabel.cmd";
import { findLabel } from "./findLabel.cmd";
import { font } from "./font.cmd";
import { gl } from "./gl.cmd";
import { hook } from "./hook.cmd";
import { labelsCmd } from "./labels.cmd";
import { listCmd } from "./list.cmd";
import { logCmd } from "./log.cmd";
import { pause } from "./pause.cmd";
import { printCmd } from "./print.cmd";
import { reboot } from "./reboot.cmd";
import { execRemoveBP } from "./removeBP.cmd";
import { renLabel } from "./renLabel.cmd";
import { reset } from "./reset.cmd";
import { run } from "./run.cmd";
import { setA } from "./setA.cmd";
import { setDisasmView } from "./setDisasmView.cmd";
import { setMemView } from "./setMemView.cmd";
import { setPC } from "./setPC.cmd";
import { setSP } from "./setSP.cmd";
import { setX } from "./setX.cmd";
import { setY } from "./setY.cmd";
import { speed } from "./speed.cmd";
import { undefLabel } from "./undefLabel.cmd";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { routineCmd } from "./routine.cmd";
import { explainCmd } from "./explainCode.cmd";
import type { Command, CommandWrapper, ParamList } from "@/types/command";

export function typedKeys<T extends object>(obj: T): (keyof T)[] {
	return Object.keys(obj) as (keyof T)[];
}

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
						group: "Scripting",
						description: "Execute a defined routine.",
						paramDef: ["string"],
						fn: () => "",
					},
				});
				commandsInGroup.push({
					key: "IF",
					cmd: {
						group: "Scripting",
						description: "Conditional: IF <expression> [THEN] <command>",
						paramDef: ["expr"],
						fn: () => "",
					},
				});
			}
			if (groupName === "Monitor") {
				commandsInGroup.push({
					key: "<addr>",
					cmd: {
						group: "Monitor",
						description: "Displays byte at <addr>",
						fn: () => "",
					},
				});
				commandsInGroup.push({
					key: "<addr>L",
					cmd: {
						group: "Monitor",
						description: "Disassembles 32 lines from <addr>",
						fn: () => "",
					},
				});
				commandsInGroup.push({
					key: "<start>.<end>",
					cmd: {
						group: "Monitor",
						description: "Displays bytes from <start> to <end>",
						fn: () => "",
					},
				});
				commandsInGroup.push({
					key: "<start>.<end>L",
					cmd: {
						group: "Monitor",
						description: "Disassembles from <start> to <end>",
						fn: () => "",
					},
				});
				commandsInGroup.push({
					key: "<addr>:",
					cmd: {
						paramDef: ["byte|word|long|string"],
						group: "Monitor",
						description: "Write bytes / words / longs / strings(\":bit7=1 | ':bit7=0) at <addr>",
						fn: () => "",
					},
				});
			}
			const commandHelp = commandsInGroup
				.map(({ key, cmd }) => {
					const params = cmd.paramDef?.map((p) => `<${p}>`).join(" ");
					const prefix = `${key.padEnd(10)} ${(params || "").padEnd(28)} `;
					const desc = wrapText(cmd.description || "", 40, 60);
					return `\n${prefix}${desc}`;
				})
				.join("");
			output += commandHelp;
		}

		return output;
	},
};

export const COMMAND_LIST: Record<string, Command | CommandWrapper> = {
	"A=": { ...setA, group: "Monitor" },
	"X=": { ...setX, group: "Monitor" },
	"Y=": { ...setY, group: "Monitor" },
	"PC=": { ...setPC, group: "Monitor" },
	"SP=": { ...setSP, group: "Monitor" },
	GL: { ...gl, group: "Memory" },
	RUN: { ...run, closeOnSuccess: true, group: "Execution" },
	PAUSE: { ...pause, group: "Execution" },
	RESET: { ...reset, group: "Execution" },
	REBOOT: { ...reboot, group: "Execution" },
	SPEED: speed,
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
	HOOK: hook,
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
	EXPLAIN: explainCmd,
	LOG: { ...logCmd, group: "Logging" },
	ROUTINE: routineCmd,
	HELP: cmdHelp,
	EDITROUTINES: {
		description: "Open the routine editor window.",
		fn: () => {
			useRoutineEditor().open();
			return "Opening routine editor...";
		},
		closeOnSuccess: true,
		group: "Scripting",
	},
	LIST: listCmd,
	PRINT: { ...printCmd, group: "Console" },
	CLS: {
		description: "Clear console",
		fn: (_vm, _progress, _params: ParamList) => {
			useCmdConsole().clearConsole();
			return "";
		},
		group: "Console",
	},
};
