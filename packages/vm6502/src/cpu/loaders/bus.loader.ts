import type { MachineConfig } from "@/machines/machine.interface";
import type { IBus } from "../bus.interface";

// Vite-specific way to handle dynamic imports in workers.
const busModules = import.meta.glob("../../machines/*/*.bus.ts");
const BASE_PATH = "../../machines";

export async function loadBus(busConfig: MachineConfig["bus"], memoryView: Uint8Array) {
	const busModuleKey = `${BASE_PATH}/${busConfig.path}.ts`;
	const busModuleLoader = busModules[busModuleKey];
	if (!busModuleLoader) {
		console.error(`Worker: Could not find a bus module loader for key: ${busModuleKey}`);
		return null;
	}
	const BusModule = await busModuleLoader();
	const exportedBusEntry = Object.entries(BusModule as object).find(([name]) => name === busConfig.class);
	if (!exportedBusEntry) {
		console.error(`Worker: Could not find class ${busConfig.class} for module ${busModuleKey}`);
		return null;
	}
	const [, BusClass]: [string, new (mem: Uint8Array) => IBus] = exportedBusEntry;
	return new BusClass(memoryView);
}
