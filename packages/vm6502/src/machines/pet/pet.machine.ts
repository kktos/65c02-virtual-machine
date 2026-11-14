import type { MachineConfig } from "@/types/machine.interface";
import { CHARGEN, PET_MEMORY_SIZE } from "./pet.bus";

/**
 * The Commodore PET 3032 (BASIC 2, graphics keyboard, 32K). The ROMs are Commodore's, not in the repo:
 * `npm run roms:pet` fetches them from the VICE sources into public/roms/pet/.
 */
export const pet3032: MachineConfig = {
	name: "Commodore PET 3032",
	memory: {
		size: PET_MEMORY_SIZE,
		chunks: [
			{ addr: 0xc000, src: "roms/pet/basic-2.901465-01-02.bin", size: 0x2000, tag: "basic.rom" },
			{ addr: 0xe000, src: "roms/pet/edit-2-n.901447-24.bin", size: 0x800, tag: "editor.rom" },
			{ addr: 0xf000, src: "roms/pet/kernal-2.901465-03.bin", size: 0x1000, tag: "kernal.rom" },
			{ addr: CHARGEN, src: "roms/pet/characters-2.901447-10.bin", size: 0x800, tag: "chargen.rom" },
		],
	},
	bus: { class: "PetBus", path: "pet/pet.bus" },
	// A 4040 on the IEEE-488 bus, device 8 (drive 0). The PET doesn't boot from it: LOAD"*",8 loads the first file.
	disk: { enabled: true, name: "4040", extensions: [".d64"], blockSize: 256, bootKeys: 'LOAD"*",8\nRUN\n' },
	video: { width: 320, height: 200, class: "PetVideo", path: "pet/pet.video" },
	regions: [
		{ name: "Stack", start: 0x0100, size: 0x0100, color: "#fb923c", removable: false },
		{ name: "Screen", start: 0x8000, size: 0x0400, color: "#4ade80", removable: false },
		{ name: "BASIC", start: 0xc000, size: 0x2000, color: "#60a5fa", removable: false },
		{ name: "Editor", start: 0xe000, size: 0x0800, color: "#818cf8", removable: false },
		{ name: "I/O", start: 0xe800, size: 0x0100, color: "#94a3b8", removable: false },
		{ name: "Kernal", start: 0xf000, size: 0x1000, color: "#a78bfa", removable: false },
	],
	speeds: [
		{ label: "1 MHz", value: 1 },
		{ label: "2 MHz", value: 2 },
		{ label: "4 MHz", value: 4 },
		{ label: "8 MHz", value: 8 },
		{ label: "Max", value: 0 },
	],
};
