import type { AudioSource } from "../../speaker";
import type { ISlotCard } from "../slotcard.interface";
import { AY38910, type AYSnapshot } from "./ay38910";
import { VIA6522, type VIASnapshot } from "@/machines/chips/via6522";

/** The card drives the CPU's IRQ line through the bus, which ORs its cards. */
export interface MockingboardHost {
	updateIrq(): void;
}

type MockingboardSnapshot = { vias: VIASnapshot[]; ays: AYSnapshot[]; latches: number[] };

// Port B: the AY's control lines
const PB_BC1 = 0x01;
const PB_BDIR = 0x02;
const PB_RESET = 0x04; // active low

// BDIR/BC1 (with BC2 tied high; neither: inactive)
const AY_READ = PB_BC1;
const AY_WRITE = PB_BDIR;
const AY_LATCH = PB_BDIR | PB_BC1;

/** The output level of an AY at full volume (the speaker's square wave is ±0.25). */
const AY_LEVEL = 0.25;
/** The DC blocker's pole (the output is AC coupled): ~35 Hz at 44.1 kHz. */
const DC_POLE = 0.995;

/**
 * Mockingboard (A/C): two 6522 VIAs, each driving an AY-3-8910 PSG. No ROM: the slot's $Cn00-$CnFF space
 * decodes A7 as the VIA ($Cn00: the first, $Cn80: the second) and A3-A0 as its register.
 *
 * On each VIA, port A is the AY's data bus and port B its control lines (PB0: BC1, PB1: BDIR, PB2: /RESET), so
 * an AY register is written by: ORA = register, ORB = 7 (latch address), ORB = 4 (inactive), ORA = value,
 * ORB = 6 (write), ORB = 4. Music drivers run from the VIAs' timer 1 interrupts (both VIAs drive the IRQ line).
 *
 * The AYs are mixed (mono) into the speaker's output, sample-synchronized with it.
 */
export class MockingboardCard implements ISlotCard, AudioSource {
	private vias: VIA6522[];
	private ays = [new AY38910(), new AY38910()];
	/** The AY's address latch: a register, if its upper bits are 0 (else the AY isn't selected). */
	private latches = [0, 0];

	private dcInput = 0;
	private dcOutput = 0;
	private mixBuffer = new Float32Array(512);

	constructor(
		private host: MockingboardHost,
		public slot: number,
	) {
		this.vias = [0, 1].map(
			(index) =>
				new VIA6522({
					writePortA: () => this.driveAy(index),
					writePortB: () => this.driveAy(index),
					readPortA: () => this.readAyBus(index),
					irq: () => this.host.updateIrq(),
				}),
		);
		this.reset();
	}

	/** The Apple's RESET line: on the VIAs, and the AYs silenced. */
	public reset() {
		for (const via of this.vias) via.reset();
		for (const ay of this.ays) ay.reset();
		this.latches.fill(0);
	}

	public get irq() {
		return this.vias[0]!.irq || this.vias[1]!.irq;
	}

	/** The AY's control lines or data bus changed: it acts as long as they hold. */
	private driveAy(index: number) {
		const via = this.vias[index]!;
		const ay = this.ays[index]!;
		const control = via.portB;
		if (!(control & PB_RESET)) {
			ay.reset();
			return;
		}
		switch (control & (PB_BDIR | PB_BC1)) {
			case AY_LATCH:
				this.latches[index] = via.portA;
				break;
			case AY_WRITE:
				if (this.latches[index]! < 0x10) ay.write(this.latches[index]!, via.portA);
				break;
		}
	}

	/** Port A's inputs: the AY's data bus, which it drives in read mode. */
	private readAyBus(index: number) {
		const control = this.vias[index]!.portB;
		const reading = control & PB_RESET && (control & (PB_BDIR | PB_BC1)) === AY_READ;
		if (!reading || this.latches[index]! >= 0x10) return 0xff;
		return this.ays[index]!.read(this.latches[index]!);
	}

	tick(cycles: number) {
		this.vias[0]!.tick(cycles);
		this.vias[1]!.tick(cycles);
	}

	render(out: Float32Array, start: number, count: number, sampleRate: number) {
		if (this.mixBuffer.length < count) this.mixBuffer = new Float32Array(count);
		const mix = this.mixBuffer;
		mix.fill(0, 0, count);
		this.ays[0]!.render(mix, 0, count, sampleRate, AY_LEVEL);
		this.ays[1]!.render(mix, 0, count, sampleRate, AY_LEVEL);
		for (let index = 0; index < count; index++) {
			const input = mix[index]!;
			this.dcOutput = input - this.dcInput + DC_POLE * this.dcOutput;
			this.dcInput = input;
			out[start + index]! += this.dcOutput;
		}
	}

	readRom(offset: number): number {
		return this.vias[offset >> 7]!.read(offset & 0x0f);
	}

	writeRom(offset: number, value: number): void {
		this.vias[offset >> 7]!.write(offset & 0x0f, value);
	}

	readIo(_offset: number): number {
		return 0;
	}

	writeIo(_offset: number, _value: number): void {
		// The Mockingboard doesn't use its $C0n0 space
	}

	readExpansion(_offset: number): number {
		return 0;
	}

	snapshot(): MockingboardSnapshot {
		return {
			vias: this.vias.map((via) => via.snapshot()),
			ays: this.ays.map((ay) => ay.snapshot()),
			latches: [...this.latches],
		};
	}

	restoreSnapshot(state: unknown) {
		const { vias, ays, latches } = state as MockingboardSnapshot;
		this.vias.forEach((via, index) => via.restoreSnapshot(vias[index]!));
		this.ays.forEach((ay, index) => ay.restoreSnapshot(ays[index]!));
		this.latches = [...latches];
	}
}
