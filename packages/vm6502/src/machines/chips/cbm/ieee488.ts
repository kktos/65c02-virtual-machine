// The IEEE-488 bus of the Commodore PET and its devices (disk drives, printers).
//
// Every line is open collector, active low: it is low ("asserted") when any device pulls it, high when all
// release it. So here a set bit means asserted, and the bus is the OR of what everyone asserts. The data lines
// too: a byte's 1 bits are the lines pulled low (the PET writes and reads them inverted, EOR #$FF).
//
// A byte goes over the 3-wire handshake:
//   the talker waits for NRFD released (every listener ready), puts the byte (and EOI on the last one), asserts DAV;
//   each listener asserts NRFD (busy), takes the byte, releases NDAC (accepted);
//   once NDAC is released (all accepted), the talker releases DAV and the data;
//   each listener asserts NDAC again, then releases NRFD when ready for the next byte.
// With ATN asserted, the controller (the PET) sends commands to all the devices: LISTEN / TALK n (an address),
// UNLISTEN / UNTALK, then the secondary address (a channel, with OPEN / CLOSE). Every device takes them: on ATN
// it asserts NDAC at once, so a bus with no device (NRFD and NDAC both up) is "DEVICE NOT PRESENT".
//
// The devices here are virtual: they react at once to each change, between two CPU instructions.

export const ATN = 0x01;
export const DAV = 0x02;
export const NRFD = 0x04;
export const NDAC = 0x08;
export const EOI = 0x10;

export interface IeeeDevice {
	/** The lines the device asserts */
	readonly lines: number;
	/** The data lines it asserts (a byte it puts on the bus) */
	readonly data: number;
	/** The bus changed: the device follows the handshake (its lines may change). */
	update(bus: Ieee488Bus): void;
	/** IFC (the PET's reset): back to idle. */
	reset(): void;
}

/** A device's handshakes settle in a few rounds; more is a device that keeps toggling. */
const MAX_ROUNDS = 16;

export class Ieee488Bus {
	private readonly devices: IeeeDevice[] = [];
	private controllerLines = 0;
	private controllerData = 0;

	attach(device: IeeeDevice) {
		this.devices.push(device);
	}

	/** The lines asserted, by anyone */
	get lines() {
		let lines = this.controllerLines;
		for (const device of this.devices) lines |= device.lines;
		return lines;
	}

	/** The data lines asserted, by anyone */
	get data() {
		let data = this.controllerData;
		for (const device of this.devices) data |= device.data;
		return data;
	}

	isAsserted(line: number) {
		return (this.lines & line) !== 0;
	}

	/** What the controller (the PET) asserts now: the devices react, until the bus is still. */
	setController(lines: number, data: number) {
		if (lines === this.controllerLines && data === this.controllerData) return;
		this.controllerLines = lines;
		this.controllerData = data;
		this.settle();
	}

	reset() {
		this.controllerLines = 0;
		this.controllerData = 0;
		for (const device of this.devices) device.reset();
	}

	/** After a device changed outside of a bus change (a disk inserted, a snapshot restored). */
	settle() {
		for (let round = 0; round < MAX_ROUNDS; round++) {
			const lines = this.lines;
			const data = this.data;
			for (const device of this.devices) device.update(this);
			if (this.lines === lines && this.data === data) return;
		}
	}
}

/** The secondary address's command (bits 7-4); the channel is bits 3-0. */
export type SecondaryKind = "data" | "close" | "open";

/** What a device keeps of the handshake in a save state. */
export type IeeeDeviceState = {
	lines: number;
	data: number;
	listener: boolean;
	talker: boolean;
	addressed: boolean;
	inAtn: boolean;
	accepted: boolean;
};

/**
 * A device on the bus with its address (8 for the first drive): it takes the commands under ATN, listens or
 * talks when addressed. What the bytes mean is the subclass's.
 */
export abstract class IeeeDeviceBase implements IeeeDevice {
	lines = 0;
	data = 0;
	/** Addressed to listen (LISTEN n) / to talk (TALK n) */
	protected listener = false;
	protected talker = false;
	/** Just addressed: the next command is the secondary address */
	private addressed = false;
	/** ATN was asserted at the last update */
	private inAtn = false;
	/** Listening: the byte on the bus is taken (NDAC released), waiting for DAV to go up */
	private accepted = false;

	constructor(public address: number) {}

	/** A secondary address after this device's LISTEN or TALK. */
	protected abstract secondary(kind: SecondaryKind, channel: number): void;
	/** A data byte received (listening, ATN up). */
	protected abstract receive(byte: number, eoi: boolean): void;
	/** UNLISTEN, while listening: the end of what was sent (a file name, a command). */
	protected abstract unlisten(): void;
	/** The byte to send next (talking), or null: nothing to send (the PET times out). Not consumed yet. */
	protected abstract nextByte(): { byte: number; eoi: boolean } | null;
	/** The byte sent was taken by the listeners: on to the next one. */
	protected abstract byteTaken(): void;

	reset() {
		this.lines = this.data = 0;
		this.listener = this.talker = this.addressed = this.inAtn = this.accepted = false;
	}

	update(bus: Ieee488Bus) {
		if (bus.isAsserted(ATN)) {
			if (!this.inAtn) {
				// Every device listens to the commands: stop talking, "not accepted yet", ready
				this.inAtn = true;
				this.accepted = false;
				this.data = 0;
				this.lines = NDAC;
			}
			this.listen(bus, true);
			return;
		}
		if (this.inAtn) {
			this.inAtn = false;
			this.addressed = false;
			// Turnaround: a talker drives DAV / data and leaves NRFD / NDAC to the listeners
			this.lines = this.listener ? NDAC : 0;
		}
		if (this.listener) this.listen(bus, false);
		else if (this.talker) this.talk(bus);
	}

	/** Listener side of the handshake: take the byte on DAV, get ready again when DAV goes up. */
	private listen(bus: Ieee488Bus, atn: boolean) {
		const dav = bus.isAsserted(DAV);
		if (dav && !this.accepted) {
			this.accepted = true;
			this.lines = NRFD; // busy, NDAC released: taken
			const byte = bus.data;
			const eoi = bus.isAsserted(EOI);
			if (atn) this.atnCommand(byte);
			else this.receive(byte, eoi);
		} else if (!dav && this.accepted) {
			this.accepted = false;
			this.lines = NDAC; // ready for the next byte
		}
	}

	/** Talker side: a byte when the listeners are ready, the next one once they took it. */
	private talk(bus: Ieee488Bus) {
		if (this.lines & DAV) {
			if (bus.isAsserted(NDAC)) return;
			// A listener takes a byte by going busy (NRFD) before it releases NDAC. Both up: nobody took it, the
			// controller is taking the bus back (UNTALK after a CHKIN with no read): the byte stays for later.
			if (bus.isAsserted(NRFD)) this.byteTaken();
			this.lines = 0;
			this.data = 0;
			return;
		}
		// Ready (NRFD up) and listening (NDAC down: someone is there and waits for a byte)
		if (bus.isAsserted(NRFD) || !bus.isAsserted(NDAC)) return;
		const next = this.nextByte();
		if (!next) return;
		this.data = next.byte & 0xff;
		this.lines = DAV | (next.eoi ? EOI : 0);
	}

	private atnCommand(byte: number) {
		const wasAddressed = this.addressed;
		this.addressed = false;
		const group = byte & 0xe0;
		const address = byte & 0x1f;
		if (group === 0x20) {
			// LISTEN n / UNLISTEN ($3F)
			if (address === 0x1f) {
				if (this.listener) {
					this.listener = false;
					this.unlisten();
				}
			} else if (address === this.address) {
				this.listener = true;
				this.addressed = true;
			}
		} else if (group === 0x40) {
			// TALK n / UNTALK ($5F): another talker unaddresses this one
			if (address === this.address) {
				this.talker = true;
				this.listener = false;
				this.addressed = true;
			} else this.talker = false;
		} else if (byte >= 0x60 && wasAddressed) {
			const kind = byte >= 0xf0 ? "open" : byte >= 0xe0 ? "close" : "data";
			this.secondary(kind, byte & 0x0f);
		}
	}

	protected handshakeState(): IeeeDeviceState {
		const { lines, data, listener, talker, addressed, inAtn, accepted } = this;
		return { lines, data, listener, talker, addressed, inAtn, accepted };
	}

	protected restoreHandshake(state: IeeeDeviceState) {
		({
			lines: this.lines,
			data: this.data,
			listener: this.listener,
			talker: this.talker,
			addressed: this.addressed,
			inAtn: this.inAtn,
			accepted: this.accepted,
		} = state);
	}
}
