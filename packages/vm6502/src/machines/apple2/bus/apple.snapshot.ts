import { type IMUSnapshot } from "../../chips/imu";
import type { KeyboardSnapshot } from "../devices/keyboard.device";

// What a save state keeps of the bus, besides memory (shared buffer), the cards and the devices (the keyboard's
// included). Not the live inputs (joystick buttons, paddle positions: read from the shared registers at each tick)
// nor the speaker.
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
	"totalCycles",
] as const;

export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];
/** Only in the states saved before the keyboard device: its latch, strobe and Apple keys (now `devices.keyboard`). */
type OldKeyboardField = "lastKey" | "keyStrobe" | "kbd_pb0" | "kbd_pb1";

export type AppleBusSnapshot = {
	fields: Record<SnapshotField, number | boolean> & Partial<Record<OldKeyboardField, number | boolean>>;
	paddleTimers: [number, number, number, number];
	cards: unknown[];
	/** Only in the states saved before the keyboard device (absent before the typed keys queue): now `devices.keyboard`. */
	keyboard?: KeyboardSnapshot;
	/** Absent from the states saved before the IMU. */
	imu?: IMUSnapshot;
	/** Each device's state, by its id (absent from the states saved before the devices). */
	devices?: Record<string, unknown>;
	/** Only in the states saved before the devices: the timer's (now `devices.timer`). */
	timer?: unknown;
};
