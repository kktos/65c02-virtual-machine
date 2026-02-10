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

export const REG_SPEED_OFFSET = 24; // Offset in shared memory to store the computed speed. Uses 8 bytes (Float64).

// --- Machine State ---
// This section is for machine-specific state flags that need to be synced with the UI.
export const MACHINE_STATE_OFFSET1 = 32; // Start of machine state flags. Using 3 bytes for Apple II.
export const MACHINE_STATE_OFFSET2 = 33;
export const MACHINE_STATE_OFFSET3 = 34;
export const REG_TBCOLOR_OFFSET = 35; // Text/Background color (IIgs)
export const REG_BORDERCOLOR_OFFSET = 36; // Border color (IIgs)

// --- Input State ---
// A generic block for analog and digital inputs (e.g., joysticks, paddles, gamepads)
export const INPUT_STATE_OFFSET = 40;
export const MAX_ANALOG_INPUTS = 4;
export const MAX_DIGITAL_INPUTS = 16;

// Layout:
// INPUT_STATE_OFFSET+0:  analog 0 (Float32, -1.0 to 1.0)
// INPUT_STATE_OFFSET+4:  analog 1 (Float32, -1.0 to 1.0)
// INPUT_STATE_OFFSET+8:  analog 2 (Float32, -1.0 to 1.0)
// INPUT_STATE_OFFSET+12: analog 3 (Float32, -1.0 to 1.0)
export const INPUT_ANALOG_0_OFFSET = INPUT_STATE_OFFSET + 0;
export const INPUT_ANALOG_1_OFFSET = INPUT_STATE_OFFSET + 4;
export const INPUT_DIGITAL_OFFSET = INPUT_STATE_OFFSET + 16; // 2 bytes for buttons (16 bits)

// --- Stack Metadata ---
export const STACK_METADATA_OFFSET = 256; // 256 bytes for stack metadata

// --- Memory Section ---
// We'll leave some space for future expansion of the register/status section.
export const MEMORY_OFFSET = 512; // Main memory starts at byte 512 (256 regs + 256 stack meta)
