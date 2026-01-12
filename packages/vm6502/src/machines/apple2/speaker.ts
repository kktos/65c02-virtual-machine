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

	public tick(cycles: number): Float32Array[] {
		this.accumulatedCycles += cycles;

		let samplesToGenerate = Math.floor(this.accumulatedCycles / this.cyclesPerSample);
		if (samplesToGenerate === 0) {
			return [];
		}

		this.accumulatedCycles -= samplesToGenerate * this.cyclesPerSample;

		const value = this.speakerOn ? HIGH_LEVEL : LOW_LEVEL;
		const chunks: Float32Array[] = [];

		// First, see if we can just add to the existing buffer without sending anything
		if (this.bufferIndex + samplesToGenerate < CHUNK_SIZE) {
			this.sampleBuffer.fill(value, this.bufferIndex, this.bufferIndex + samplesToGenerate);
			this.bufferIndex += samplesToGenerate;
			return [];
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
		if (this.bufferIndex > 0) {
			this.sampleBuffer.fill(value, 0, this.bufferIndex);
		}

		return chunks;
	}
}
