import type { DebugOption } from "@/types/machine.interface";

export const IIgsColours: DebugOption["options"] = [
	{ label: "Auto", value: -1 },
	{ label: "Black", value: 0, color: "#000000" },
	{ label: "D. Red", value: 1, color: "#dd0030" },
	{ label: "D. Blue", value: 2, color: "#000099" },
	{ label: "Purple", value: 3, color: "#dd22dd" },
	{ label: "D. Green", value: 4, color: "#007722" },
	{ label: "D. Gray", value: 5, color: "#555555" },
	{ label: "M. Blue", value: 6, color: "#2222ff" },
	{ label: "Brown", value: 8, color: "#885500" }, // Note: 8 is Brown in IIgs palette
	{ label: "Orange", value: 9, color: "#ff6600" },
	{ label: "L. Gray", value: 10, color: "#aaaaaa" },
	{ label: "Pink", value: 11, color: "#ff9988" },
	{ label: "L. Green", value: 12, color: "#11dd00" },
	{ label: "Yellow", value: 13, color: "#ffff00" },
	{ label: "Aquamarine", value: 14, color: "#41ff99" },
	{ label: "White", value: 15, color: "#ffffff" },
];
