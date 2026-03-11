import { useCmdConsole } from "@/composables/useCmdConsole";
import { useRoutineEditor } from "@/composables/useRoutineEditor";
import { execAddBP } from "./addBP.cmd";
import { defCode } from "./defCode.cmd";
import { defData } from "./defData.cmd";
import { defLabel } from "./defLabel.cmd";
import { findLabel } from "./findLabel.cmd";
import { font } from "./font.cmd";
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
import { setDisasmView } from "./setDisasmView.cmd";
import { setMemView } from "./setMemView.cmd";
import { speed } from "./speed.cmd";
import { undefLabel } from "./undefLabel.cmd";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { routineCmd } from "./routine.cmd";
import { explainCmd } from "./explainCode.cmd";
import type { Command, CommandResult, CommandWrapper, ParamList } from "@/types/command";
import { useCommands } from "@/composables/useCommands";
import { stepCmd } from "./step.cmd";
import { glCmd } from "./gl.cmd";
import { setCmd } from "./set.cmd";

export function typedKeys<T extends object>(obj: T): (keyof T)[] {
	return Object.keys(obj) as (keyof T)[];
}

function d(g: string, d: string) {
	return {
		description: d,
		group: g,
		fn: () => "",
	};
}

const cmdHelp: Command = {
	description: "Lists all available commands. Can be filtered by group name (e.g., HELP cons).",
	paramDef: ["string?"],
	group: "Console",
	fn: (_vm: VirtualMachine, _progress, _params: ParamList): CommandResult => {
		const groupFilter = (_params[0] as string | undefined)?.toUpperCase();
		const groups: Record<string, { key: string; cmd: Command | CommandWrapper; aliases: string[] }[]> = {};
		const commandAliases: Record<string, string[]> = {};

		// First pass: find all aliases and the commands they refer to.
		typedKeys(COMMAND_LIST).forEach((key) => {
			const cmdOrAlias = COMMAND_LIST[key];
			if (typeof cmdOrAlias === "string") {
				if (!commandAliases[cmdOrAlias]) commandAliases[cmdOrAlias] = [];
				commandAliases[cmdOrAlias]!.push(key);
			}
		});

		typedKeys(COMMAND_LIST)
			.sort()
			.forEach((key) => {
				const cmdOrAlias = COMMAND_LIST[key];
				// Skip aliases, they will be handled with their main command.
				if (typeof cmdOrAlias === "string") return;

				const cmd = cmdOrAlias as Command | CommandWrapper;
				const groupName = cmd.group ?? "General";
				if (!groups[groupName]) groups[groupName] = [];

				// Sort aliases alphabetically
				const aliases = commandAliases[key]?.sort() || [];
				groups[groupName]!.push({ key, cmd, aliases });
			});

		let output = "";

		const sortedGroupNames = Object.keys(groups).sort();

		for (const groupName of sortedGroupNames) {
			if (groupFilter && !groupName.toUpperCase().startsWith(groupFilter)) continue;

			output += `\n## ${groupName}\n\n| Command(s) | Parameters | Description |\n|---|---|---|\n`;
			const commandsInGroup = groups[groupName]!;
			if (groupName === "Monitor") {
				commandsInGroup.push({
					key: "`addr`",
					aliases: [],
					cmd: {
						group: "Monitor",
						description: "Displays byte at `addr`",
						fn: () => "",
					},
				});
				commandsInGroup.push({
					key: "`addr`L",
					aliases: [],
					cmd: {
						group: "Monitor",
						description: "Disassembles 32 lines from `addr`",
						fn: () => "",
					},
				});
				commandsInGroup.push({
					key: "`start`.`end`",
					aliases: [],
					cmd: {
						group: "Monitor",
						description: "Displays bytes from `start` to `end`",
						fn: () => "",
					},
				});
				commandsInGroup.push({
					key: "`start`.`end`L",
					aliases: [],
					cmd: {
						group: "Monitor",
						description: "Disassembles from `start` to `end`",
						fn: () => "",
					},
				});
				commandsInGroup.push({
					key: "`addr`:",
					aliases: [],
					cmd: {
						paramDef: ["byte|word|long|string"],
						group: "Monitor",
						description: "Write bytes / words / longs / strings(\":bit7=1 | ':bit7=0) at `addr`",
						fn: () => "",
					},
				});
			}
			commandsInGroup.sort((a, b) => a.key.localeCompare(b.key));
			const commandHelp = commandsInGroup
				.map(({ key, cmd, aliases }) => {
					const allNames = [key, ...aliases].sort().join(", ");
					const params = cmd.paramDef?.map((p) => `${p.replaceAll("|", "\\|")}`).join(" ") || "";
					const description = cmd.description?.replaceAll("|", "\\|").replace(/\n/g, "<br/>") || "";
					return `| ${allNames} | ${params} | ${description} |`;
				})
				.join("\n");
			output += commandHelp;
		}

		return { content: output, format: "markdown" };
	},
};

export type COMMANDS = keyof typeof COMMAND_LIST;

export const COMMAND_LIST = {
	IF: {
		description: "Conditional: IF <expression> [THEN] <command>",
		paramDef: ["expr"],
		fn: () => "",
		group: "Scripting",
	},
	DO: {
		group: "Scripting",
		description: "Execute a defined routine.",
		paramDef: ["string"],
		fn: () => "",
	},

	SET: setCmd,
	"A=": d("Monitor", "Set value to Accumulator"),
	"X=": d("Monitor", "Set value to X register"),
	"Y=": d("Monitor", "Set value to Y register"),
	"PC=": d("Monitor", "Set value to Program Counter"),
	"SP=": d("Monitor", "Set value to Stack Pointer"),

	GL: glCmd,

	RUN: run,
	G: "RUN",
	PAUSE: pause,
	STEP: stepCmd,
	S: "STEP",
	RESET: reset,
	REBOOT: reboot,

	SPEED: speed,
	D: { ...setDisasmView, group: "Viewers" },
	M: { ...setMemView, group: "Viewers" },
	CODE: { ...defCode, group: "Memory" },
	DB: {
		description: "define n bytes at `address` with n = `word`",
		paramDef: ["address", "word"],
		base: defData,
		staticParams: { prepend: ["byte"] },
		group: "Memory",
	},
	DW: {
		description: "define n words at `address` with n = `word`",
		paramDef: ["address", "word"],
		base: defData,
		staticParams: { prepend: ["word"] },
		group: "Memory",
	},
	DA: {
		description: "define a string/ascii at `address` with length `word`",
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
	LABELS: labelsCmd,
	M1: {
		description: "set MemViewer(1) `address`",
		paramDef: ["address"],
		base: setMemView,
		staticParams: { append: [1] },
		group: "Viewers",
	},
	M2: {
		description: "set MemViewer(2) `address`",
		paramDef: ["address"],
		base: setMemView,
		staticParams: { append: [2] },
		group: "Viewers",
	},
	M3: {
		description: "set MemViewer(3) `address`",
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
	ERR: {
		description: "Error History",
		fn: () => {
			const { errorHistory } = useCommands();
			const errList = errorHistory.value.join("\n");
			errorHistory.value = [];
			return errList;
		},
		group: "Console",
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
} satisfies Record<string, Command | CommandWrapper | string>;
