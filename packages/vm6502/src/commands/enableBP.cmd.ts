import { type BreakpointState, useBreakpoints } from "@/composables/useBreakpoints";
import { isParamListItemIdentifier, isParamListItemRange } from "@/composables/useCommands";
import { formatAddress } from "@/lib/hex.utils";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { CommandContext, ParamListItem } from "@/types/command";
import { describeBreakpoint } from "./addBP.cmd";

export const BP_TYPES: ReadonlySet<Breakpoint["type"]> = new Set(["pc", "read", "write", "access"]);

/** `$00:0300` or `$00:0400-$00:07FF` */
const describeTarget = (address: number, endAddress?: number) =>
	formatAddress(address) + (endAddress !== undefined ? `-${formatAddress(endAddress)}` : "");

const addressOf = (param: ParamListItem | undefined): { address: number; endAddress?: number } => {
	if (isParamListItemRange(param)) return { address: param.start, endAddress: param.end };
	if (typeof param === "number") return { address: param };
	if (isParamListItemIdentifier(param)) {
		if (typeof param.value === "number") return { address: param.value };
		throw new Error(`Unknown label '${param.text}'.`);
	}
	throw new Error("Missing address or range.");
};

/**
 * The breakpoints `BD` / `BE` act on:
 * - `all`: every one, but the temporary ones (a step, a JSR from the console: they remove themselves)
 * - `<type> <address|range>`: the one of that type, at exactly that address or range (as BC)
 * - `<address|range>`: the ones of any type at exactly that address or range
 */
const selectBreakpoints = (params: ParamListItem[]) => {
	const { breakpoints } = useBreakpoints();
	const [first, second] = params;

	const keyword = isParamListItemIdentifier(first) ? first.text.toLowerCase() : undefined;
	if (keyword === "all") {
		if (second !== undefined) throw new Error("Nothing expected after `all`.");
		return { where: "", list: breakpoints.value.filter((bp) => !bp.isTemporary) };
	}

	let type: Breakpoint["type"] | undefined;
	let target: ParamListItem | undefined = first;
	if (keyword && BP_TYPES.has(keyword as Breakpoint["type"])) {
		type = keyword as Breakpoint["type"];
		target = second;
	} else if (second !== undefined) throw new Error(`Unknown breakpoint type '${String(keyword ?? first)}'.`);

	const { address, endAddress } = addressOf(target);
	const list = breakpoints.value.filter(
		(bp) => bp.address === address && bp.endAddress === endAddress && (type === undefined || bp.type === type),
	);
	return { where: `${type ? ` (${type})` : ""} at ${describeTarget(address, endAddress)}`, list };
};

/** BD (`enabled` false) and BE (true). Like BC, finding nothing is not an error. */
export const execSetBPEnabled = (enabled: boolean) => {
	const verb = enabled ? "enabled" : "disabled";
	return ({ vm, params }: CommandContext) => {
		const { where, list } = selectBreakpoints(params);
		if (list.length === 0) return where ? `No breakpoint${where}` : "No breakpoints defined.";

		const { setBreakpointEnabled } = useBreakpoints();
		return list
			.map((bp: BreakpointState) => {
				const changed = setBreakpointEnabled(bp, enabled, vm);
				return `Breakpoint ${describeBreakpoint(bp)} ${changed ? verb : `already ${verb}`}`;
			})
			.join("\n");
	};
};
