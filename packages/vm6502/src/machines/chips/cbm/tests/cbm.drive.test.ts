import { beforeEach, describe, expect, it, vi } from "vitest";
import { basicProgram, buildD64 } from "@/lib/tests/d64Builder";
import { CbmDrive, matchesPattern } from "../cbm.drive";
import { ATN, DAV, EOI, Ieee488Bus, NDAC, NRFD } from "../ieee488";

/**
 * The PET's side of the bus, step by step as its kernal does it (BASIC 2: TALK / LISTEN $F0B6 / $F0BA, the byte
 * out $F0EE, SECOND $F128, TKSA $F164, CIOUT $F16F, UNTALK / UNLISTEN $F17F / $F183, ACPTR $F18C). The drive
 * answers at once, so where the kernal waits for a line, the line must already be there: else it would time out.
 */
class Controller {
	lines = 0;
	data = 0;
	/** The kernal's ST: $80 device not present, $02 read timeout, $01 write timeout, $40 EOI */
	status = 0;
	/** CIOUT holds a byte back: it goes out with the next one, or with EOI at UNLISTEN */
	private buffered: number | null = null;

	constructor(readonly bus: Ieee488Bus) {}

	private drive(lines: number, data = this.data) {
		this.lines = lines;
		this.data = data;
		this.bus.setController(lines, data);
	}
	private assert(line: number) {
		this.drive(this.lines | line);
	}
	private release(line: number) {
		this.drive(this.lines & ~line);
	}

	/** $F0EE */
	private sendByte(byte: number) {
		this.release(DAV);
		if (!this.bus.isAsserted(NRFD) && !this.bus.isAsserted(NDAC)) {
			this.status |= 0x80;
			return;
		}
		this.drive(this.lines, byte);
		if (this.bus.isAsserted(NRFD)) throw new Error("NRFD never released");
		this.assert(DAV);
		if (this.bus.isAsserted(NDAC)) this.status |= 0x01;
		this.drive(this.lines & ~(DAV | EOI), 0);
	}

	/** $F0BC: the buffered byte goes with EOI, then ATN and the command */
	private command(byte: number) {
		this.release(NRFD); // the VIA, then PIA2: two writes
		this.release(NDAC);
		if (this.buffered !== null) {
			this.assert(EOI);
			this.sendByte(this.buffered);
			this.buffered = null;
			this.release(EOI);
		}
		if (this.bus.isAsserted(DAV)) throw new Error("DAV held");
		this.assert(ATN);
		this.sendByte(byte);
	}

	listen(device = 8) {
		this.command(0x20 | device);
	}
	talk(device = 8) {
		this.command(0x40 | device);
	}
	second(sa: number) {
		this.sendByte(sa);
		this.release(ATN);
	}
	tksa(sa: number) {
		this.sendByte(sa);
		this.assert(NRFD | NDAC);
		this.release(ATN);
	}
	ciout(byte: number) {
		if (this.buffered !== null) this.sendByte(this.buffered);
		this.buffered = byte;
	}
	unlisten() {
		this.command(0x3f);
		this.release(ATN);
	}
	untalk() {
		this.command(0x5f);
		this.release(ATN);
	}
	/** $F18C: null on a timeout (ST $02) */
	acptr(): number | null {
		this.assert(NDAC);
		this.release(NRFD);
		if (!this.bus.isAsserted(DAV)) {
			this.status |= 0x02;
			this.assert(NRFD);
			return null;
		}
		this.assert(NRFD);
		if (this.bus.isAsserted(EOI)) this.status |= 0x40;
		const byte = this.bus.data;
		this.release(NDAC);
		if (this.bus.isAsserted(DAV)) throw new Error("DAV still down");
		this.assert(NDAC);
		return byte;
	}

	// --- What the kernal's OPEN / LOAD / CLOSE / GET# do with them ---

	open(sa: number, name: string, device = 8) {
		this.listen(device);
		this.second(0xf0 | sa);
		for (const c of name) this.ciout(c.charCodeAt(0));
		this.unlisten();
	}
	close(sa: number) {
		this.listen();
		this.second(0xe0 | sa);
		this.unlisten();
	}
	/** Reads a channel up to EOI (or a timeout) */
	readAll(sa: number, max = 100_000) {
		this.status = 0;
		this.talk();
		this.tksa(0x60 | sa);
		const bytes: number[] = [];
		while (bytes.length < max) {
			const byte = this.acptr();
			if (byte === null) break;
			bytes.push(byte);
			if (this.status & 0x40) break;
		}
		this.untalk();
		return bytes;
	}
	/** LOAD: OPEN on channel 0, read, CLOSE */
	load(name: string) {
		this.open(0, name);
		const bytes = this.readAll(0);
		const status = this.status;
		this.close(0);
		return { bytes, status };
	}
	print(sa: number, text: string) {
		this.listen();
		this.second(0x60 | sa);
		for (const c of text) this.ciout(c.charCodeAt(0));
		this.unlisten();
	}
	readStatus() {
		return String.fromCharCode(...this.readAll(15));
	}
}

const text = (bytes: number[]) => String.fromCharCode(...bytes);
const HELLO = basicProgram([{ number: 10, tokens: [0x99, 0x22, ...[..."HI"].map((c) => c.charCodeAt(0)), 0x22] }]);
const BIG = Array.from({ length: 1000 }, (_, i) => i & 0xff);

const disk = () =>
	buildD64({
		name: "TEST",
		files: [
			{ name: "HELLO", data: HELLO },
			{ name: "DATA", data: [..."ONE\rTWO\r"].map((c) => c.charCodeAt(0)), typeByte: 0x81 },
			{ name: "BIG", data: BIG },
		],
	});

describe("CbmDrive on the IEEE-488 bus", () => {
	let bus: Ieee488Bus;
	let drive: CbmDrive;
	let pet: Controller;

	beforeEach(() => {
		bus = new Ieee488Bus();
		drive = new CbmDrive(8);
		bus.attach(drive);
		pet = new Controller(bus);
		drive.insert(disk());
	});

	it("is there for device 8, not for device 9", () => {
		pet.listen(8);
		expect(pet.status).toBe(0);
		pet.unlisten();
		const empty = new Controller(new Ieee488Bus());
		empty.listen(8);
		expect(empty.status).toBe(0x80); // ?DEVICE NOT PRESENT
		pet.status = 0;
		pet.talk(9);
		pet.tksa(0x60);
		expect(pet.acptr()).toBeNull(); // device 9 doesn't answer
		pet.untalk();
	});

	it("sends a file to LOAD, the last byte with EOI, and says OK", () => {
		const { bytes, status } = pet.load("HELLO");
		expect(bytes).toEqual(HELLO);
		expect(status).toBe(0x40);
		expect(pet.readStatus()).toBe("00, OK,00,00\r");
	});

	it("sends a file over several sectors", () => {
		expect(pet.load("BIG").bytes).toEqual(BIG);
	});

	it("matches the name with wildcards and the drive prefix", () => {
		expect(pet.load("0:HEL*").bytes).toEqual(HELLO);
		expect(pet.load("B?G").bytes).toEqual(BIG);
		expect(pet.load("*").bytes).toEqual(HELLO); // the first file
	});

	it("sends nothing for a file that isn't there: the PET times out; the status says why", () => {
		const { bytes, status } = pet.load("NOPE");
		expect(bytes).toEqual([]);
		expect(status).toBe(0x02); // LOAD: ?FILE NOT FOUND
		expect(pet.readStatus()).toBe("62,FILE NOT FOUND,00,00\r");
		expect(pet.readStatus()).toBe("00, OK,00,00\r"); // read: cleared
	});

	it("powers up with the DOS version in the status", () => {
		drive.reset();
		expect(pet.readStatus()).toBe("73,CBM DOS V2.1,00,00\r");
	});

	it("sends the directory as a BASIC program", () => {
		const listing = text(pet.load("$").bytes);
		expect(listing).toContain('"TEST            "');
		expect(listing).toContain('"HELLO"');
		expect(listing).toContain("BLOCKS FREE.");
		const filtered = text(pet.load("$0:D*").bytes);
		expect(filtered).toContain('"DATA"');
		expect(filtered).not.toContain('"HELLO"');
	});

	it("reads a sequential file a byte at a time (GET#: TALK, a byte, UNTALK), losing none", () => {
		pet.open(2, "DATA,S,R");
		const bytes: number[] = [];
		for (let i = 0; i < 8; i++) {
			pet.status = 0;
			pet.talk();
			pet.tksa(0x62);
			bytes.push(pet.acptr() as number);
			pet.untalk();
		}
		expect(text(bytes)).toBe("ONE\rTWO\r");
		expect(pet.status).toBe(0x40);
		pet.close(2);
	});

	it("keeps the files of several channels apart", () => {
		pet.open(2, "DATA");
		pet.open(3, "HELLO");
		expect(pet.readAll(3)).toEqual(HELLO);
		expect(text(pet.readAll(2))).toBe("ONE\rTWO\r");
	});

	it("says FILE TYPE MISMATCH for the wrong type", () => {
		pet.open(2, "HELLO,S,R");
		expect(pet.readStatus()).toBe("64,FILE TYPE MISMATCH,00,00\r");
	});

	it("is write protected: SAVE, writes and the commands that write", () => {
		pet.open(1, "NEW");
		pet.print(1, "DATA");
		pet.close(1);
		expect(pet.readStatus()).toBe("26,WRITE PROTECT ON,00,00\r");
		pet.open(2, "@0:HELLO,P,W");
		expect(pet.readStatus()).toBe("26,WRITE PROTECT ON,00,00\r");
		pet.print(15, "S0:HELLO\r");
		expect(pet.readStatus()).toBe("26,WRITE PROTECT ON,00,00\r");
		expect(pet.load("HELLO").bytes).toEqual(HELLO);
	});

	it("takes commands on channel 15, by OPEN or PRINT#", () => {
		pet.open(15, "UJ");
		expect(pet.readStatus()).toBe("73,CBM DOS V2.1,00,00\r");
		pet.print(15, "I0\r");
		expect(pet.readStatus()).toBe("00, OK,00,00\r");
		pet.print(15, "X\r");
		expect(pet.readStatus()).toBe("31,SYNTAX ERROR,00,00\r");
		pet.close(15);
	});

	it("closing channel 15 closes the files", () => {
		pet.open(2, "DATA");
		pet.open(15, "");
		pet.close(15);
		expect(pet.readAll(2)).toEqual([]);
	});

	it("empty, or drive 1: DRIVE NOT READY", () => {
		expect(pet.load("1:HELLO").bytes).toEqual([]);
		expect(pet.readStatus()).toBe("74,DRIVE NOT READY,00,00\r");
		drive.insert(null);
		expect(pet.load("HELLO").bytes).toEqual([]);
		expect(pet.readStatus()).toBe("74,DRIVE NOT READY,00,00\r");
		expect(pet.load("$").bytes).toEqual([]);
		pet.print(15, "I\r");
		expect(pet.readStatus()).toBe("74,DRIVE NOT READY,00,00\r");
	});

	it("doesn't take an image that isn't a D64", () => {
		expect(() => drive.insert(new Uint8Array(143360))).toThrow("Not a D64 image");
		expect(drive.hasDisk).toBe(false);
	});

	it("an ATN in the middle of a file doesn't lose the byte not taken yet", () => {
		pet.open(2, "BIG");
		pet.talk();
		pet.tksa(0x62);
		const first = [pet.acptr(), pet.acptr()];
		pet.untalk();
		const rest = pet.readAll(2);
		expect([...first, ...rest]).toEqual(BIG);
	});

	it("TALK then UNTALK with no read (CHKIN, then CLRCHN) doesn't lose the byte it put on the bus", () => {
		pet.open(15, "X");
		pet.talk();
		pet.tksa(0x6f);
		pet.untalk(); // releases NRFD (the drive puts its byte), then NDAC, then ATN
		expect(pet.readStatus()).toBe("31,SYNTAX ERROR,00,00\r");
	});

	it("logs the sectors it reads, when asked", () => {
		const log = vi.fn();
		const logged = new CbmDrive(8, log);
		const bus2 = new Ieee488Bus();
		bus2.attach(logged);
		logged.insert(disk());
		const pet2 = new Controller(bus2);
		pet2.load("HELLO");
		expect(log).not.toHaveBeenCalled();
		logged.logging = true;
		pet2.load("BIG");
		expect(log.mock.calls.map((c) => c[1])).toEqual([
			{ type: "READ", block: 2 },
			{ type: "READ", block: 3 },
			{ type: "READ", block: 4 },
			{ type: "READ", block: 5 },
		]);
	});

	it("restores a snapshot: the open files and where they're at", () => {
		pet.open(2, "BIG");
		pet.talk();
		pet.tksa(0x62);
		pet.acptr();
		pet.untalk();
		const saved = drive.snapshot();
		expect(pet.readAll(2)).toEqual(BIG.slice(1));
		drive.restoreSnapshot(saved);
		expect(pet.readAll(2)).toEqual(BIG.slice(1));
	});
});

describe("matchesPattern", () => {
	const m = (pattern: string, name: string) =>
		matchesPattern(
			Uint8Array.from(pattern, (c) => c.charCodeAt(0)),
			Uint8Array.from(name, (c) => c.charCodeAt(0)),
		);
	it("matches exactly, ? one character, * the rest", () => {
		expect(m("ABC", "ABC")).toBe(true);
		expect(m("ABC", "ABCD")).toBe(false);
		expect(m("AB", "ABC")).toBe(false);
		expect(m("A?C", "ABC")).toBe(true);
		expect(m("A*", "ABC")).toBe(true);
		expect(m("*", "")).toBe(true);
		expect(m("A*X", "ABC")).toBe(true); // the DOS ignores what follows the *
		expect(m("ABCD", "ABC")).toBe(false);
	});
});
