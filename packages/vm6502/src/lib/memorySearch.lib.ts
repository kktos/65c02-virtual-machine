// Memory search, cheat-finder style: snapshot some ranges, let the program run, then keep only the bytes
// that changed the way asked (changed, decreased by 1, equal to 3…); repeat until a few candidates remain.
// Pure: memory is read through `read`, so the candidates can live in the tab and be unit-tested.

export type MemoryRange = { start: number; end: number }; // inclusive

export type MemoryFilter =
	| { kind: "changed" }
	| { kind: "unchanged" }
	| { kind: "increased"; by?: number }
	| { kind: "decreased"; by?: number }
	| { kind: "equals"; value: number }
	| { kind: "not_equals"; value: number };

export type MemoryCandidate = { address: number; previous: number; value: number };

type Read = (address: number, length: number) => Uint8Array;

const rangeLength = (r: MemoryRange) => r.end - r.start + 1;

export class MemorySearch {
	readonly ranges: MemoryRange[];
	readonly size: number;
	/** Rounds of filtering since the snapshot. */
	rounds = 0;
	/** Offsets into the ranges laid end to end, ascending. */
	private offsets: Uint32Array;
	/** Each candidate's reference value: at the snapshot, then at the last filter. */
	private reference: Uint8Array;

	constructor(ranges: MemoryRange[], read: Read) {
		this.ranges = ranges.map((r) => ({ ...r }));
		this.size = this.ranges.reduce((n, r) => n + rangeLength(r), 0);
		this.reference = this.readAll(read);
		this.offsets = new Uint32Array(this.size);
		for (let i = 0; i < this.size; i++) this.offsets[i] = i;
	}

	get count() {
		return this.offsets.length;
	}

	/**
	 * Keeps the candidates whose value now matches `filter` against their reference; their value now becomes it.
	 * Returns the first `limit` kept, `previous` being the reference they were compared to.
	 */
	filter(filter: MemoryFilter, read: Read, limit: number): MemoryCandidate[] {
		const now = this.readAll(read);
		const keep = matcher(filter);
		const offsets = new Uint32Array(this.offsets.length);
		const reference = new Uint8Array(this.offsets.length);
		const list: MemoryCandidate[] = [];
		let kept = 0;
		for (let i = 0; i < this.offsets.length; i++) {
			const offset = this.offsets[i] as number;
			const previous = this.reference[i] as number;
			const value = now[offset] as number;
			if (!keep(previous, value)) continue;
			if (kept < limit) list.push({ address: this.addressOf(offset), previous, value });
			offsets[kept] = offset;
			reference[kept++] = value;
		}
		this.offsets = offsets.slice(0, kept);
		this.reference = reference.slice(0, kept);
		this.rounds++;
		return list;
	}

	/** The first `limit` candidates, with their reference (`previous`) and current value; nothing is filtered. */
	list(read: Read, limit: number): MemoryCandidate[] {
		const now = this.readAll(read);
		const n = Math.min(limit, this.offsets.length);
		const list: MemoryCandidate[] = [];
		for (let i = 0; i < n; i++) {
			const offset = this.offsets[i] as number;
			list.push({
				address: this.addressOf(offset),
				previous: this.reference[i] as number,
				value: now[offset] as number,
			});
		}
		return list;
	}

	/** One read per range: the ranges are a few big blocks, the candidates can be anywhere in them. */
	private readAll(read: Read) {
		const all = new Uint8Array(this.size);
		let at = 0;
		for (const r of this.ranges) {
			all.set(read(r.start, rangeLength(r)), at);
			at += rangeLength(r);
		}
		return all;
	}

	private addressOf(offset: number) {
		for (const r of this.ranges) {
			const length = rangeLength(r);
			if (offset < length) return r.start + offset;
			offset -= length;
		}
		throw new Error(`offset ${offset} out of the snapshot`);
	}
}

const matcher = (filter: MemoryFilter): ((before: number, now: number) => boolean) => {
	switch (filter.kind) {
		case "changed":
			return (before, now) => now !== before;
		case "unchanged":
			return (before, now) => now === before;
		case "increased": {
			const by = filter.by;
			// `by`: modulo 256, so a counter wrapping from $FF to $00 increased by 1
			return by === undefined ? (before, now) => now > before : (before, now) => ((now - before) & 0xff) === by;
		}
		case "decreased": {
			const by = filter.by;
			return by === undefined ? (before, now) => now < before : (before, now) => ((before - now) & 0xff) === by;
		}
		case "equals":
			return (_, now) => now === filter.value;
		case "not_equals":
			return (_, now) => now !== filter.value;
	}
};

/** Sorts the ranges and checks they don't overlap (a byte counted twice would be two candidates). */
export const normalizeRanges = (ranges: MemoryRange[]): MemoryRange[] => {
	const sorted = [...ranges].sort((a, b) => a.start - b.start);
	for (const r of sorted) if (r.end < r.start) throw new Error("ranges: end_address must not be before address");
	for (let i = 1; i < sorted.length; i++)
		if ((sorted[i] as MemoryRange).start <= (sorted[i - 1] as MemoryRange).end)
			throw new Error("ranges: must not overlap");
	return sorted;
};
