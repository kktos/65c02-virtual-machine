import { useCmdConsole } from "@/composables/useCmdConsole";
import { execAddBP } from "./addBP.cmd";
import { bufCmd } from "./buf.cmd";
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
import { routineCmd } from "./routine.cmd";
import { explainCmd } from "./explainCode.cmd";
import type { Command, ParamDef } from "@/types/command";
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
import { writeCommand } from "./write.cmd";
import { virtualRegisterCmd } from "./virtualRegister.cmd";
import { cmdHelp } from "./help.cmd";
import { transformCmd } from "./tr.cmd";
import { sedCmd } from "./sed.cmd";
import { hexDumpCmd } from "./hexdump.cmd";

function d(g: string, d: string, p?: ParamDef[]) {
	return {
		description: d,
		group: g,
		paramDef: p,
		fn: () => "",
	};
}

export type COMMANDS = keyof typeof COMMAND_LIST;

export const COMMAND_LIST = {
	IF: d("Scripting", "Conditional: IF `expression` [THEN] `command`", ["expr"] as unknown as ParamDef[]),
	DO: d("Scripting", "Execute a defined routine.\ndo <\u200broutinename> [args...]\n&<\u200broutinename> [args...]", [
		"name",
		"rest?",
	]),
	"&": "DO",

	"`addr`": d("Monitor", "Displays byte at `addr`"),
	"`start`.`end`": d("Monitor", "Displays bytes from `start` to `end`"),
	"`addr`L": d("Monitor", "Disassembles 32 lines from `addr`"),
	"`start`.`end`L": d("Monitor", "Disassembles from `start` to `end`"),
	"`addr`:": d("Monitor", "Write at `addr` bytes / words / strings(\":bit7=1 | ':bit7=0)", ["byte|word|string"]),

	SET: setCmd,
	"A=": d("Monitor", "Set value to Accumulator"),
	"X=": d("Monitor", "Set value to X register"),
	"Y=": d("Monitor", "Set value to Y register"),
	"PC=": d("Monitor", "Set value to Program Counter"),
	"SP=": d("Monitor", "Set value to Stack Pointer"),

	GL: glCmd,
	VR: virtualRegisterCmd,

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
	STR: "DA",

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
		fn: () => {
			useCmdConsole().clearConsole();
			return "";
		},
		group: "Console",
	},

	WRITE: writeCommand,
	BUF: bufCmd,
	TR: transformCmd,
	SED: sedCmd,
	HD: hexDumpCmd,

	SHOW: showCmd,
	HIDE: hideCmd,
} satisfies Record<string, Command | string>;
