/**
 * Why the CPU stopped running. Sent by the worker in the `isRunning: false` message, so it is known
 * as soon as the stop is (the `breakpointHit` / `break` messages come after it).
 * Addresses are physical: (bank << 16) | address.
 */
export type StopInfo =
	/** `pause` command / reset */
	| { reason: "pause" | "reset" }
	/** user breakpoint; for read/write/access breakpoints `address` is the memory address, PC is the instruction */
	| { reason: "breakpoint"; breakpointType: string; address: number }
	/** step over / step out finished */
	| { reason: "step"; address: number }
	/** BRK instruction, when "break on BRK" is on */
	| { reason: "brk"; address: number }
	/** BRK that is a hypercall (machine has `hypercalls` on): the main thread runs it and resumes */
	| { reason: "hypercall"; address: number }
	/** unimplemented opcode */
	| { reason: "error"; address: number; message: string };
