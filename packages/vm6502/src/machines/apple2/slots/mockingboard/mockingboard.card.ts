import type { IBus } from "@/virtualmachine/cpu/bus.interface";
import type { ISlotCard } from "../slotcard.interface";
import { AY38910 } from "./ay38910";
import { VIA6522 } from "./via6522";

export class MockingboardCard implements ISlotCard {
	private via1: VIA6522;
	private via2: VIA6522;
	private ay1: AY38910;
	private ay2: AY38910;

	// Bus Latching for AY communication
	private ay1Addr = 0;
	private ay2Addr = 0;

	constructor(
		_bus: IBus,
		public slot: number,
	) {
		this.slot = slot;
		this.ay1 = new AY38910();
		this.ay2 = new AY38910();

		// VIA 1 controls AY 1
		this.via1 = new VIA6522({
			writePortB: (val) => this.controlAy(this.ay1, val, this.via1.read(1)), // Port B controls, Port A data
			writePortA: (_val) => {
				/* Data bus, used when Port B triggers */
			},
		});

		// VIA 2 controls AY 2
		this.via2 = new VIA6522({
			writePortB: (val) => this.controlAy(this.ay2, val, this.via2.read(1)),
			writePortA: (_val) => {},
		});
	}

	private controlAy(ay: AY38910, ctrl: number, data: number) {
		// Mockingboard Control Lines on Port B:
		// Bit 0: BC1
		// Bit 1: BDIR
		// Bit 2: Reset (Active Low)

		const bc1 = (ctrl & 0x01) !== 0;
		const bdir = (ctrl & 0x02) !== 0;
		const reset = (ctrl & 0x04) === 0;

		if (reset) {
			// Reset AY
			return;
		}

		if (bdir && bc1) {
			// Latch Address
			if (ay === this.ay1) this.ay1Addr = data & 0x0f;
			else this.ay2Addr = data & 0x0f;
		} else if (bdir && !bc1) {
			// Write Data
			if (ay === this.ay1) ay.write(this.ay1Addr, data);
			else ay.write(this.ay2Addr, data);
		} else if (!bdir && bc1) {
			// Read Data (Not fully implemented on VIA side to return it yet, but AY supports read)
		}
	}

	tick(cycles: number): Float32Array[] {
		this.via1.tick(cycles);
		this.via2.tick(cycles);

		const buf1 = this.ay1.tick(cycles);
		const buf2 = this.ay2.tick(cycles);

		if (!buf1 && !buf2) return [];

		// Mix buffers if both exist, or return what we have
		// For simplicity, we can return them as separate chunks or mix them.
		// Mixing is safer for the speaker output.
		const len = buf1 ? buf1.length : buf2 ? buf2.length : 0;
		if (len === 0) return [];

		const mixed = new Float32Array(len);
		for (let i = 0; i < len; i++) {
			const s1 = buf1?.[i] ?? 0;
			const s2 = buf2?.[i] ?? 0;
			mixed[i] = (s1 + s2) * 0.5; // Simple mix
		}

		return [mixed];
	}

	readRom(offset: number): number {
		// VIA 1 ($Cn00 - $Cn0F)
		if (offset >= 0x00 && offset < 0x10) {
			return this.via1.read(offset);
		}
		// VIA 2 ($Cn80 - $Cn8F)
		if (offset >= 0x80 && offset < 0x90) {
			return this.via2.read(offset & 0x0f);
		}
		return 0;
	}

	writeRom(offset: number, value: number): void {
		// VIA 1 ($Cn00 - $Cn0F)
		if (offset >= 0x00 && offset < 0x10) {
			this.via1.write(offset, value);
		}
		// VIA 2 ($Cn80 - $Cn8F)
		if (offset >= 0x80 && offset < 0x90) {
			this.via2.write(offset & 0x0f, value);
		}
	}

	readIo(_offset: number): number {
		return 0;
	}

	writeIo(_offset: number, _value: number): void {
		// Standard Mockingboard does not use $C0n0 space
	}

	readExpansion(_offset: number): number {
		return 0;
	}
}
