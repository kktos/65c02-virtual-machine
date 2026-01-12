const HIGH_LEVEL = 0.25; // Lower volume to avoid clipping
const LOW_LEVEL = -0.25;
const CHUNK_SIZE = 512;

export class Speaker {
	private sampleRate = 44100;
	private cyclesPerSample = 23; // ~1.023MHz / 44100
	private speakerOn = false;
	private accumulatedCycles = 0;

	private sampleBuffer = new Float32Array(CHUNK_SIZE);
	private bufferIndex = 0;

	public init(sampleRate: number) {
		this.sampleRate = sampleRate;
		this.cyclesPerSample = 1023000 / sampleRate;
		console.log(`Speaker: Initialized with SR ${sampleRate}Hz, ${this.cyclesPerSample.toFixed(2)} cycles/sample.`);
	}

	public toggle() {
		this.speakerOn = !this.speakerOn;
	}

	public tick(cycles: number): Float32Array | null {
		this.accumulatedCycles += cycles;

		let samplesToGenerate = Math.floor(this.accumulatedCycles / this.cyclesPerSample);

		if (samplesToGenerate === 0) {
			return null;
		}

		this.accumulatedCycles -= samplesToGenerate * this.cyclesPerSample;

		const value = this.speakerOn ? HIGH_LEVEL : LOW_LEVEL;

		if (this.bufferIndex + samplesToGenerate < CHUNK_SIZE) {
			this.sampleBuffer.fill(value, this.bufferIndex, this.bufferIndex + samplesToGenerate);
			this.bufferIndex += samplesToGenerate;
			return null;
		}

		const spaceLeft = CHUNK_SIZE - this.bufferIndex;
		this.sampleBuffer.fill(value, this.bufferIndex, CHUNK_SIZE);
		samplesToGenerate -= spaceLeft;

		const chunkToSend = this.sampleBuffer.slice();

		const remainingChunks = Math.floor(samplesToGenerate / CHUNK_SIZE);
		this.bufferIndex = samplesToGenerate % CHUNK_SIZE;
		this.sampleBuffer.fill(value, 0, this.bufferIndex);

		if (remainingChunks > 0) {
			console.warn(`Speaker: generating ${remainingChunks} full chunks at once. Audio may be choppy.`);
		}

		return chunkToSend;
	}
}
