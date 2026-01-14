export class AY38910 {
	private regs = new Uint8Array(16);
	private sampleRate = 44100;
	private clock = 1020484; // ~1.02 MHz
	private cyclesPerSample = 0;
	private accumulatedCycles = 0;

	// Oscillators
	private countA = 0;
	private countB = 0;
	private countC = 0;
	private countN = 0;
	private countE = 0;

	private outA = false;
	private outB = false;
	private outC = false;
	private outN = false; // Noise output

	private rng = 1; // Noise LFSR

	// Envelope
	private envVol = 0;
	private envStep = 0; // 0-15 or 15-0
	private envHold = false;
	private envAlt = false;
	private envAttack = false;
	private envContinue = false;

	constructor(sampleRate = 44100) {
		this.sampleRate = sampleRate;
		this.cyclesPerSample = this.clock / sampleRate;
	}

	public write(reg: number, val: number) {
		if (reg > 15) return;
		this.regs[reg] = val;

		if (reg === 13) {
			// Reset Envelope
			this.countE = 0;
			this.envStep = 0;
			// Decode shape... (Simplified for now)
		}
	}

	public read(reg: number) {
		if (reg > 15) return 0;
		return this.regs[reg];
	}

	public tick(cycles: number): Float32Array | null {
		// We process audio at the sample rate, not cycle accurate per instruction for performance
		this.accumulatedCycles += cycles;
		if (this.accumulatedCycles < this.cyclesPerSample) return null;

		const samplesNeeded = Math.floor(this.accumulatedCycles / this.cyclesPerSample);
		this.accumulatedCycles -= samplesNeeded * this.cyclesPerSample;

		const buffer = new Float32Array(samplesNeeded);

		for (let i = 0; i < samplesNeeded; i++) {
			this.stepOscillators();
			buffer[i] = this.mix();
		}

		return buffer;
	}

	private stepOscillators() {
		// Tone Channels (Clock / 16 / Period)
		// We step at 1/16th of clock effectively if we treat period as raw
		// Simplified: Decrement counters. If <= 0, flip output and reload.

		// Channel A
		const periodA = this.regs[0] | (this.regs[1] << 8) || 1;
		this.countA++;
		if (this.countA >= periodA * 16) {
			// *16 because internal divider
			this.countA = 0;
			this.outA = !this.outA;
		}

		// Channel B
		const periodB = this.regs[2] | (this.regs[3] << 8) || 1;
		this.countB++;
		if (this.countB >= periodB * 16) {
			this.countB = 0;
			this.outB = !this.outB;
		}

		// Channel C
		const periodC = this.regs[4] | (this.regs[5] << 8) || 1;
		this.countC++;
		if (this.countC >= periodC * 16) {
			this.countC = 0;
			this.outC = !this.outC;
		}

		// Noise (Clock / 16 / Period)
		const periodN = (this.regs[6] || 1) * 32; // *16 * 2 (toggle)
		this.countN++;
		if (this.countN >= periodN) {
			this.countN = 0;
			// LFSR
			const bit = ((this.rng >> 0) ^ (this.rng >> 3)) & 1;
			this.rng = (this.rng >> 1) | (bit << 16);
			this.outN = (this.rng & 1) !== 0;
		}
	}

	private mix(): number {
		let vol = 0;
		const mixer = this.regs[7];

		// Channel A
		const enableToneA = (mixer & 0x01) === 0;
		const enableNoiseA = (mixer & 0x08) === 0;
		const activeA = (enableToneA ? this.outA : true) && (enableNoiseA ? this.outN : true);
		if (activeA) vol += (this.regs[8] & 0x0f) / 15.0;

		// Channel B
		const enableToneB = (mixer & 0x02) === 0;
		const enableNoiseB = (mixer & 0x10) === 0;
		const activeB = (enableToneB ? this.outB : true) && (enableNoiseB ? this.outN : true);
		if (activeB) vol += (this.regs[9] & 0x0f) / 15.0;

		// Channel C
		const enableToneC = (mixer & 0x04) === 0;
		const enableNoiseC = (mixer & 0x20) === 0;
		const activeC = (enableToneC ? this.outC : true) && (enableNoiseC ? this.outN : true);
		if (activeC) vol += (this.regs[10] & 0x0f) / 15.0;

		return vol / 3.0; // Normalize
	}
}
