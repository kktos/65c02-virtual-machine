import type { MemoryRegion } from "@/types/machine.interface";

export const regionsConfig: MemoryRegion[] = [
	// Bank 0: Main Memory
	{
		name: "Stack",
		start: 0x0100,
		size: 0x0100,
		color: "#fb923c", // orange-400
		bank: 0,
		removable: false,
	},

	// Bank 1: Aux Memory
	{
		name: "Aux Stack",
		start: 0x0100,
		size: 0x0100,
		color: "#facc15", // yellow-400
		bank: 1,
		removable: false,
	},

	// Shared / System
	{
		name: "I/O",
		start: 0xc000,
		size: 0x0100,
		color: "#94a3b8", // slate-400
		removable: false,
	},
	{
		name: "Slot ROM",
		start: 0xc100,
		size: 0xf00,
		color: "#3b82f6", // blue-500
		removable: false,
	},
	{
		name: "LC ROM",
		start: 0xd000,
		size: 0x1000,
		color: "#3b82f6", // blue-500
		removable: false,
	},
	{
		name: "ROM",
		start: 0xe000,
		size: 0x2000,
		color: "#3b82f6", // blue-500
		removable: false,
	},
];
