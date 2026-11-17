import { type IMUSnapshot } from "../../chips/imu";
import { type KeyboardSnapshot } from "./apple.keyboard";

import { type TimerSnapshot } from "./apple.timer";

// What a save state keeps of the bus, besides memory (shared buffer), the cards and the keyboard queue. Not the live
// inputs (joystick buttons, paddle positions: read from the shared registers at each tick, the real keys down) nor
// the speaker.
export const SNAPSHOT_FIELDS = [
	"activeExpansionSlot",
	"lcBank2",
	"lcReadRam",
	"lcWriteRam",
	"lcPreWriteCount",
	"store80",
	"ramRdAux",
	"ramWrAux",
	"altZp",
	"auxMemBank",
	"intCxRom",
	"intC8Rom",
	"slotC3Rom",
	"col80",
	"altChar",
	"text",
	"mixed",
	"page2",
	"hires",
	"fakingVBL",
	"dblRes",
	"video7Register",
	"video7SeqState",
	"video7NextBit",
	"tbColor",
	"brdrColor",
	"lastKey",
	"keyStrobe",
	"kbd_pb0",
	"kbd_pb1",
	"totalCycles",
] as const;

export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

export type AppleBusSnapshot = {
	fields: Record<SnapshotField, number | boolean>;
	paddleTimers: [number, number, number, number];
	cards: unknown[];
	/** Absent from the states saved before the typed keys queue. */
	keyboard?: KeyboardSnapshot;
	/** Absent from the states saved before the IMU. */
	imu?: IMUSnapshot;
	/** Absent from the states saved before the timer. */
	timer?: TimerSnapshot;
};
