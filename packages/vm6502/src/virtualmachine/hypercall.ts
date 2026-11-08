import { useLogWindows } from "@/composables/useLogWindows";
import { useMemoryMap } from "@/composables/useMemoryMap";
import {
	formatRegs,
	HC_ADD_REGION,
	HC_LOG_REGS,
	HC_LOG_STRING,
	HC_REMOVE_REGIONS,
	type Hypercall,
} from "@/lib/hypercalls.lib";
import { logBus } from "./logbus.class";

/**
 * Second half of a hypercall, on the main thread: apply its effect. The CPU worker already decoded it
 * (reading memory at the time of the call), moved PC past it and, if asked, stopped.
 */
export function applyHypercall(call: Hypercall) {
	switch (call.cmd) {
		case HC_LOG_STRING:
			logBus.emit("hyper", call.message);
			break;
		case HC_LOG_REGS:
			if (call.regs) logBus.emit("hyper", formatRegs(call.regs));
			break;
		case HC_ADD_REGION:
			useMemoryMap().addRegion({ ...call.region, removable: true });
			break;
		case HC_REMOVE_REGIONS: {
			const { removeRegions } = useMemoryMap();
			for (const name of call.names) removeRegions(name);
			break;
		}
	}
}

/** Hypercall log lines (LOG_STRING / LOG_REGS) are shown in the "hyper" log window. Call once. */
export const routeHypercallLogs = () => logBus.on("hyper", (text) => useLogWindows().trace("hyper", text));
