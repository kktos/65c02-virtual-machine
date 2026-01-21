import type { AppleBus } from "../../apple.bus";
import { textScreenLineOffsets } from "../constants";

export function writeChar80(bus: AppleBus, y: number, col: number, val: number) {
	// biome-ignore lint/style/noNonNullAssertion: <!>
	const lineBase = textScreenLineOffsets[y]!;
	const offset = Math.floor(col / 2);
	const isMain = col % 2 !== 0; // Col 0=Aux, 1=Main, 2=Aux, 3=Main...

	bus.page2 = !isMain;
	bus.write(lineBase + offset, val);
	bus.page2 = false;
}

export function writeStr80(bus: AppleBus, y: number, text: string, mode: "NORMAL" | "INVERSE" | "FLASH") {
	const startCol = Math.floor((80 - text.length) / 2);
	for (let i = 0; i < text.length; i++) {
		const charCode = text.charCodeAt(i) & 0x7f;
		let val = charCode;
		if (mode === "NORMAL") val |= 0x80;
		else if (mode === "INVERSE") val &= 0x3f;
		else if (mode === "FLASH") val = (val & 0x3f) | 0x40;
		writeChar80(bus, y, startCol + i, val);
	}
}
