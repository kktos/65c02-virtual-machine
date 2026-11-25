import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioSink } from "../audioSink.class";

/** Stands for the browser's AudioContext: keeps the sources started, at what time. */
class FakeAudioContext {
	state = "running";
	sampleRate = 22050;
	currentTime = 1;
	destination = {};
	static sources: { start: number; stopped: boolean }[] = [];
	createBuffer(_channels: number, length: number, rate: number) {
		return { duration: length / rate, copyToChannel() {} };
	}
	createBufferSource() {
		const record = { start: -1, stopped: false };
		FakeAudioContext.sources.push(record);
		return {
			buffer: null,
			onended: null,
			connect() {},
			start: (time: number) => (record.start = time),
			stop: () => (record.stopped = true),
		};
	}
	resume() {}
}

beforeEach(() => {
	FakeAudioContext.sources = [];
	vi.stubGlobal("AudioContext", FakeAudioContext);
});

afterEach(() => vi.unstubAllGlobals());

const chunk = () => new Float32Array(441); // 20 ms

describe("AudioSink", () => {
	it("plays the chunks one after the other, from a little ahead of now", async () => {
		const sink = new AudioSink();
		await sink.open();
		sink.queue(chunk());
		sink.queue(chunk());
		const [first, second] = FakeAudioContext.sources;
		expect(first.start).toBeCloseTo(1.03);
		expect(second.start).toBeCloseTo(1.05);
	});

	it("plays nothing before it is opened", () => {
		new AudioSink().queue(chunk());
		expect(FakeAudioContext.sources).toEqual([]);
	});

	it("closed: stops what it queued and plays nothing more", async () => {
		const sink = new AudioSink();
		await sink.open();
		sink.queue(chunk());
		sink.close();
		sink.queue(chunk());
		expect(FakeAudioContext.sources).toEqual([{ start: expect.any(Number), stopped: true }]);
	});

	it("each sink keeps its own schedule", async () => {
		const first = new AudioSink();
		await first.open();
		first.queue(chunk());
		first.queue(chunk());
		first.close();
		const second = new AudioSink();
		await second.open();
		second.queue(chunk());
		expect(FakeAudioContext.sources[2].start).toBeCloseTo(1.03);
	});
});
