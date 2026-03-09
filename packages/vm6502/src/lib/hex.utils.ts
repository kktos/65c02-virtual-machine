export const formatAddress = (addr: number) => {
	const bank = ((addr >> 16) & 0xff).toString(16).toUpperCase().padStart(2, "0");
	const offset = (addr & 0xffff).toString(16).toUpperCase().padStart(4, "0");
	return `$${bank}:${offset}`;
};

export function toHex(v: number | undefined, pad = 2) {
	return (v ?? 0).toString(16).toUpperCase().padStart(pad, "0");
}

export function hexDump(
	startAddr: number,
	endAddr: number,
	vm: { read: (addr: number) => number },
	formatAddr: (addr: number) => string,
) {
	let output = "";

	for (let addr = startAddr; addr <= endAddr; ) {
		const lineAddr = addr;
		const bytes = [];
		const chars = [];
		let line = `${formatAddr(lineAddr)}: `;
		for (let i = 0; i < 16 && addr <= endAddr; i++, addr++) {
			const byte = vm.read(addr);
			bytes.push(toHex(byte, 2));
			chars.push(byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".");
		}
		line += bytes.join(" ").padEnd(16 * 3 - 1);
		line += `  ${chars.join("")}`;
		if (output) output += "\n";
		output += line;
	}
	return output;
}
