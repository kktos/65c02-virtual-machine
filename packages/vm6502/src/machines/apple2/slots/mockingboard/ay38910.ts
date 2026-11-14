/** What a save state keeps of an AY-3-8910: its registers (the oscillators' phases, not seen by the program, follow the audio output). */
export type AYSnapshot = number[];

/** The output level of each of the 16 volumes (logarithmic, ~3 dB a step), normalized: from Ayumi's AY table. */
const VOLUMES = [
	0, 0.00999465934234, 0.0144502937362, 0.0210574502174, 0.0307011520562, 0.0455481803616, 0.0644998855573,
	0.107362478065, 0.126588845655, 0.20498970016, 0.292210269322, 0.372838941024, 0.492530708782, 0.635324635691,
	0.805584802014, 1.0,
];

/** The bits each register keeps (the others read as 0). */
const REG_MASKS = [0xff, 0x0f, 0xff, 0x0f, 0xff, 0x0f, 0x1f, 0xff, 0x1f, 0x1f, 0x1f, 0xff, 0xff, 0x0f, 0xff, 0xff];

const REG_MIXER = 7;
const REG_AMPLITUDE_A = 8;
const REG_ENV_SHAPE = 13;

const ENV_CONTINUE = 0x08;
const ENV_ATTACK = 0x04;
const ENV_ALTERNATE = 0x02;
const ENV_HOLD = 0x01;

/** The Mockingboard's AY runs on the slot's clock. */
export const AY_CLOCK_HZ = 1_020_484;

/**
 * General Instrument AY-3-8910 PSG: 3 square wave tone channels, a noise generator and an envelope generator.
 *
 * Internally it steps at clock/8: a tone channel flips its output every `period` steps (a frequency of
 * clock / (16 * period)); the noise (a 17-bit LFSR) and the envelope (16 steps) advance at clock/16, every
 * `period` of theirs. Rendered at the output's sample rate, each sample the average of the steps it spans.
 */
export class AY38910 {
	private regs = new Uint8Array(16);

	private toneCounters = [0, 0, 0];
	private toneOut = [false, false, false];

	private noiseCounter = 0;
	private rng = 1; // Noise LFSR

	private envCounter = 0;
	private envStep = 0; // 0-15
	private envAttack = false; // rising
	private envHolding = false;

	private prescaler = 0; // clock/8 steps, the noise and envelope advance every other one
	private phase = 0; // the clock cycles not yet stepped

	public reset() {
		this.regs.fill(0);
		this.toneCounters.fill(0);
		this.toneOut.fill(false);
		this.noiseCounter = 0;
		this.rng = 1;
		this.restartEnvelope();
	}

	public write(reg: number, val: number) {
		if (reg > 15) return;
		this.regs[reg] = val & REG_MASKS[reg]!;
		if (reg === REG_ENV_SHAPE) this.restartEnvelope();
	}

	public read(reg: number) {
		if (reg > 15) return 0;
		return this.regs[reg]!;
	}

	/** Adds `count` samples (from `start`) of `level` times the output (0..1 summed over the 3 channels, /3). */
	public render(out: Float32Array, start: number, count: number, sampleRate: number, level: number) {
		const cyclesPerSample = AY_CLOCK_HZ / sampleRate;
		for (let index = start; index < start + count; index++) {
			this.phase += cyclesPerSample;
			let sum = 0;
			let steps = 0;
			while (this.phase >= 8) {
				this.phase -= 8;
				this.step();
				sum += this.output();
				steps++;
			}
			out[index]! += (steps ? sum / steps : this.output()) * level;
		}
	}

	public snapshot(): AYSnapshot {
		return [...this.regs];
	}

	public restoreSnapshot(regs: AYSnapshot) {
		this.regs.set(regs);
	}

	private restartEnvelope() {
		this.envCounter = 0;
		this.envStep = 0;
		this.envAttack = (this.regs[REG_ENV_SHAPE]! & ENV_ATTACK) !== 0;
		this.envHolding = false;
	}

	/** One clock/8 step. */
	private step() {
		for (let channel = 0; channel < 3; channel++) {
			const period = this.regs[channel * 2]! | (this.regs[channel * 2 + 1]! << 8) || 1;
			if (++this.toneCounters[channel]! >= period) {
				this.toneCounters[channel] = 0;
				this.toneOut[channel] = !this.toneOut[channel];
			}
		}

		this.prescaler ^= 1;
		if (this.prescaler) return;

		// Noise: bit 0 out, bit0 ^ bit3 shifted in at bit 16
		const noisePeriod = this.regs[6]! || 1;
		if (++this.noiseCounter >= noisePeriod) {
			this.noiseCounter = 0;
			const bit = (this.rng ^ (this.rng >> 3)) & 1;
			this.rng = (this.rng >> 1) | (bit << 16);
		}

		// Envelope
		const envPeriod = this.regs[11]! | (this.regs[12]! << 8) || 1;
		if (this.envHolding || ++this.envCounter < envPeriod) return;
		this.envCounter = 0;
		if (++this.envStep < 16) return;

		const shape = this.regs[REG_ENV_SHAPE]!;
		if (!(shape & ENV_CONTINUE) || shape & ENV_HOLD) {
			// Held: at 0 (\___ /___), or at the level the cycle ended on, flipped by alternate (\¯¯¯ /¯¯¯)
			const high = shape & ENV_CONTINUE && this.envAttack !== ((shape & ENV_ALTERNATE) !== 0);
			this.envHolding = true;
			this.envAttack = true; // envLevel = envStep
			this.envStep = high ? 15 : 0;
		} else {
			// repeating: \\\\ //// or \/\/ /\/\
			this.envStep = 0;
			if (shape & ENV_ALTERNATE) this.envAttack = !this.envAttack;
		}
	}

	private get envLevel() {
		return this.envAttack ? this.envStep : 15 - this.envStep;
	}

	/** The 3 channels mixed, 0..1. */
	private output(): number {
		const mixer = this.regs[REG_MIXER]!;
		const noise = (this.rng & 1) !== 0;
		let sum = 0;
		for (let channel = 0; channel < 3; channel++) {
			const toneOff = (mixer & (1 << channel)) !== 0;
			const noiseOff = (mixer & (8 << channel)) !== 0;
			if (!((toneOff || this.toneOut[channel]) && (noiseOff || noise))) continue;
			const amplitude = this.regs[REG_AMPLITUDE_A + channel]!;
			sum += VOLUMES[amplitude & 0x10 ? this.envLevel : amplitude & 0x0f]!;
		}
		return sum / 3;
	}
}
