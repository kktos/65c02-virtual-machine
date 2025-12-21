export function bytesToAscii(bytes: Uint8Array): string {
	// Ensure all bytes are printable ASCII (32-126) or common control chars
	const chars = new Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		const byte = bytes[i] as number;
		if (byte >= 32 && byte <= 126) {
			chars[i] = String.fromCharCode(byte);
		} else {
			chars[i] = "."; // Non-printable
		}
	}
	return chars.join("");
}

export function parseHexData(data: string): Uint8Array {
	const bytes = data
		.trim()
		.split(/\s+/)
		.map((s) => parseInt(s, 16));
	return new Uint8Array(bytes);
}
