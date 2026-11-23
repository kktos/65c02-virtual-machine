/**
 * Apple //e throughput, headless: `pnpm bench:cpu apple <disk.po> [seconds]`.
 * `pnpm bench:cpu apple <disk.po> cycles=<N>`: a checksum of the machine after N cycles, to compare two versions.
 * Boots the disk on the real AppleBus (cards, devices, soft switches, tick handlers) at max speed, then measures
 * the emulated MHz as the worker's run loop would get them, minus the video (rendered on its own frame callback).
 */
// Run by Node, whose types the app's tsconfig leaves out (they would change setTimeout's for the whole program)
declare const process: {
	argv: string[];
	exit(code: number): never;
	getBuiltinModule(id: "node:fs"): { readFileSync(path: string): Uint8Array };
};
import { apple2e } from "@/machines/apple2/apple.machine";
import { AppleBus } from "@/machines/apple2/apple.bus";
import { AppleKeyboard } from "@/machines/apple2/devices/keyboard.device";
import { AppleTimer } from "@/machines/apple2/devices/timer.device";
import { parseHexData } from "@/lib/array.utils";
import type { LoadedDevice } from "@/types/machine.interface";
import { initCPU, resetCPU, runCycles, setHypercalls } from "../cpu.65c02";
import { MEMORY_OFFSET, REG_PC_OFFSET, STACK_METADATA_OFFSET } from "../shared-memory";

(globalThis as unknown as { self: unknown }).self = { postMessage: () => {} };
const quiet = console.log;
console.log = () => {};

const [diskPath, secondsArg] = process.argv.slice(3);
if (!diskPath) throw new Error("usage: apple <disk.po> [seconds]");
const seconds = Number(secondsArg ?? 5);

const shared = new SharedArrayBuffer(MEMORY_OFFSET + apple2e.memory.size);
const registers = new DataView(shared, 0, MEMORY_OFFSET);
const memory = new Uint8Array(shared, MEMORY_OFFSET, apple2e.memory.size);
const bus = new AppleBus(memory);
const classes: Record<string, LoadedDevice["Class"]> = { AppleKeyboard, AppleTimer } as never;
bus.installDevices((apple2e.devices ?? []).map((config) => ({ config, Class: classes[config.class]! })));
bus.setRegistersView(registers);
for (const chunk of apple2e.memory.chunks ?? []) {
	const data = typeof chunk.data === "string" ? parseHexData(chunk.data) : (chunk.data as Uint8Array);
	bus.load(chunk.addr, data, chunk.bank, chunk.tag);
}
initCPU(bus, registers, null, memory, new Uint8Array(shared, STACK_METADATA_OFFSET, 256));
setHypercalls(!!apple2e.hypercalls);
bus.insertMedia(new Uint8Array(process.getBuiltinModule("node:fs").readFileSync(diskPath)), { name: diskPath });
bus.reset(true);
resetCPU();

// The worker's run loop, minus its timer: slices of cycles, the bus ticked after each instruction
const run = (ms: number) => {
	let cycles = 0;
	const end = performance.now() + ms;
	while (performance.now() < end) {
		cycles += runCycles(1_000_000);
		bus.syncState();
	}
	return cycles;
};

// `cycles=N`: runs exactly that many cycles (whole instructions) and prints a checksum of the machine instead:
// to check that a change to the CPU or the bus doesn't change what the machine does
const checkCycles = Number(secondsArg?.startsWith("cycles=") ? secondsArg.slice(7) : Number.NaN);
if (Number.isFinite(checkCycles)) {
	let cycles = 0;
	while (cycles < checkCycles) {
		cycles += runCycles(Math.min(1_000_000, checkCycles - cycles));
		bus.syncState();
	}
	let hash = 0x811c9dc5;
	const mix = (byte: number) => (hash = Math.imul(hash ^ byte, 0x01000193) >>> 0);
	memory.forEach(mix);
	for (let offset = 0; offset < 8; offset++) mix(registers.getUint8(offset));
	quiet(
		`Apple //e: ${cycles} cycles, checksum ${hash.toString(16).padStart(8, "0")}, PC $${registers.getUint16(REG_PC_OFFSET, true).toString(16)}`,
	);
	process.exit(0);
}

run(3000); // boot, and warm up the JIT
const t0 = performance.now();
const cycles = run(seconds * 1000);
const mhz = cycles / ((performance.now() - t0) / 1000) / 1e6;
const pc = registers.getUint16(REG_PC_OFFSET, true);
quiet(
	`Apple //e: ${mhz.toFixed(1)} MHz (PC $${pc.toString(16)}, ${bus.hires ? "hires" : "text"}${bus.page2 ? " page2" : ""})`,
);
