import type { IBus } from "@/types/bus.interface";

const HIGH_LEVEL = 0.25; // Lower volume to avoid clipping
const LOW_LEVEL = -0.25;
const CHUNK_SIZE = 512;
// The clock used when the machine runs at "Max" speed (no fixed rate): the main thread drops what it can't play.
const DEFAULT_CLOCK_HZ = 1_023_000;

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

	public tick(cycles: number) {
		this.accumulatedCycles += cycles;

		let samplesToGenerate = Math.floor(this.accumulatedCycles / this.cyclesPerSample);
		if (samplesToGenerate === 0) return;

		this.accumulatedCycles -= samplesToGenerate * this.cyclesPerSample;

		const value = this.speakerOn ? HIGH_LEVEL : LOW_LEVEL;
		const chunks: Float32Array[] = [];

		// First, see if we can just add to the existing buffer without sending anything
		if (this.bufferIndex + samplesToGenerate < CHUNK_SIZE) {
			this.sampleBuffer.fill(value, this.bufferIndex, this.bufferIndex + samplesToGenerate);
			this.bufferIndex += samplesToGenerate;
			return;
		}

		// --- Buffer will overflow, so we must send at least one chunk ---

		// 1. Fill the rest of the current buffer
		const spaceLeft = CHUNK_SIZE - this.bufferIndex;
		this.sampleBuffer.fill(value, this.bufferIndex, CHUNK_SIZE);
		chunks.push(this.sampleBuffer.slice());
		samplesToGenerate -= spaceLeft;

		// 2. Send any remaining full chunks
		while (samplesToGenerate >= CHUNK_SIZE) {
			// This is slightly inefficient as it re-allocates, but it's clean.
			// A constant-value chunk doesn't need copying.
			const newChunk = new Float32Array(CHUNK_SIZE).fill(value);
			chunks.push(newChunk);
			samplesToGenerate -= CHUNK_SIZE;
		}

		// 3. Place the final remaining samples at the start of the buffer for next time
		this.bufferIndex = samplesToGenerate;
		if (this.bufferIndex > 0) this.sampleBuffer.fill(value, 0, this.bufferIndex);

		for (let index = 0; index < chunks.length; index++) self.postMessage({ type: "audio", buffer: chunks[index] });
	}
}
