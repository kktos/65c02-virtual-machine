// Speaker: one second of emulated cycles makes one second of sound, whatever the clock speed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IBus } from "@/types/bus.interface";
import { Speaker } from "../speaker";

const SAMPLE_RATE = 22050;

describe("Speaker", () => {
	let samples: number;
	let speaker: Speaker;

	beforeEach(() => {
		samples = 0;
		vi.stubGlobal("self", {
			postMessage: (msg: { type: string; buffer: Float32Array }) => {
				if (msg.type === "audio") samples += msg.buffer.length;
			},
		});
		const bus = { registerTickHandler: () => {}, unregisterTickHandler: () => {} } as unknown as IBus;
		speaker = new Speaker(bus);
		speaker.init(SAMPLE_RATE);
	});

	// Ticks one second of a `mhz` clock, by instructions of 4 cycles
	const runOneSecond = (mhz: number) => {
		const cycles = mhz * 1_000_000;
		for (let done = 0; done < cycles; done += 4) speaker.tick(4);
	};

	it.each([1.02, 2.8, 8])("produces one second of samples per second of emulation at %s MHz", (mhz) => {
		speaker.setClockSpeed(mhz);
		runOneSecond(mhz);
		// Sent by chunks of 512: at most one chunk still pending
		expect(samples).toBeGreaterThan(SAMPLE_RATE - 512);
		expect(samples).toBeLessThanOrEqual(SAMPLE_RATE);
	});

	it("renders the toggles as a square wave", () => {
		const chunks: Float32Array[] = [];
		vi.stubGlobal("self", { postMessage: (msg: { buffer: Float32Array }) => chunks.push(msg.buffer) });
		speaker.setClockSpeed(1.023);
		// 1 kHz tone: a toggle every 511.5 cycles, ~11 samples per half period at 22050 Hz
		for (let index = 0; index < 100; index++) {
			for (let cycles = 0; cycles < 511; cycles += 7) speaker.tick(7);
			speaker.toggle();
		}
		const wave = chunks[0]!;
		const transitions = wave.reduce((count, value, index) => count + (index > 0 && value !== wave[index - 1] ? 1 : 0), 0);
		// 512 samples = ~23 ms of a 1 kHz tone: ~46 half periods
		expect(transitions).toBeGreaterThanOrEqual(44);
		expect(transitions).toBeLessThanOrEqual(48);
	});
});
