// The run loop: slices paced by a timer at a set speed; at max speed, slices of a few ms back to back, yielding
// through a MessageChannel (no ~4 ms timer delay). One loop at a time.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Video } from "@/types/video.interface";
import { clearBreakpoints } from "../breakpoints";
import { initCPU, setClockSpeed, setRunning } from "../cpu.65c02";
import { REG_PC_OFFSET } from "../shared-memory";
import { createMockBus } from "./cpu-test-helpers";

/** The run loop's channel: what it posted (the slices' loop generations), and its handler to deliver them. */
const channel = {
	posted: [] as number[],
	deliver: (generation: number) =>
		(channel.port1.onmessage as (event: { data: number }) => void)({ data: generation }),
	port1: { onmessage: null as unknown },
};
class RecordingChannel {
	port1 = channel.port1;
	port2 = { postMessage: (generation: number) => channel.posted.push(generation) };
}

describe("run loop", () => {
	let clock: number;
	let setTimeoutSpy: ReturnType<typeof vi.fn>;
	let video: Video;
	let bus: ReturnType<typeof createMockBus>;

	beforeEach(() => {
		clock = 0;
		vi.stubGlobal("self", { postMessage: () => {} });
		// Each read moves the clock 1 ms on: a max speed slice ends after a few reads
		vi.stubGlobal("performance", { now: () => clock++ });
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn(() => 0),
		);
		setTimeoutSpy = vi.fn();
		vi.stubGlobal("setTimeout", setTimeoutSpy);
		vi.stubGlobal("MessageChannel", RecordingChannel);
		channel.posted.length = 0;

		const memory = new Uint8Array(0x10000);
		memory.set([0x4c, 0x00, 0x04], 0x400); // $400: JMP $400
		const registersView = new DataView(new ArrayBuffer(64));
		video = { tick: vi.fn(), reset: vi.fn() };
		bus = createMockBus(memory);
		initCPU(bus, registersView, video, memory, new Uint8Array(256));
		clearBreakpoints();
		setRunning(false);
		registersView.setUint16(REG_PC_OFFSET, 0x400, true);
	});

	it("at max speed, yields through the channel, not a timer", () => {
		setClockSpeed(0);
		setRunning(true);
		expect(channel.posted).toHaveLength(1);
		expect(setTimeoutSpy).not.toHaveBeenCalled();
		const executed = vi.mocked(bus.tick).mock.calls.length;
		expect(executed).toBeGreaterThan(0);

		channel.deliver(channel.posted[0]!); // the next slice
		expect(vi.mocked(bus.tick).mock.calls.length).toBeGreaterThan(executed);
		expect(channel.posted).toHaveLength(2);
	});

	it("at a set speed, the slices are paced by a timer", () => {
		setClockSpeed(1);
		setRunning(true);
		expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
		expect(channel.posted).toHaveLength(0);
	});

	it("running again drops the slices the previous run scheduled", () => {
		setClockSpeed(0);
		setRunning(true);
		const stale = channel.posted[0]!;
		setRunning(true); // e.g. a step over while it runs: a new loop
		expect(channel.posted).toHaveLength(2);

		const ticks = vi.mocked(bus.tick).mock.calls.length;
		channel.deliver(stale);
		expect(vi.mocked(bus.tick).mock.calls.length).toBe(ticks); // nothing ran
		expect(channel.posted).toHaveLength(2); // and nothing scheduled
	});

	it("stops scheduling slices once paused", () => {
		setClockSpeed(0);
		setRunning(true);
		setRunning(false);
		const ticks = vi.mocked(bus.tick).mock.calls.length;
		channel.deliver(channel.posted[0]!);
		expect(vi.mocked(bus.tick).mock.calls.length).toBe(ticks);
		expect(channel.posted).toHaveLength(1);
	});

	it("draws a frame itself when the frame callback hasn't for a while", () => {
		setClockSpeed(0);
		setRunning(true); // draws the first frame
		const frames = vi.mocked(video.tick).mock.calls.length;
		clock += 100; // the frame callback starved by the slices
		channel.deliver(channel.posted[0]!);
		expect(vi.mocked(video.tick).mock.calls.length).toBe(frames + 1);
	});
});
