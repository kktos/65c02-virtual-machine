import type { Video } from "@/types/video.interface";
import type { AppleBus } from "../apple.bus";
import { textScreenLineOffsets } from "./constants";

export class VideoTester {
	constructor(
		private bus: AppleBus,
		private video: Video | null,
	) {}

	public run(mode: string) {
		// 1. Reset to a clean state (Standard Text Mode)
		this.bus.text = true;
		this.bus.hires = false;
		this.bus.mixed = false;
		this.bus.col80 = false;
		this.bus.store80 = false;
		this.bus.page2 = false;
		this.bus.ramWrAux = false;
		this.bus.ramRdAux = false;

		// 2. Apply specific test mode
		switch (mode) {
			case "TEXT40":
				this.testText40();
				break;
			case "TEXT80":
				this.testText80();
				break;
			case "GR":
				this.testGR();
				break;
			case "HGR":
				this.testHGR();
				break;
		}

		// 3. Sync the bus state to the shared buffer so the Video Renderer sees the changes
		this.bus.syncState();
		this.video?.tick();
	}

	private fillPage1(start: number, end: number, valueFn: (offset: number) => number) {
		for (let i = start; i < end; i++) this.bus.write(i, valueFn(i - start));
	}

	private getHgrLineOffset(y: number): number {
		return 0x2000 + (y % 8) * 0x400 + ((y >> 3) & 7) * 0x80 + Math.floor(y / 64) * 0x28;
	}

	private testText40() {
		this.bus.text = true;
		this.bus.col80 = false;

		for (let y = 0; y < 24; y++) {
			const lineBase = textScreenLineOffsets[y];
			for (let x = 0; x < 40; x++) {
				this.bus.write(lineBase + x, 0xc1 + (y % 26)); // A, B, C... per row
			}
		}
	}

	private testText80() {
		this.bus.text = true;
		this.bus.col80 = true;
		this.bus.store80 = true; // Allow access to Aux memory via Page2 switch logic if needed, but we use ramWrAux directly here

		for (let y = 0; y < 24; y++) {
			const lineBase = textScreenLineOffsets[y];
			for (let x = 0; x < 40; x++) {
				// Write to Main Memory (Odd columns)
				this.bus.ramWrAux = false;
				this.bus.write(lineBase + x, 0xc1 + (y % 26));
				// Write to Aux Memory (Even columns)
				this.bus.ramWrAux = true;
				this.bus.write(lineBase + x, 0xb1 + (y % 9));
			}
		}
		this.bus.ramWrAux = false;
	}

	private testGR() {
		this.bus.text = false;
		this.bus.hires = false;
		this.bus.mixed = true; // Show text at bottom

		// Clear screen first (to handle holes cleanly)
		this.fillPage1(0x400, 0x800, () => 0x00);

		for (let y = 0; y < 24; y++) {
			const lineBase = textScreenLineOffsets[y];
			for (let x = 0; x < 40; x++) {
				const color = Math.floor(x / 2.5) % 16; // 16 colors across 40 columns
				this.bus.write(lineBase + x, (color << 4) | color);
			}
		}
	}

	private testHGR() {
		this.bus.text = false;
		this.bus.hires = true;
		this.bus.mixed = true; // Show text at bottom

		// Clear HGR Page 1 (0x2000 - 0x4000)
		this.fillPage1(0x2000, 0x4000, () => 0x00);

		// Draw a border and an X
		for (let y = 0; y < 192; y++) {
			const lineBase = this.getHgrLineOffset(y);
			for (let x = 0; x < 40; x++) {
				let val = 0;
				if (y === 0 || y === 191 || x === 0 || x === 39)
					val = 0xff; // Border
				else if (Math.floor(x * 4.8) === y || Math.floor((39 - x) * 4.8) === y) val = 0x7f; // X pattern (approx)

				if (val !== 0) this.bus.write(lineBase + x, val);
			}
		}
	}
}
