import { useBreakpoints } from "@/composables/useBreakpoints";
import { formatAddress } from "@/lib/hex.utils";
import { useRoutines } from "@/composables/useRoutines";
import type { CommandContext, ParamListItemIdentifier, ParamListItemRange } from "@/types/command";
import type { Breakpoint } from "@/types/breakpoint.interface";
import { defineCommand, isParamListItemIdentifier, isParamListItemRange, useCommands } from "@/composables/useCommands";
import { listBuffers } from "./buf.cmd";

function listHooks() {
	const { breakpoints } = useBreakpoints();
	const hooks = breakpoints.value.filter((bp) => !!bp.command);

	if (hooks.length === 0) return "No hooks defined.";

	const header = "| Type | Address | State | Command |\n|---|---|---|---|";
	const rows = hooks.map((bp) => {
		const type = bp.type.toUpperCase();
		const addr = formatAddress(bp.address);
		const state = bp.enabled ? "on" : "off";
		const command = bp.command;
		return `| ${type} | ${addr} | ${state} | ${command} |`;
	});

	return `${header}\n${rows.join("\n")}`;
}

const formatBreakpointRange = (bp: Breakpoint) =>
	bp.endAddress !== undefined ? `${formatAddress(bp.address)}-${formatAddress(bp.endAddress)}` : formatAddress(bp.address);

/** `filter` keeps the breakpoints covering an address, or overlapping a range. Labels resolve to their address. */
function listBreakpoints(filter?: number | ParamListItemIdentifier | ParamListItemRange) {
	const { breakpoints } = useBreakpoints();
	let list = breakpoints.value;
	let where = "";

	if (filter !== undefined) {
		let lo: number;
		let hi: number;
		if (isParamListItemRange(filter)) {
			lo = filter.start;
			hi = filter.end;
			where = ` in ${formatAddress(lo)}-${formatAddress(hi)}`;
		} else {
			const addr = isParamListItemIdentifier(filter) ? filter.value : filter;
			if (typeof addr !== "number") throw new Error(`Unknown label '${(filter as ParamListItemIdentifier).text}'.`);
			lo = hi = addr;
			where = ` at ${formatAddress(addr)}`;
		}
		list = list.filter((bp) => bp.address <= hi && (bp.endAddress ?? bp.address) >= lo);
	}

	if (list.length === 0) return filter === undefined ? "No breakpoints defined." : `No breakpoint${where}.`;

	const header = "| Type | Address | State | Command |\n|---|---|---|---|";
	const rows = list.map((bp) => {
		const state = (bp.enabled ? "on" : "off") + (bp.isTemporary ? " (temp)" : "");
		return `| ${bp.type.toUpperCase()} | ${formatBreakpointRange(bp)} | ${state} | ${bp.command ?? ""} |`;
	});

	return `${header}\n${rows.join("\n")}`;
}

function listRoutines(name?: ParamListItemIdentifier) {
	const { getRoutineNames, getRoutine } = useRoutines();
	const routineNames = getRoutineNames();
	if (routineNames.length === 0) return "No routines defined.";
	if (name) {
		if (!routineNames.includes(name.text)) throw new Error(`Routine '${name.text}' not found.`);
		const r = getRoutine(name.text);
		const args = r?.args.length ? ` ${r.args.map((arg) => `@${arg}`).join(" ")}` : "";
		// One paragraph, a hard break ("  \n") per line: no blank line between them.
		// The leading nbsp keep markdown from reading a line as a heading, a list item...
		const body = r?.lines.map((line) => `\u00A0\u00A0${line}`) ?? [];
		return [`routine ${name.text}${args}`, ...body, "end"].join("  \n");
	}
	return routineNames
		.map((name) => {
			const r = getRoutine(name);
			const args = r?.args.length ? ` ${r.args.map((arg) => `@${arg}`).join(" ")}` : "";
			return `* \`${name}${args}\``;
		})
		.join("\n");
}

function listHistory() {
	const { commandHistory } = useCommands();
	if (commandHistory.value.length === 0) return "Command history is empty.";
	const shortenString = (s: string) => {
		s = s.replace("\n", " ");
		if (s.length > 15) return s.slice(0, 15) + "...";
		return s;
	};
	const historyList = commandHistory.value
		.map((cmd, index) => `${(index + 1).toString().padStart(3, "\u00A0")}: ${shortenString(cmd)}`)
		.join("  \n");
	return `${historyList}\n`;
}

// BUFFERS stays before BREAKPOINTS so that `LIST B` keeps meaning buffers.
const LISTS = ["HOOKS", "ROUTINES", "HISTORY", "BUFFERS", "BREAKPOINTS"];
const LIST_ALIASES: Record<string, string> = { BP: "BREAKPOINTS", BPS: "BREAKPOINTS" };

export const listCmd = defineCommand({
	description:
		"List <hooks|routines|history|buffers|breakpoints>. `list bp [address|range]` shows the breakpoints covering that address or range.",
	paramDef: ["name", "name?|range|address"],
	paramHelp: "hooks|routines [name]|history|buffers|breakpoints [address|range]",
	group: "Console",
	fn: ({ params }: CommandContext) => {
		const cmd = params[0] as ParamListItemIdentifier;
		let content: string;
		const name = cmd.text.toUpperCase();
		const list = LIST_ALIASES[name] ?? LISTS.find((l) => l.match(name));
		switch (list) {
			case "HOOKS":
				content = listHooks();
				break;
			case "ROUTINES": {
				const routine = params.length > 1 ? params[1] : undefined;
				if (routine !== undefined && !isParamListItemIdentifier(routine)) throw new Error("Expected a routine name.");
				content = listRoutines(routine);
				break;
			}
			case "HISTORY":
				content = listHistory();
				break;
			case "BUFFERS":
				content = listBuffers().content;
				break;
			case "BREAKPOINTS":
				content = listBreakpoints(params[1] as number | ParamListItemIdentifier | ParamListItemRange | undefined);
				break;
			default:
				throw new Error("Invalid list name");
		}

		return {
			content,
			format: "markdown",
		};
	},
});
