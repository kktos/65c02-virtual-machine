// The //e's memory for the `search` command, as regions of the bus's buffer (see shared-memory.consts): main RAM
// is bank 0, aux RAM bank 1; the ROMs aren't banked.
import type { SearchRegion } from "@/lib/patternSearch.lib";
import { LC_AUX_BANK2_OFFSET, LC_MAIN_BANK2_OFFSET, LC_ROM_OFFSET, RAM_OFFSET } from "../shared-memory.consts";

const AUX = 0x10000;

export const APPLE_SEARCH_REGIONS: readonly SearchRegion[] = [
	{ name: "MAIN", base: RAM_OFFSET, start: 0x0000, end: 0xbfff, banks: [0] },
	{ name: "MAIN", base: RAM_OFFSET + AUX, start: 0x0000, end: 0xbfff, banks: [1] },

	// The internal $Cx ROM sits under main $C100-$CFFF, the slots' ROMs under aux's.
	{ name: "INT", base: RAM_OFFSET, start: 0xc100, end: 0xcfff },
	{ name: "SLOT", base: RAM_OFFSET + AUX, start: 0xc100, end: 0xcfff },
	{ name: "ROM", base: LC_ROM_OFFSET - 0xd000, start: 0xd000, end: 0xffff },

	// The language card: bank 1 ($D000-$DFFF) and $E000-$FFFF in the RAM's $D000-$FFFF, bank 2 apart.
	{ name: "BANK1", base: RAM_OFFSET, start: 0xd000, end: 0xffff, banks: [0] },
	{ name: "BANK1", base: RAM_OFFSET + AUX, start: 0xd000, end: 0xffff, banks: [1] },
	{ name: "BANK2", base: LC_MAIN_BANK2_OFFSET - 0xd000, start: 0xd000, end: 0xdfff, banks: [0] },
	{ name: "BANK2", base: LC_AUX_BANK2_OFFSET - 0xd000, start: 0xd000, end: 0xdfff, banks: [1] },
];
