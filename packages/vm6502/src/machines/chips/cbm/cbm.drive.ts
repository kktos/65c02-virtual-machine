import { D64Image, directoryListing } from "@/lib/disk/d64";
import { IeeeDeviceBase, type IeeeDeviceState, type SecondaryKind } from "./ieee488";

/** Channel 15: commands in, the status (the error channel) out. 0: LOAD, 1: SAVE, 2-14: data files. */
const COMMAND_CHANNEL = 15;

const MESSAGES: Record<number, string> = {
	0: " OK",
	26: "WRITE PROTECT ON",
	31: "SYNTAX ERROR",
	33: "SYNTAX ERROR",
	34: "SYNTAX ERROR",
	62: "FILE NOT FOUND",
	64: "FILE TYPE MISMATCH",
	70: "NO CHANNEL",
	73: "CBM DOS V2.1", // the 4040's DOS: at power-up and after a reset command
	74: "DRIVE NOT READY",
};
const POWER_UP = 73;

const FILE_TYPE_LETTERS: Record<string, string> = { P: "PRG", S: "SEQ", U: "USR", L: "REL" };
const MODE_LETTERS = "RWAM"; // read, write, append, modify

type Channel = { data: Uint8Array; pos: number };

export type DriveLog = (text: string, payload: { type: string; block: number }) => void;

export type CbmDriveSnapshot = {
	handshake: IeeeDeviceState;
	image: Uint8Array | null;
	channels: (Channel | null)[];
	status: number;
	statusPos: number;
	naming: number | null;
	received: number[];
	current: number;
};

const text = (bytes: Iterable<number>) => String.fromCharCode(...bytes);
const bytesOf = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

/** A name against a pattern: "?" any character, "*" anything from there on. */
export const matchesPattern = (pattern: Uint8Array, name: Uint8Array) => {
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i];
		if (c === 0x2a) return true; // *
		if (i >= name.length) return false;
		if (c !== 0x3f && c !== name[i]) return false; // ?
	}
	return pattern.length === name.length;
};

/**
 * A Commodore 4040 disk drive, from the outside: what its DOS answers on the IEEE-488 bus (not its CPUs and
 * ROMs). Drive 0 takes a D64 image, drive 1 is empty. Read-only: LOAD, OPEN / GET# / INPUT# of the files,
 * `LOAD"$",8`, the status on channel 15, the commands I and UJ; what would write (SAVE, the S / R / N / C / V
 * commands) gets "26,WRITE PROTECT ON".
 */
export class CbmDrive extends IeeeDeviceBase {
	logging = false;
	private image: D64Image | null = null;
	private channels: (Channel | null)[] = Array.from({ length: 16 }, () => null);
	private status = POWER_UP;
	/** The status message read so far (channel 15) */
	private statusPos = 0;
	/** OPEN on that channel: the bytes received are the file name */
	private naming: number | null = null;
	/** The file name or the command, received so far */
	private received: number[] = [];
	/** The channel of the last data secondary address */
	private current = 0;

	constructor(
		address = 8,
		private readonly log?: DriveLog,
	) {
		super(address);
	}

	/** A D64 image in drive 0, or none. Throws if it isn't one (the drive is then empty). */
	insert(data: Uint8Array | null) {
		this.closeAll();
		this.image = null;
		if (data) this.image = new D64Image(data);
	}

	get hasDisk() {
		return this.image !== null;
	}

	override reset() {
		super.reset();
		this.closeAll();
		this.setStatus(POWER_UP);
		this.naming = null;
		this.received = [];
		this.current = 0;
	}

	/** The status message, as channel 15 sends it: "62,FILE NOT FOUND,00,00" and a CR. */
	get statusMessage() {
		const code = this.status.toString().padStart(2, "0");
		return `${code},${MESSAGES[this.status] ?? "SYNTAX ERROR"},00,00\r`;
	}

	protected secondary(kind: SecondaryKind, channel: number) {
		if (kind === "open") {
			this.channels[channel] = null;
			this.naming = channel;
			this.received = [];
		} else if (kind === "close") {
			if (channel === COMMAND_CHANNEL) this.closeAll();
			else this.channels[channel] = null;
		} else {
			this.current = channel;
			if (channel === COMMAND_CHANNEL) this.received = [];
		}
	}

	protected receive(byte: number, _eoi: boolean) {
		// A file name, or a command; bytes to write go nowhere (no file is open for writing)
		if (this.naming !== null || this.current === COMMAND_CHANNEL) this.received.push(byte);
	}

	protected unlisten() {
		const received = this.received;
		this.received = [];
		if (this.naming !== null) {
			const channel = this.naming;
			this.naming = null;
			if (channel === COMMAND_CHANNEL) this.command(received);
			else this.open(channel, received);
		} else if (this.current === COMMAND_CHANNEL && received.length) this.command(received);
	}

	protected nextByte() {
		if (this.current === COMMAND_CHANNEL) {
			const message = this.statusMessage;
			return { byte: message.charCodeAt(this.statusPos), eoi: this.statusPos === message.length - 1 };
		}
		const channel = this.channels[this.current];
		if (!channel || channel.pos >= channel.data.length) return null;
		return { byte: channel.data[channel.pos] as number, eoi: channel.pos === channel.data.length - 1 };
	}

	protected byteTaken() {
		if (this.current === COMMAND_CHANNEL) {
			// The whole message read: the error is cleared
			if (++this.statusPos >= this.statusMessage.length) this.setStatus(0);
			return;
		}
		const channel = this.channels[this.current];
		if (channel) channel.pos++;
	}

	private setStatus(code: number) {
		this.status = code;
		this.statusPos = 0;
	}

	private closeAll() {
		this.channels.fill(null);
	}

	/** OPEN: `[@][drive:]name[,type][,mode]`, `$[drive][:pattern]` for the directory. */
	private open(channel: number, nameBytes: number[]) {
		let spec = text(nameBytes).replace(/\r$/, "");
		const replace = spec.startsWith("@"); // save-with-replace: a write
		if (replace) spec = spec.slice(1);

		if (spec.startsWith("#")) return this.setStatus(70); // direct access buffers: not emulated
		if (spec.startsWith("$")) return this.openDirectory(channel, spec.slice(1));

		const drive = spec.match(/^([0-9]?):/);
		if (drive) spec = spec.slice(drive[0].length);
		if (drive?.[1] && drive[1] !== "0") return this.setStatus(74);

		const [name = "", ...params] = spec.split(",");
		let type: string | undefined;
		let mode = channel === 0 ? "R" : channel === 1 ? "W" : "R";
		for (const param of params) {
			const letter = param.charAt(0);
			if (FILE_TYPE_LETTERS[letter]) type = FILE_TYPE_LETTERS[letter];
			else if (MODE_LETTERS.includes(letter) && letter) mode = letter;
		}

		if (!this.image) return this.setStatus(74);
		if (replace || mode !== "R") return this.setStatus(26);
		if (!name) return this.setStatus(34);

		const pattern = bytesOf(name);
		const found = this.image.directory().filter((e) => e.closed && matchesPattern(pattern, e.name));
		if (!found.length) return this.setStatus(62);
		const entry = type ? found.find((e) => e.type === type) : found[0];
		if (!entry) return this.setStatus(64);

		const { data, sectors } = this.image.readChain(entry.track, entry.sector);
		if (this.logging && this.log)
			for (const block of sectors) this.log(`READ ${text(entry.name)} block=${block}`, { type: "READ", block });
		this.channels[channel] = { data, pos: 0 };
		this.setStatus(0);
	}

	/** The directory as a BASIC program, on any channel (the DOS sends its raw sectors on channels 2-14). */
	private openDirectory(channel: number, spec: string) {
		const m = spec.match(/^([0-9]?)(?::(.*))?$/);
		if (!m) return this.setStatus(33);
		if (m[1] && m[1] !== "0") return this.setStatus(74);
		if (!this.image) return this.setStatus(74);
		const pattern = m[2] ? bytesOf(m[2]) : null;
		const data = directoryListing(this.image, 0, pattern ? (name) => matchesPattern(pattern, name) : undefined);
		this.channels[channel] = { data, pos: 0 };
		this.setStatus(0);
	}

	/** A command on channel 15 (its trailing CR left out). */
	private command(bytes: number[]) {
		const cmd = text(bytes).replace(/\r$/, "");
		if (!cmd) return;
		const letter = cmd.charAt(0);
		if (letter === "I") return this.setStatus(this.image ? 0 : 74); // initialize: reads the BAM again
		if (letter === "U" && "J:I".includes(cmd.charAt(1)) && cmd.length >= 2) {
			// UJ / U: / UI: reset the drive
			this.closeAll();
			return this.setStatus(POWER_UP);
		}
		// scratch, rename, new (format), copy, validate, duplicate: they write
		if ("SRNCVD".includes(letter)) return this.setStatus(this.image ? 26 : 74);
		this.setStatus(31);
	}

	snapshot(): CbmDriveSnapshot {
		return {
			handshake: this.handshakeState(),
			// The image and the files' bytes are shared, not copied: nothing writes them
			image: this.image?.data ?? null,
			channels: this.channels.map((c) => c && { ...c }),
			status: this.status,
			statusPos: this.statusPos,
			naming: this.naming,
			received: [...this.received],
			current: this.current,
		};
	}

	restoreSnapshot(state: CbmDriveSnapshot) {
		this.restoreHandshake(state.handshake);
		this.image = state.image ? new D64Image(state.image) : null;
		this.channels = state.channels.map((c) => c && { ...c });
		this.status = state.status;
		this.statusPos = state.statusPos;
		this.naming = state.naming;
		this.received = [...state.received];
		this.current = state.current;
	}
}
