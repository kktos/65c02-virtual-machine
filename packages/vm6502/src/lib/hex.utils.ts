export const formatAddress = (addr: number) => {
	const bank = ((addr >> 16) & 0xff).toString(16).toUpperCase().padStart(2, "0");
	const offset = (addr & 0xffff).toString(16).toUpperCase().padStart(4, "0");
	return `$${bank}:${offset}`;
};

export function toHex(v: number | undefined, pad = 2) {
	return (v ?? 0).toString(16).toUpperCase().padStart(pad, "0");
}

const HEX_PREFIX = new RegExp("^(0x|\\$)");
export function parseHexValue(value: string) {
	const hexVal = value.replace(HEX_PREFIX, "");
	return parseInt(hexVal, 16);
}

export function hexDump(
	addr: number,
	bytes: Uint8Array,
	options?: {
		bytesPerLine?: number;
		formatAddr?: (addr: number) => string;
		highlight?: { start: number; length: number };
	},
) {
	const output: string[] = [];

	const formatAddrFn = options?.formatAddr ?? formatAddress;
	const bytesPerLine = options?.bytesPerLine ?? 16;
	const len = bytes.length;
	const highlight = options?.highlight;
	const highlightEnd = highlight ? highlight.start + highlight.length : -1;

	for (let i = 0; i < len; i += bytesPerLine) {
		const chunk = bytes.subarray(i, i + bytesPerLine);
		const hexParts: string[] = [];
		const asciiParts: string[] = [];

		for (let j = 0; j < chunk.length; j++) {
			let byte = chunk[j];
			const currentAddr = addr + i + j;
			const isHighlighted = highlight && currentAddr >= highlight.start && currentAddr < highlightEnd;

			const hex = toHex(byte, 2);
			hexParts.push(isHighlighted ? `**${hex}**` : hex);

			byte = byte & 0x7f;
			const char = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".";
			asciiParts.push(isHighlighted ? `**${char}**` : char);
		}

		const hexString = hexParts.join(" ").replaceAll("** **", " ");
		const asciiString = asciiParts.join("").replaceAll("****", "").replaceAll("`", "\\`");
		const padding = "".padStart((bytesPerLine - hexParts.length) * 3, "\u00a0\u00a0\u00a0");
		output.push(`${formatAddrFn(addr + i)}:&nbsp;${hexString}&nbsp;&nbsp;${padding}${asciiString}`);
	}
	return output.join("<br/>");
}
