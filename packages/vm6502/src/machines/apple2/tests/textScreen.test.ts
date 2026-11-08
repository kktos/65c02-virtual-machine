import { describe, expect, it } from "vitest";
import { decodeTextChar, readTextScreen } from "../video/text.screen";

// Fake memory for debug reads: main at $0000-$FFFF, aux at $10000-$1FFFF.
const memory = () => new Uint8Array(0x20000).fill(0xa0); // spaces
const reader = (mem: Uint8Array) => (address: number, length: number) => mem.slice(address, address + length);
const put = (mem: Uint8Array, address: number, text: string) =>
	[...text].forEach((c, i) => (mem[address + i] = c.charCodeAt(0) | 0x80));

describe("decodeTextChar", () => {
	it("normal characters, lowercase included", () => {
		expect([0xc1, 0xa0, 0xb1, 0xe1, 0xff].map(decodeTextChar).join("")).toBe("A 1a ");
	});

	it("inverse ($00-$3F) and flashing ($40-$7F) are shown as normal characters", () => {
		expect([0x01, 0x20, 0x31, 0x41, 0x60].map(decodeTextChar).join("")).toBe("A 1A ");
	});

	it("$FF (DEL) is a space; $7F is a flashing `?`", () => {
		expect(decodeTextChar(0xff)).toBe(" ");
		expect(decodeTextChar(0x7f)).toBe("?");
	});
});

describe("readTextScreen", () => {
	it("24 rows in screen order (interleaved in memory), trailing spaces trimmed", () => {
		const mem = memory();
		put(mem, 0x400, "ROW 0");
		put(mem, 0x480, "ROW 1");
		put(mem, 0x428, "ROW 8");
		put(mem, 0x7d0, "ROW 23");
		const screen = readTextScreen(reader(mem));
		expect(screen).toHaveLength(24);
		expect([screen[0], screen[1], screen[8], screen[23]]).toEqual(["ROW 0", "ROW 1", "ROW 8", "ROW 23"]);
		expect(screen[2]).toBe("");
	});

	it("page 2 is $800-$BFF", () => {
		const mem = memory();
		put(mem, 0x400, "PAGE 1");
		put(mem, 0x800, "PAGE 2");
		expect(readTextScreen(reader(mem), { page: 2 })[0]).toBe("PAGE 2");
	});

	it("80 columns: aux (even columns) and main (odd columns) interleaved", () => {
		const mem = memory();
		put(mem, 0x10400, "AC"); // aux
		put(mem, 0x400, "BD"); // main
		const screen = readTextScreen(reader(mem), { cols: 80 });
		expect(screen[0]).toBe("ABCD");
	});
});
