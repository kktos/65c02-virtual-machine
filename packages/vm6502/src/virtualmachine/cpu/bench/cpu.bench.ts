/**
 * CPU core throughput, headless: `pnpm bench:cpu` (bundled first, as the browser runs it).
 * Runs Klaus Dormann's 65C02 extended opcodes test in a loop (reloaded on its success trap) on a flat 64K bus,
 * registers and memory in SharedArrayBuffers as in the worker. Prints the emulated MHz.
 */
// Run by Node, whose types the app's tsconfig leaves out (they would change setTimeout's for the whole program)
declare const process: {
	argv: string[];
	getBuiltinModule(id: "node:fs"): { readFileSync(path: string): Uint8Array };
};
import { KlausTest_RAM } from "@/machines/klaus-test-suite/65C02_extended_opcodes_test";
import { Bus } from "@/machines/klaus-test-suite/klaus.bus";
import { executeInstruction, initCPU } from "../cpu.65c02";
import { REG_PC_OFFSET } from "../shared-memory";

(globalThis as unknown as { self: unknown }).self = { postMessage: () => {} };

const SUCCESS_TRAP = 0x24f1; // 65C02_extended_opcodes_test: `success: jmp *`
const START = 0x0400;
const image = Uint8Array.from(
	KlausTest_RAM.trim()
		.split(/\s+/)
		.map((b) => Number.parseInt(b, 16)),
);

const memory = new Uint8Array(new SharedArrayBuffer(0x10000));
const regs = new DataView(new SharedArrayBuffer(64));
const bus = new Bus(memory);
const reload = () => {
	memory.fill(0);
	memory.set(image, 0);
	memory.set([0x16, 0x27, 0x00, 0x04, 0x24, 0x27], 0xfffa);
};
reload();
initCPU(bus, regs, null, memory, new Uint8Array(new SharedArrayBuffer(256)));
regs.setUint16(REG_PC_OFFSET, START, true);

const run = (ms: number) => {
	let cycles = 0;
	let passes = 0;
	const end = performance.now() + ms;
	while (performance.now() < end) {
		for (let i = 0; i < 100_000; i++) {
			const c = executeInstruction();
			bus.tick(c);
			cycles += c;
		}
		const pc = regs.getUint16(REG_PC_OFFSET, true);
		if (pc >= SUCCESS_TRAP && pc <= SUCCESS_TRAP + 2) {
			passes++;
			reload();
			regs.setUint16(REG_PC_OFFSET, START, true);
		} else if (memory[pc] === 0x4c && (memory[pc + 1]! | (memory[pc + 2]! << 8)) === pc) {
			throw new Error(`Klaus test failed: trapped at $${pc.toString(16)}`);
		}
	}
	return { cycles, passes };
};

run(1000); // warm up the JIT
const seconds = Number(process.argv[2] ?? 5);
const t0 = performance.now();
const { cycles, passes } = run(seconds * 1000);
const mhz = cycles / ((performance.now() - t0) / 1000) / 1e6;
console.log(`CPU: ${mhz.toFixed(1)} MHz (${passes} Klaus passes)`);
if (!passes) throw new Error("the Klaus test never reached its success trap");
