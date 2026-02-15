import type { DebugGroup } from "@/types/machine.interface";

export const debugMemoryConfig: DebugGroup = {
	label: "General",
	category: "memory",
	rows: [
		[
			{
				id: "lcView",
				label: "LC",
				type: "select",
				options: [
					{ label: "Auto", value: "AUTO" },
					{ label: "ROM", value: "ROM" },
					{ label: "RAM Bank 1", value: "BANK1" },
					{ label: "RAM Bank 2", value: "BANK2" },
				],
			},
		],
		[
			{
				id: "cxView",
				label: "Cx ROM",
				type: "select",
				options: [
					{ label: "Auto", value: "AUTO" },
					{ label: "Internal", value: "INT" },
					{ label: "Slots", value: "SLOT" },
				],
			},
		],
	],
};
