import { useBreakpoints } from "@/composables/useBreakpoints";
import { isParamListItemRange } from "@/composables/useCommands";
import { formatAddress } from "@/lib/hex.utils";
import type { CommandContext } from "@/types/command";

export const execAddBP = (type: "pc" | "access" | "write" | "read") => {
	return async ({ vm, params }: CommandContext) => {
		const param = params[0];
		let addr: number;
		let endAddr: number | undefined;

		if (isParamListItemRange(param)) {
			addr = param.start;
			endAddr = param.end;
		} else if (typeof param === "number") {
			addr = param;
		} else {
			throw new Error("Invalid address parameter");
		}

		const { addBreakpoint } = useBreakpoints();
		addBreakpoint({ type, address: addr, endAddress: endAddr }, vm);

		const rangeStr = endAddr ? `-${formatAddress(endAddr)}` : "";
		return `Breakpoint (${type}) added at ${formatAddress(addr)}${rangeStr}`;
	};
};
