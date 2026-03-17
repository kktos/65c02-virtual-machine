import { useBreakpoints } from "@/composables/useBreakpoints";
import type { CommandContext } from "@/types/command";

export const execRemoveBP = (type: "pc" | "access" | "write" | "read") => {
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

		const { removeBreakpoint } = useBreakpoints();
		removeBreakpoint({ type, address: addr, endAddress: endAddr, enabled: true }, vm);

		return `Breakpoint (${type}) removed`;
	};
};
