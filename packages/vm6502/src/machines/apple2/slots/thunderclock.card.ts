import type { IBus } from "@/virtualmachine/cpu/bus.interface";
import type { ISlotCard } from "./slotcard.interface";

export class ThunderClockCard implements ISlotCard {
	constructor(
		private bus: IBus,
		public slot: number,
		private rom: Uint8Array,
	) {
		this.initRom();
	}

	private initRom() {
		// ProDOS Clock Card Signature
		// $Cn00=$08, $Cn02=$28, $Cn04=$58, $Cn06=$70
		this.rom[0x00] = 0x08;
		this.rom[0x02] = 0x28;
		this.rom[0x04] = 0x58;
		this.rom[0x06] = 0x70;

		// Entry points
		// READ: $Cn08
		// WRITE: $Cn0B

		const ioBase = 0xc080 + (this.slot << 4);
		const ioLo = ioBase & 0xff;
		const ioHi = ioBase >> 8;

		// $Cn08: STA $C080 (Trigger Read)
		// This writes to the card's I/O space (offset 0), which triggers doRead().
		this.rom[0x08] = 0x8d;
		this.rom[0x09] = ioLo;
		this.rom[0x0a] = ioHi;

		// $Cn0B: RTS (Return from Read / Entry for Write)
		// If called via $Cn08, execution falls through to here after the STA.
		// If called via $Cn0B (Write), it just returns immediately.
		this.rom[0x0b] = 0x60;
	}

	readRom(offset: number): number {
		return this.rom[offset] ?? 0;
	}

	readIo(_offset: number): number {
		return 0;
	}

	writeIo(offset: number, _value: number): void {
		if (offset === 0) {
			this.doRead();
		}
	}

	readExpansion(_offset: number): number {
		return 0;
	}

	private doRead() {
		const pad = (n: number) => n.toString().padStart(2, "0");
		const now = new Date();
		const day = pad(now.getDay());
		const month = pad(now.getMonth() + 1);
		const date = pad(now.getDate());
		const hours = pad(now.getHours());
		const minutes = pad(now.getMinutes());
		const str = `${month},${day},${date},${hours},${minutes}`;
		for (let i = 0; i < str.length; i++) this.bus.write(0x200 + i, str.charCodeAt(i) | 0x80);
	}
}
