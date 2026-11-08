// The last executed instructions, with the registers before each one: "how did I get here".
// Off by default; when on, the CPU records one entry per instruction (2 words, no allocation).

export const INSTRUCTION_TRACE_DEFAULT_SIZE = 4096;
export const INSTRUCTION_TRACE_MAX_SIZE = 65536;

/** One executed instruction: where (physical address) and the registers before it. */
export type TraceEntry = { address: number; a: number; x: number; y: number; p: number; sp: number };

/** What `read` returns: entries packed 2 words each (see `unpackTraceEntries`), oldest first. */
export type TraceSnapshot = {
	enabled: boolean;
	capacity: number;
	/** Instructions recorded since it was enabled or cleared (more than `capacity`: the oldest are gone). */
	total: number;
	words: Uint32Array;
};

// word 0: address (24 bits: bank << 16 | pc) | SP << 24; word 1: A | X << 8 | Y << 16 | P << 24.
let ring = new Uint32Array(0);
let mask = 0;
let head = 0;
let total = 0;
export let instructionTraceOn = false;

/** Power of two, so the ring index is a mask. */
const toCapacity = (size: number) => {
	const n = Math.min(Math.max(Math.trunc(size) || 0, 1), INSTRUCTION_TRACE_MAX_SIZE);
	return 2 ** Math.ceil(Math.log2(n));
};

/** Starts recording (cleared); `size` is rounded up to a power of two. Off: stops, keeps what was recorded. */
export function setInstructionTrace(enabled: boolean, size = INSTRUCTION_TRACE_DEFAULT_SIZE) {
	if (enabled) {
		const capacity = toCapacity(size);
		if (capacity * 2 !== ring.length) {
			ring = new Uint32Array(capacity * 2);
			mask = capacity - 1;
		}
		head = 0;
		total = 0;
	}
	instructionTraceOn = enabled;
}

export function clearInstructionTrace() {
	head = 0;
	total = 0;
}

/** Called by the CPU before executing the instruction at `address` (check `instructionTraceOn` first). */
export function recordInstruction(address: number, a: number, x: number, y: number, p: number, sp: number) {
	const i = head << 1;
	ring[i] = (address & 0xffffff) | (sp << 24);
	ring[i + 1] = a | (x << 8) | (y << 16) | (p << 24);
	head = (head + 1) & mask;
	total++;
}

/** The last `count` entries (all if omitted), oldest first. */
export function readInstructionTrace(count?: number): TraceSnapshot {
	const capacity = ring.length >> 1;
	const available = Math.min(total, capacity);
	const n = Math.min(count ?? available, available);
	const words = new Uint32Array(n * 2);
	for (let k = 0; k < n; k++) {
		const i = ((head - n + k) & mask) << 1;
		words[k * 2] = ring[i] as number;
		words[k * 2 + 1] = ring[i + 1] as number;
	}
	return { enabled: instructionTraceOn, capacity, total, words };
}

export function unpackTraceEntries(words: Uint32Array): TraceEntry[] {
	const entries: TraceEntry[] = [];
	for (let i = 0; i + 1 < words.length; i += 2) {
		const w0 = words[i] as number;
		const w1 = words[i + 1] as number;
		entries.push({
			address: w0 & 0xffffff,
			sp: w0 >>> 24,
			a: w1 & 0xff,
			x: (w1 >>> 8) & 0xff,
			y: (w1 >>> 16) & 0xff,
			p: w1 >>> 24,
		});
	}
	return entries;
}
