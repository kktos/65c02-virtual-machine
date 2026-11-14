import type { IBus } from "@/types/bus.interface";

const HIGH_LEVEL = 0.25; // Lower volume to avoid clipping
const LOW_LEVEL = -0.25;
const CHUNK_SIZE = 512;
// The clock used when the machine runs at "Max" speed (no fixed rate): the main thread drops what it can't play.
const DEFAULT_CLOCK_HZ = 1_023_000;

/** A sound source the speaker mixes in: adds `count` samples, from `start`, to `out`. */
export interface AudioSource {
	render(out: Float32Array, start: number, count: number, sampleRate: number): void;
}

export class Speaker {
	private sampleRate = 22050;
	private clockHz = DEFAULT_CLOCK_HZ;
	private cyclesPerSample = DEFAULT_CLOCK_HZ / 22050;
	private speakerOn = false;
	private accumulatedCycles = 0;

	private boundTick = this.tick.bind(this);
	private isEnabled = false;

	private sampleBuffer = new Float32Array(CHUNK_SIZE);
	private bufferIndex = 0;

	private sources: AudioSource[] = [];

	constructor(private bus: IBus) {
		this.setEnabled(true);
	}

	public setEnabled(enabled: boolean) {
		if (this.isEnabled === enabled) return;
		this.isEnabled = enabled;

		if (enabled) this.bus.registerTickHandler(this.boundTick);
		else this.bus.unregisterTickHandler(this.boundTick);
	}

	public init(sampleRate: number) {
		this.sampleRate = sampleRate;
		this.updateCyclesPerSample();
		console.log(`Speaker: Initialized with SR ${sampleRate}Hz, ${this.cyclesPerSample.toFixed(2)} cycles/sample.`);
	}

	/**
	 * The CPU clock, in MHz (0: "Max", no fixed rate). The samples are produced at the pace of the emulated
	 * cycles: with the clock the CPU really runs at, one second of emulation is one second of sound. Otherwise
	 * (e.g. 1.023 MHz assumed at 2.8 MHz) the sound is produced faster than it plays and lags further and further.
	 */
	public setClockSpeed(mhz: number) {
		this.clockHz = mhz > 0 ? mhz * 1_000_000 : DEFAULT_CLOCK_HZ;
		this.updateCyclesPerSample();
	}

	private updateCyclesPerSample() {
		this.cyclesPerSample = this.clockHz / this.sampleRate;
	}

	public toggle() {
		this.speakerOn = !this.speakerOn;
	}

	/** A sound source mixed into the output (a sound card): it adds its samples to the speaker's. */
	public addSource(source: AudioSource) {
		this.sources.push(source);
	}

	public tick(cycles: number) {
		this.accumulatedCycles += cycles;

		let samplesToGenerate = Math.floor(this.accumulatedCycles / this.cyclesPerSample);
		if (samplesToGenerate === 0) return;

		this.accumulatedCycles -= samplesToGenerate * this.cyclesPerSample;

		const value = this.speakerOn ? HIGH_LEVEL : LOW_LEVEL;

		// Fills the buffer, sending each chunk as it's full
		while (samplesToGenerate > 0) {
			const count = Math.min(samplesToGenerate, CHUNK_SIZE - this.bufferIndex);
			this.sampleBuffer.fill(value, this.bufferIndex, this.bufferIndex + count);
			for (let index = 0; index < this.sources.length; index++)
				this.sources[index]!.render(this.sampleBuffer, this.bufferIndex, count, this.sampleRate);
			this.bufferIndex += count;
			samplesToGenerate -= count;

			if (this.bufferIndex === CHUNK_SIZE) {
				self.postMessage({ type: "audio", buffer: this.sampleBuffer.slice() });
				this.bufferIndex = 0;
			}
		}
	}
}
