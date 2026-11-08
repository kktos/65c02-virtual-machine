/**
 * Hypercall command bytes: `BRK <cmd>` with one of these is a hypercall when the machine enables them
 * (`MachineConfig.hypercalls`). Kept apart from `hypercall.ts` so the CPU worker can import it.
 */
export const HYPERCALL_COMMANDS = new Set([0x01, 0x02, 0x03, 0x04]);
