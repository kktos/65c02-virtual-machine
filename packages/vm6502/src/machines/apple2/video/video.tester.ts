import type { Video } from "@/types/video.interface";
import type { AppleBus } from "../apple.bus";

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

	private testText40() {
		this.bus.text = true;
		this.bus.col80 = false;
		// Fill screen with all characters 0x00 - 0xFF
		this.fillPage1(0x400, 0x800, (i) => i % 256);
	}

	private testText80() {
		this.bus.text = true;
		this.bus.col80 = true;
		this.bus.store80 = true; // Allow access to Aux memory via Page2 switch logic if needed, but we use ramWrAux directly here

		// Write to Main Memory (Odd columns)
		this.bus.ramWrAux = false;
		this.fillPage1(0x400, 0x800, (i) => 0xc1 + (Math.floor(i / 40) % 26)); // 'A', 'B', 'C'...

		// Write to Aux Memory (Even columns)
		this.bus.ramWrAux = true;
		this.fillPage1(0x400, 0x800, (i) => 0xb1 + (Math.floor(i / 40) % 9)); // '1', '2', '3'...

		this.bus.ramWrAux = false; // Restore
	}

	private testGR() {
		this.bus.text = false;
		this.bus.hires = false;
		this.bus.mixed = true; // Show text at bottom

		// Fill GR area (0x400 - 0x800)
		// Draw vertical bars of all 16 colors
		this.fillPage1(0x400, 0x800, (i) => {
			const col = i % 40;
			const color = Math.floor(col / 2.5) % 16; // 16 colors across 40 columns
			return (color << 4) | color; // Top and bottom pixel same color
		});

		// Fill text area at bottom
		// Lines 20-23 are offsets 0x750, 0x7D0, 0x478, 0x4F8... roughly > 0x700
		// Just fill everything, the renderer decides what is text vs graphics based on address
	}

	private testHGR() {
		this.bus.text = false;
		this.bus.hires = true;
		this.bus.mixed = false;

		// Clear HGR Page 1 (0x2000 - 0x4000)
		this.fillPage1(0x2000, 0x4000, () => 0x00);

		// Draw some patterns
		// 1. Vertical Lines (Violet/Green)
		// 2. Vertical Lines (Blue/Orange)
		for (let row = 0; row < 192; row++) {
			// We need to calculate the HGR address for this row, but for a simple test,
			// let's just fill memory linearly to see *something*.
			// A real HGR plot function is complex (interleaved addresses).
		}

		// Simple fill to prove it works: Stripes
		this.fillPage1(0x2000, 0x4000, (i) => {
			const row = Math.floor(i / 40);
			if (row % 8 === 0) return 0xff; // White line
			return i % 2 === 0 ? 0x55 : 0x2a; // Alternating colors
		});
	}
}
