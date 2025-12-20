/**
 * Defines the layout of the SharedArrayBuffer used for communication
 * between the main thread (UI) and the CPU worker.
 */

// --- Register Offsets (in bytes) ---
// We will use DataView to handle mixed data types (8-bit and 16-bit).
export const REG_A_OFFSET = 0; // 8-bit Accumulator
export const REG_X_OFFSET = 1; // 8-bit X Register
export const REG_Y_OFFSET = 2; // 8-bit Y Register
export const REG_SP_OFFSET = 3; // 8-bit Stack Pointer

// Status flags are packed into a single byte. Each bit represents a flag.
export const REG_STATUS_OFFSET = 4; // 8-bit Status Register (P)
export const FLAG_N_MASK = 0b1000_0000; // Negative
export const FLAG_V_MASK = 0b0100_0000; // Overflow
export const FLAG_5_MASK = 0b0010_0000; // Break
export const FLAG_B_MASK = 0b0001_0000; // Break

export const FLAG_D_MASK = 0b0000_1000; // Decimal
export const FLAG_I_MASK = 0b0000_0100; // Interrupt Disable
export const FLAG_Z_MASK = 0b0000_0010; // Zero
export const FLAG_C_MASK = 0b0000_0001; // Carry

export const REG_PC_OFFSET = 6; // 16-bit Program Counter (using 2 bytes)

export const REG_SPEED_OFFSET = 24; // Offset in shared memory to store the computed speed

// --- Memory Section ---
// We'll leave some space for future expansion of the register/status section.
export const MEMORY_OFFSET = 256; // Main memory starts at byte 256
export const MEMORY_SIZE = 0x10000; // 64KB for the 6502 memory

// --- Total Buffer Size ---
export const TOTAL_SHARED_BUFFER_SIZE = MEMORY_OFFSET + MEMORY_SIZE;
