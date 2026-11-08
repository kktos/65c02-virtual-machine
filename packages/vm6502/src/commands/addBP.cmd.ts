import { useBreakpoints } from "@/composables/useBreakpoints";
import { isParamListItemRange } from "@/composables/useCommands";
import { formatAddress } from "@/lib/hex.utils";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { CommandContext, ParamListItem } from "@/types/command";

type BreakpointType = Breakpoint["type"];

export const breakpointFromParam = (type: BreakpointType, param: ParamListItem): Breakpoint => {
	if (isParamListItemRange(param)) return { type, address: param.start, endAddress: param.end };
	if (typeof param === "number") return { type, address: param };
	throw new Error("Invalid address parameter");
};

export const describeBreakpoint = (bp: Breakpoint) => {
	const rangeStr = bp.endAddress !== undefined ? `-${formatAddress(bp.endAddress)}` : "";
	return `(${bp.type}) at ${formatAddress(bp.address)}${rangeStr}`;
};

export const execAddBP = (type: BreakpointType) => {
	return async ({ vm, params }: CommandContext) => {
		const bp = breakpointFromParam(type, params[0]);
		const { addBreakpoint, getBreakpoint } = useBreakpoints();

		const existing = getBreakpoint(bp);
		if (existing) return `Breakpoint ${describeBreakpoint(bp)} already set${existing.enabled ? "" : " (disabled)"}`;

		addBreakpoint(bp, vm);
		return `Breakpoint ${describeBreakpoint(bp)} added`;
	};
};
