import type { IBus } from "@/types/bus.interface";
import type { DeviceConfig, LoadedDevice } from "@/types/machine.interface";

// Vite-specific way to handle dynamic imports (main thread and worker alike).
const deviceModules = import.meta.glob("../../../machines/**/*.device.ts");
const BASE_PATH = "../../../machines";

/** Loads the classes of the machine's devices. One that doesn't load is logged and left out. */
export async function loadDevices(configs: DeviceConfig[] = []): Promise<LoadedDevice[]> {
	const loaded = await Promise.all(
		configs.map(async (config): Promise<LoadedDevice | null> => {
			const key = `${BASE_PATH}/${config.path}.ts`;
			const loader = deviceModules[key];
			if (!loader) {
				console.error(`Device "${config.id}": could not find a device module loader for key: ${key}`);
				return null;
			}
			const Class = ((await loader()) as Record<string, unknown>)[config.class];
			if (typeof Class !== "function") {
				console.error(`Device "${config.id}": could not find class ${config.class} in module ${key}`);
				return null;
			}
			return { config, Class: Class as LoadedDevice["Class"] };
		}),
	);
	return loaded.filter((device) => device !== null);
}

/** Loads the machine's devices and has the bus install them. */
export async function installDevices(bus: IBus, configs: DeviceConfig[] = []) {
	if (!configs.length) return;
	if (!bus.installDevices) {
		console.error("This bus can't install devices: ignoring them.");
		return;
	}
	bus.installDevices(await loadDevices(configs));
}
