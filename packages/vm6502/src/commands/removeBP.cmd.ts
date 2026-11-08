import { useBreakpoints } from "@/composables/useBreakpoints";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { CommandContext } from "@/types/command";
import { breakpointFromParam, describeBreakpoint } from "./addBP.cmd";

export const execRemoveBP = (type: Breakpoint["type"]) => {
	return async ({ vm, params }: CommandContext) => {
		const bp = breakpointFromParam(type, params[0]);
		const { removeBreakpoint, getBreakpoint } = useBreakpoints();

		// Not an error: scripts commonly clear a breakpoint "just in case".
		if (!getBreakpoint(bp)) return `No breakpoint ${describeBreakpoint(bp)}`;

		removeBreakpoint(bp, vm);
		return `Breakpoint ${describeBreakpoint(bp)} removed`;
	};
};
