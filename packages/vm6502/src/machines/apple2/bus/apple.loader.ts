import type { AppleBus } from "../apple.bus";

const RAM_OFFSET = 0x4000;

export function loadMemoryChunks(
	bus: AppleBus,
	address: number,
	data: Uint8Array,
	bank: number = 0,
	tag?: string,
): void {
	switch (tag) {
		// If loading into the Language Card range ($D000+), load into ROM buffer
		case "lgcard.rom": {
			if (data.length <= bus.rom.length) {
				bus.rom.set(data);
				console.log(`AppleBus: Loaded ${data.length} bytes into ROM at $D000`);
				return;
			}
			console.error(`AppleBus: Load out of bounds: lgcard.rom`);
			break;
		}
		case "lgcard.bank2":
			if (data.length <= bus.bank2.length) {
				bus.bank2.set(data);
				console.log(`AppleBus: Loaded ${data.length} bytes into LC RAM 2 at $D000`);
				return;
			}
			console.error(`AppleBus: Load out of bounds: lgcard.bank2`);
			break;
		case "int.rom.cx":
			if (data.length <= bus.romC.length) {
				bus.romC.set(data);
				console.log(`AppleBus: Loaded ${data.length} bytes into Internal ROM C at $C100`);
				return;
			}
			console.error(`AppleBus: Load out of bounds: system.rom.c`);
			break;
		case "slots.rom":
			if (data.length <= bus.slotRoms.length) {
				bus.slotRoms.set(data);
				console.log(`AppleBus: Loaded ${data.length} bytes into Slot ROMs at $C100`);
				return;
			}
			console.error("AppleBus: Load out of bounds: slots.rom");
			break;
		case "slot.rom":
			if (data.length !== 0x100) {
				console.error("AppleBus: Load out of bounds: slot.rom should be $100 bytes");
				return;
			}
			if (address < 1 || address > 7) {
				console.error("AppleBus: Load out of bounds: slot.rom should be from 1 to 7");
				return;
			}
			bus.slotRoms.set(data, (address - 1) * 0x100);
			console.log(`AppleBus: Loaded ${data.length} bytes into Slot ${address} ROM`);
			return;
	}

	// Default load to physical RAM
	// Handle Bank 1 (Aux) offset if bank=1
	const physicalAddress = RAM_OFFSET + address + bank * 0x10000;
	if (physicalAddress + data.length <= bus.memory.length) {
		bus.memory.set(data, physicalAddress);
		console.log(`AppleBus: Loaded ${data.length} bytes into RAM at $${physicalAddress.toString(16)}`);
	} else console.error(`AppleBus: Load out of bounds: 0x${physicalAddress.toString(16)}`);
}
