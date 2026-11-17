/** A vectored dispatch not yet returned from: `sp` the SP after the 3 pushes, `saved` what the context's `enter` returned. */
export type InterruptFrame = { id: number; sp: number; saved: number };

/**
 * One IMU line (ID): its priority (0 highest) and its committed handler ($0000: none, the $FFFE/F fallback).
 * `requests` (the line's rising edges) and `dispatches` (the vectored IRQs taken) count since the reset.
 */
export type InterruptLineState = {
	id: number;
	prio: number;
	handler: number;
	bank: number;
	requests: number;
	dispatches: number;
};

/** The IMU as the debugger shows it (see IMU.md). The masks have one bit per ID. */
export type IMUState = {
	ctrl: number;
	enabled: boolean;
	autoEoi: boolean;
	mask: number;
	/** The lines requesting (`asserted`), mask ignored. */
	pending: number;
	inService: number;
	/** The lines that can interrupt now (vectoring enabled): pending, not masked, not blocked by an in-service ID. */
	eligible: number;
	/** CURRENT ($FF: none). */
	current: number;
	/** The CPU's IRQ line, as the IMU drives it. */
	irq: boolean;
	index: number;
	lines: InterruptLineState[];
	/** Innermost last. */
	frames: InterruptFrame[];
};

/** The machine's interrupts: its IMU, and what each ID is wired to (null: nothing). */
export type InterruptsState = IMUState & { sources: (string | null)[] };
