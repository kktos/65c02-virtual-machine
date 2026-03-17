import { useBreakpoints } from "@/composables/useBreakpoints";
import type { CommandContext } from "@/types/command";

export const execAddBP = (type: "pc" | "access" | "write" | "read") => {
	return async ({ vm, params }: CommandContext) => {
		const param = params[0];
		let addr: number;
		let endAddr: number | undefined;

		if (typeof param === "object" && param !== null && "start" in param) {
			addr = param.start;
			endAddr = param.end;
		} else if (typeof param === "number") {
			addr = param;
		} else {
			throw new Error("Invalid address parameter");
		}

		const { addBreakpoint } = useBreakpoints();
		addBreakpoint({ type, address: addr, endAddress: endAddr }, vm);

		const rangeStr = endAddr ? `-$${endAddr.toString(16).toUpperCase()}` : "";
		return `Breakpoint (${type}) added at $${addr.toString(16).toUpperCase()}${rangeStr}`;
	};
};
