export const formatAddress = (addr: number) => {
	const bank = ((addr >> 16) & 0xff).toString(16).toUpperCase().padStart(2, "0");
	const offset = (addr & 0xffff).toString(16).toUpperCase().padStart(4, "0");
	return `$${bank}:${offset}`;
};

export function toHex(v: number | undefined, pad: number) {
	return (v ?? 0).toString(16).toUpperCase().padStart(pad, "0");
}
