export const LC_MAIN_BANK2_OFFSET = 0x0000; // 4KB
export const LC_AUX_BANK2_OFFSET = 0x1000; // 4KB
export const LC_ROM_OFFSET = 0x2000; // 12KB
export const RAM_OFFSET = 0x5000; // 20KB reserved for Bank2 (4KB) + Bank2 (4KB) + ROM (12KB) at the beginning

// Apple II specific flags (packed into the MACHINE_STATE bytes)
// Byte at MACHINE_STATE_OFFSET1
export const APPLE_LC_BANK2_MASK = 0b0000_0001;
export const APPLE_LC_READRAM_MASK = 0b0000_0010;
export const APPLE_LC_WRITERAM_MASK = 0b0000_0100;
export const APPLE_STORE80_MASK = 0b0000_1000;
export const APPLE_RAMRD_AUX_MASK = 0b0001_0000;
export const APPLE_RAMWR_AUX_MASK = 0b0010_0000;
export const APPLE_ALTZP_MASK = 0b0100_0000;
export const APPLE_INTCXROM_MASK = 0b1000_0000;
// Byte at MACHINE_STATE_OFFSET2
export const APPLE_SLOTC3ROM_MASK = 0b0000_0001;
export const APPLE_80COL_MASK = 0b0000_0010;
export const APPLE_ALTCHAR_MASK = 0b0000_0100;
export const APPLE_TEXT_MASK = 0b0000_1000;
export const APPLE_MIXED_MASK = 0b0001_0000;
export const APPLE_PAGE2_MASK = 0b0010_0000;
export const APPLE_HIRES_MASK = 0b0100_0000;
export const APPLE_INTC8ROM_MASK = 0b1000_0000;
// Byte at MACHINE_STATE_OFFSET3
export const APPLE_DBLRES_MASK = 0b0000_0001;
export const APPLE_VIDEO7_REG_MASK = 0b0000_0110; // bits 1,2
export const APPLE_VIDEO7_REG_SHIFT = 1;
