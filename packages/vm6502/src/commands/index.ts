import { useCmdConsole } from "@/composables/useCmdConsole";
import { execAddBP } from "./addBP.cmd";
import { defCode } from "./defCode.cmd";
import { defLabel } from "./defLabel.cmd";
import { font } from "./font.cmd";
import { hideCmd } from "./hide.cmd";
import { hook } from "./hook.cmd";
import { labelsCmd } from "./labels.cmd";
import { listCmd } from "./list.cmd";
import { logCmd } from "./log.cmd";
import { pause } from "./pause.cmd";
import { reboot } from "./reboot.cmd";
import { execRemoveBP } from "./removeBP.cmd";
import { renLabel } from "./renLabel.cmd";
import { reset } from "./reset.cmd";
import { run } from "./run.cmd";
import { showCmd } from "./show.cmd";
import { setDisasmView } from "./setDisasmView.cmd";
import { setMemView, setMemViewFn } from "./setMemView.cmd";
import { speed } from "./speed.cmd";
import { undefLabel } from "./undefLabel.cmd";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { routineCmd } from "./routine.cmd";
import { explainCmd } from "./explainCode.cmd";
import type { Command, CommandResult, ParamDef, ParamList } from "@/types/command";
import { useCommands } from "@/composables/useCommands";
import { stepCmd } from "./step.cmd";
import { glCmd } from "./gl.cmd";
import { setCmd } from "./set.cmd";
import { findLabelCmd } from "./findLabel.cmd";
import { scopePathCmd } from "./scopePath.cmd";
import { defDataFn } from "./defData.cmd";
import { printCmdFn } from "./print.cmd";
import { asmCmd } from "./asm.cmd";
import { searchCmd } from "./search.cmd";

export function typedKeys<T extends object>(obj: T): (keyof T)[] {
	return Object.keys(obj) as (keyof T)[];
}

function d(g: string, d: string, p?: ParamDef[]) {
	return {
		description: d,
		group: g,
		paramDef: p,
		fn: () => "",
	};
}

const cmdHelp: Command = {
	description: "Lists all available commands. Can be filtered by group name (e.g., HELP cons).",
	paramDef: ["name?"],
	group: "Console",
	fn: (_vm: VirtualMachine, _progress, _params: ParamList): CommandResult => {
		const groupFilter = (_params[0] as string | undefined)?.toUpperCase();
		const groups: Record<string, { key: string; cmd: Command; aliases: string[] }[]> = {};
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
				const cmd = COMMAND_LIST[key];
				// Skip aliases, they will be handled with their main command.
				if (typeof cmd === "string") return;

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
						paramDef: ["byte|word|string"],
						group: "Monitor",
						description: "Write bytes / words / strings(\":bit7=1 | ':bit7=0) at `addr`",
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
	IF: d("Scripting", "Conditional: IF `expression` [THEN] `command`", ["expr"] as unknown as ParamDef[]),
	DO: d("Scripting", "Execute a defined routine.", ["name"]),

	SET: setCmd,
	"A=": d("Monitor", "Set value to Accumulator"),
	"X=": d("Monitor", "Set value to X register"),
	"Y=": d("Monitor", "Set value to Y register"),
	"PC=": d("Monitor", "Set value to Program Counter"),
	"SP=": d("Monitor", "Set value to Stack Pointer"),

	GL: glCmd,

	RUN: run,
	PAUSE: pause,
	STEP: stepCmd,
	S: "STEP",
	RESET: reset,
	REBOOT: reboot,
	SPEED: speed,

	ASM: asmCmd,
	SEARCH: searchCmd,
	D: setDisasmView,

	CODE: defCode,
	DB: {
		description: "define n bytes at `address` with n = `word`",
		paramDef: ["address", "word"],
		fn: defDataFn,
		staticParams: { prepend: ["byte"] },
		group: "Memory",
	},
	DW: {
		description: "define n words at `address` with n = `word`",
		paramDef: ["address", "word"],
		fn: defDataFn,
		staticParams: { prepend: ["word"] },
		group: "Memory",
	},
	DA: {
		description: "define a string/ascii at `address` with length `word`",
		paramDef: ["address", "word"],
		fn: defDataFn,
		staticParams: { prepend: ["string"] },
		group: "Memory",
	},

	DEF: defLabel,
	UNDEF: undefLabel,
	REN: renLabel,
	FIND: findLabelCmd,
	HOOK: hook,
	LABELS: labelsCmd,
	SCOPEPATH: scopePathCmd,

	M: setMemView,
	M1: {
		description: "set MemViewer(1) `address`",
		paramDef: ["address"],
		fn: setMemViewFn,
		staticParams: { append: [1] },
		group: "Viewers",
	},
	M2: {
		description: "set MemViewer(2) `address`",
		paramDef: ["address"],
		fn: setMemViewFn,
		staticParams: { append: [2] },
		group: "Viewers",
	},
	M3: {
		description: "set MemViewer(3) `address`",
		paramDef: ["address"],
		fn: setMemViewFn,
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
	LOG: logCmd,
	ROUTINE: routineCmd,

	FONT: font,
	HELP: cmdHelp,
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
	PRINT: {
		description:
			"Prints evaluated expressions to the console. Args can be strings, numbers, or expressions (e.g. A, X+1, mem[PC]).",
		paramDef: ["rest?"],
		fn: printCmdFn,
		staticParams: { prepend: ["text"] },
		group: "Console",
	},
	PRINTMD: {
		description:
			"Prints evaluated expressions to the console. Args can be strings, numbers, or expressions (e.g. A, X+1, mem[PC]).",
		paramDef: ["rest?"],
		fn: printCmdFn,
		staticParams: { prepend: ["markdown"] },
		group: "Console",
	},
	CLS: {
		description: "Clear console",
		fn: (_vm, _progress, _params: ParamList) => {
			useCmdConsole().clearConsole();
			return "";
		},
		group: "Console",
	},

	SHOW: showCmd,
	HIDE: hideCmd,
} satisfies Record<string, Command | string>;
