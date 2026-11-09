import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import { useRunUntil } from "@/composables/useRunUntil";
import { formatAddress } from "@/lib/hex.utils";
import type { CommandContext, ParamListItem } from "@/types/command";
import { REG_PC_OFFSET } from "@/virtualmachine/cpu/shared-memory";

const keyword = (param: ParamListItem | undefined) =>
	isParamListItemIdentifier(param) ? param.text.toLowerCase() : undefined;

/** `[<start>] [until <target> [through]]`, as the params come: the keywords are names, the addresses numbers. */
const parseRunParams = (params: ParamListItem[]) => {
	const rest = [...params];
	const start = typeof rest[0] === "number" ? (rest.shift() as number) : undefined;
	if (rest.length === 0) return { start };

	if (keyword(rest[0]) !== "until") throw new Error("Expected `until <address>`.");
	rest.shift();
	const until = rest.shift();
	if (typeof until !== "number") throw new Error("Missing the address to run until.");
	const through = rest.length > 0;
	if (through && (keyword(rest[0]) !== "through" || rest.length > 1))
		throw new Error("Expected `through` or nothing after the address.");
	return { start, until, through };
};

export const run = defineCommand({
	description:
		"Run the vm, at PC or at <address>.\n" +
		"`until <target>`: stop when PC gets to <target> (a temporary breakpoint there). The other breakpoints still " +
		"stop it on the way; it then stays armed: RUN goes on to <target>.\n" +
		"`through`: the other breakpoints don't stop it, their hooks still run, until it stops for something else " +
		"(pause, BRK...).",
	paramDef: ["address?", "name?", "address?", "name?"],
	paramHelp: "[<address>] [until <target> [through]]",
	closeOnSuccess: true,
	group: "Execution",
	fn: ({ vm, params }: CommandContext) => {
		const { start, until, through } = parseRunParams(params);
		if (start !== undefined) vm.sharedRegisters.setUint16(REG_PC_OFFSET, start, true);
		if (until === undefined) {
			vm.play();
			return "Run the vm";
		}
		useRunUntil().startRunUntil(vm, until, { through });
		return `Run the vm until ${formatAddress(until)}${through ? ", through the breakpoints" : ""}`;
	},
});
