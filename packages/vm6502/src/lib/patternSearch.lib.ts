// Byte pattern search over a machine's memory, the `search` command's engine. The machine describes its memory as
// regions of one buffer (`SearchRegion`); this walks them over an address range (24-bit: bank << 16 | address).
// Pure: no bus, so a table and a buffer are enough to test it.

export type PatternMatch = { address: number; location: string };

export type SearchRegion = {
	/** The match's `location`. */
	name: string;
	/** The byte at 16-bit address `a` is `memory[base + a]`. */
	base: number;
	/** 16-bit, inclusive. */
	start: number;
	end: number;
	/**
	 * The banks it's in. Absent: not banked (ROM...), the same bytes in every bank, so a match is reported once, in
	 * the first bank of the range which has it.
	 */
	banks?: readonly number[];
};

/**
 * `pattern`: a byte, or null for any byte; the n-th null, if `candidates[n]` is given, only one of those bytes.
 * `is7Bit`: compare the low 7 bits only (Apple text, high bit set or not). A match lies entirely in one region.
 */
export function searchPattern(
	memory: Uint8Array,
	regions: readonly SearchRegion[],
	pattern: (number | null)[],
	startAddress: number,
	endAddress: number,
	is7Bit = false,
	candidates?: number[][],
): PatternMatch[] {
	const results: PatternMatch[] = [];
	const len = pattern.length;
	if (len === 0) return results;

	const mask = is7Bit ? 0x7f : 0xff;
	const expected = pattern.map((p) => (p === null ? null : p & mask));
	// The candidates of each wildcard, by its index in the pattern.
	let wildcard = 0;
	const allowedAt = pattern.map((p) => (p === null ? candidates?.[wildcard++] : undefined));

	const startBank = startAddress >> 16;
	const endBank = endAddress >> 16;
	// Unbanked regions: (region index << 16 | address) of the matches already reported.
	const seen = new Set<number>();

	for (let bank = startBank; bank <= endBank; bank++) {
		const from = bank === startBank ? startAddress & 0xffff : 0x0000;
		const to = bank === endBank ? endAddress & 0xffff : 0xffff;

		regions.forEach((region, index) => {
			const shared = !region.banks;
			if (region.banks && !region.banks.includes(bank)) return;
			// The 2nd bank of the range starts at $0000 and, not being the last one, ends at $FFFF: past it, an
			// unbanked region has nothing new.
			if (shared && bank > startBank + 1) return;

			const last = Math.min(to, region.end) - len + 1;
			for (let addr = Math.max(from, region.start); addr <= last; addr++) {
				if (!matchesAt(memory, region.base + addr, expected, allowedAt, mask)) continue;
				if (shared) {
					const key = (index << 16) | addr;
					if (seen.has(key)) continue;
					seen.add(key);
				}
				results.push({ address: (bank << 16) | addr, location: region.name });
			}
		});
	}
	return results;
}

function matchesAt(
	memory: Uint8Array,
	offset: number,
	expected: (number | null)[],
	allowedAt: (number[] | undefined)[],
	mask: number,
) {
	for (let i = 0; i < expected.length; i++) {
		const byte = memory[offset + i] & mask;
		const want = expected[i];
		if (want === null) {
			const allowed = allowedAt[i];
			if (allowed && !allowed.includes(byte)) return false;
		} else if (byte !== want) return false;
	}
	return true;
}
