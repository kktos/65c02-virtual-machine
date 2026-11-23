import { type PatternMatch, searchPattern } from "@/lib/patternSearch.lib";
import type { Dict } from "@/types/dict.type";
import type { BusOptions, DeviceConfig, LoadedDevice } from "@/types/machine.interface";
import type {
	IBus,
	InterruptLines,
	KeyboardState,
	MachineStateSpec,
	TextMode,
	TextScreenOptions,
} from "@/types/bus.interface";
import {
	INPUT_ANALOG_0_OFFSET,
	INPUT_ANALOG_1_OFFSET,
	INPUT_DIGITAL_OFFSET,
	MACHINE_STATE_OFFSET1,
	MACHINE_STATE_OFFSET2,
	MACHINE_STATE_OFFSET3,
	REG_BANKSEL_OFFSET,
	REG_BORDERCOLOR_OFFSET,
	REG_TBCOLOR_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import { generateApple2Assets } from "./bus/apple.assets";
import type { InterruptsState } from "@/types/interrupts.interface";
import { IMU, IMU_IDS } from "../chips/imu";
import { loadMemoryChunks } from "./bus/apple.loader";
import { APPLE_SEARCH_REGIONS } from "./bus/apple.search";
import { installSoftSwitches } from "./bus/apple.switches";
import { type AppleCardId, slotsConfig } from "./conf/slots.conf";
import {
	type AppleDevice,
	type AppleDeviceClass,
	type AppleDeviceWiring,
	type AppleKeyboardDevice,
	isKeyboardDevice,
} from "./devices/device.interface";
import {
	APPLE_80COL_MASK,
	APPLE_ALTCHAR_MASK,
	APPLE_ALTZP_MASK,
	APPLE_DBLRES_MASK,
	APPLE_HIRES_MASK,
	APPLE_INTC8ROM_MASK,
	APPLE_INTCXROM_MASK,
	APPLE_LC_BANK2_MASK,
	APPLE_LC_READRAM_MASK,
	APPLE_LC_WRITERAM_MASK,
	APPLE_MIXED_MASK,
	APPLE_PAGE2_MASK,
	APPLE_RAMRD_AUX_MASK,
	APPLE_RAMWR_AUX_MASK,
	APPLE_SLOTC3ROM_MASK,
	APPLE_STORE80_MASK,
	APPLE_TEXT_MASK,
	APPLE_VIDEO7_REG_MASK,
	APPLE_VIDEO7_REG_SHIFT,
	LC_AUX_BANK2_OFFSET,
	LC_MAIN_BANK2_OFFSET,
	LC_ROM_OFFSET,
	RAM_OFFSET,
} from "./shared-memory.consts";
import { MockingboardCard } from "./slots/mockingboard/mockingboard.card";
import { MouseCard } from "./slots/mouse.card";
import type { ISlotCard } from "./slots/slotcard.interface";
import { SmartPortCard } from "./slots/smartport.card";
import { ThunderClockCard } from "./slots/thunderclock.card";
import { type AudioSource, Speaker } from "./speaker";
import { readTextScreen } from "./video/text.screen";
import { PWREDUP, SOFTEV_HI } from "./bus/symbols.consts";
import { type AppleBusSnapshot, SNAPSHOT_FIELDS, type SnapshotField } from "./bus/apple.snapshot";
import type { KeyboardSnapshot } from "./devices/keyboard.device";

// IIgs default colors - white on blue
const DEFAULT_TEXT_COLORS = 0xf2;
/** The I/O addresses a device can take: the slots' ($C090-$C0FF), $C000-$C08F being the //e's own soft switches. */
const DEVICE_IO_START = 0xc090;
const DEVICE_IO_END = 0xc0ff;
/** The soft switches a device can take over (`switches`): the //e's own. */
const DEVICE_SWITCHES_START = 0xc000;
const DEVICE_SWITCHES_END = 0xc08f;
/** Slot 3's I/O space up to here is the IMU's registers (see IMU.md). */
const IMU_IO_START = 0xc0b0;
const IMU_IO_END = 0xc0b7;
/**
 * The devices that count cycles (sound, timers, polled inputs) are ticked lazily: in batches of at most this many
 * cycles, sooner when one of them has an event due (`nextEvent`: an interrupt), and before an access to their I/O.
 */
const MAX_TICK_BATCH = 1024;
/** What an access to a $C000-$CFFF address brings up to date first (`ioSync`; 0: nothing). */
const SYNC_SPEAKER = 1;
const SYNC_ALL = 2;

/** A tick handler, and the cycle it was last brought up to (`AppleBus.totalCycles`). */
type TickHandler = { tick: (cycles: number) => void; nextEvent?: () => number; last: number };

const hex4 = (value: number) => `$${value.toString(16).toUpperCase().padStart(4, "0")}`;
/** Builds a card for a slot, `rom` being its $Cn00-$CnFF space (in slotRoms). One per card of slotsConfig. */
const CARD_FACTORIES: Record<AppleCardId, (bus: AppleBus, slot: number, rom: Uint8Array) => ISlotCard> = {
	smartport: (bus, slot, rom) => new SmartPortCard(bus, slot, rom),
	mouse: (bus, slot, rom) => new MouseCard(bus, slot, rom),
	thunderclock: (bus, slot, rom) => new ThunderClockCard(bus, slot, rom),
	mockingboard: (bus, slot) => new MockingboardCard(bus, slot),
};

const isCardId = (id: string): id is AppleCardId => Object.hasOwn(CARD_FACTORIES, id);

const isAudioSource = (card: ISlotCard): card is ISlotCard & AudioSource =>
	typeof (card as Partial<AudioSource>).render === "function";

const MEM_SCOPES = ["main", "aux", "io", "int_rom", "slot_rom", "rom", "lc_bank1", "lc_bank2"];
type MemScopeOverride = { lcView: "BANK2" | "BANK1" | "ROM" | "AUTO"; lcAux: "MAIN" | "AUX"; cxView: "INT" | "SLOT" };

export class AppleBus implements IBus {
	public memory: Uint8Array;
	private registers?: DataView;

	// Private storage for the system ROM ($D000-$FFFF)
	public rom: Uint8Array;
	// Private storage for Language Card Bank 2 RAM Bank 0 (main) ($D000-$DFFF)
	public bank2: Uint8Array;
	// Private storage for Language Card Bank 2 RAM Bank 1 (aux) ($D000-$DFFF)
	public auxbank2: Uint8Array;

	// Internal ROM ($C100-$CFFF) mapped to main RAM bank
	public romC: Uint8Array;
	// Slot ROMs ($C100-$CFFF) mapped to aux RAM bank
	public slotRoms: Uint8Array;

	// Slot System
	public slots: (ISlotCard | null)[] = (Array.from({ length: 8 }) as (ISlotCard | null)[]).fill(null);
	private activeExpansionSlot = 0;

	// Language Card State
	public lcBank2 = false; // false = Bank 1 ($D000), true = Bank 2 ($D000)
	public lcReadRam = false; // false = Read ROM, true = Read RAM
	public lcWriteRam = false; // false = Write Protect, true = Write Enable
	public lcPreWriteCount = 0; // Counter for the double-read write enable mechanism

	// Main/Aux Memory State
	public store80 = false;
	public ramRdAux = false; // Read from Aux memory ($0200-$BFFF)
	public ramWrAux = false; // Write to Aux memory ($0200-$BFFF)
	public altZp = false; // Use Aux for ZP/Stack and LC area
	public auxMemBank = 1;

	// Slot ROM State
	public intCxRom = false; // false = Slot, true = Internal
	public intC8Rom = false; // Hardware hack for Slot 3 (Internal C800)
	public slotC3Rom = false; // false = Internal, true = Slot

	// Video State
	public col80 = false; // 80 Column Store/Display
	public altChar = false; // Alternate Character Set
	public text = true; // Text Mode
	public mixed = false; // Mixed Mode
	public page2 = false; // Page 2
	public hires = false; // Hi-Res Mode
	public fakingVBL = false;
	public dblRes = false;

	// Video-7 State
	public video7Register = 0; // 2-bit register for extended modes
	// public video7BitToPush = 0; // 0 or 1, set by 80COL softswitches
	public video7SeqState = 0; // 0=idle, 1=CLRAN3 seen
	public video7NextBit = 0; // 0=pushing bit 0, 1=pushing bit 1

	public tbColor = DEFAULT_TEXT_COLORS; // IIgs text/bg color (black bg, white text)
	public brdrColor = DEFAULT_TEXT_COLORS & 0x0f; // IIgs border color

	/** The keyboard: a device (conf/devices.conf.ts), none until installed. Without it, nothing is ever typed. */
	public keyboard?: AppleKeyboardDevice;

	// Game I/O / Pushbutton State (the Apple keys are the keyboard's)
	public joy_pb0 = false; // from joystick
	public joy_pb1 = false; // from joystick
	public joy_pb2 = false; // from joystick
	public joy_pb3 = false; // from joystick

	get pb0() {
		return (this.keyboard?.openApple ?? false) || this.joy_pb0;
	}
	get pb1() {
		return (this.keyboard?.solidApple ?? false) || this.joy_pb1;
	}

	// Paddles
	public paddleValues: [number, number, number, number] = [127, 127, 127, 127]; // 0-255, from joystick
	public paddleTimers: [number, number, number, number] = [0, 0, 0, 0];
	public totalCycles = 0;

	// Speaker State
	public speaker: Speaker;

	private tickHandlers: TickHandler[] = [];
	/** `totalCycles` at which the handlers are ticked next (see MAX_TICK_BATCH). */
	private flushAt = 0;
	/** Per $C000-$CFFF address, what is brought up to date before an access to it: nothing (0), SYNC_SPEAKER / ALL. */
	private readonly ioSync = new Uint8Array(0x1000);

	// The CPU's interrupt inputs (see setInterruptLines)
	private lines?: InterruptLines;
	/**
	 * The interrupt controller (see IMU.md): ID n is slot n's IRQ (1-7), the devices take the IDs from 8, its registers at
	 * $C0B0-$C0B7 (slot 3's I/O). Disabled, it ORs its lines into the CPU's IRQ line.
	 */
	public readonly imu = new IMU({ irq: (active) => this.lines?.irq(active) });
	/** The built-in periodic interrupt source (IMU ID 8), its registers at $C0B8-$C0BF. */
	/** The devices besides the slot cards (`installDevices`), in their config's order. */
	private readonly devices: { config: DeviceConfig; wiring: AppleDeviceWiring; device: AppleDevice }[] = [];
	// The card id in each slot (for the debugger's interrupt sources)
	private readonly cardIds: (AppleCardId | undefined)[] = [];

	// Soft Switch Dispatch Tables (0xC000 - 0xC0FF)
	private readHandlers: Array<() => number>;
	private writeHandlers: Array<(val: number) => void>;

	/** `options.slots`: the cards, by slot (default: slotsConfig's). */
	constructor(memory: Uint8Array, options: BusOptions = {}) {
		this.memory = memory;

		if (memory.length % 0x10000 < RAM_OFFSET) throw new Error("Not enough memory for Apple Bus");

		// Map Bank 2 and ROM to the beginning of shared memory
		// Main Bank 2: 0x0000 - 0x0FFF (4KB)
		this.bank2 = this.memory.subarray(LC_MAIN_BANK2_OFFSET, LC_MAIN_BANK2_OFFSET + 0x1000);
		// Aux Bank 2: 0x0000 - 0x0FFF (4KB)
		this.auxbank2 = this.memory.subarray(LC_AUX_BANK2_OFFSET, LC_AUX_BANK2_OFFSET + 0x1000);
		// ROM: 0x1000 - 0x3FFF (12KB)
		this.rom = this.memory.subarray(LC_ROM_OFFSET, LC_ROM_OFFSET + 0x3000);

		// Internal C-ROM: $C100-$CFFF in main RAM
		this.romC = this.memory.subarray(RAM_OFFSET + 0xc100, RAM_OFFSET + 0xd000);
		// Slot ROMs: $C100-$CFFF in aux RAM
		this.slotRoms = this.memory.subarray(RAM_OFFSET + 0x1c100, RAM_OFFSET + 0x1d000);

		// Before the cards: a sound card mixes into its output
		this.speaker = new Speaker(this);

		for (const [key, cardId] of Object.entries(options.slots ?? slotsConfig.default)) {
			const slot = Number(key);
			if (!isCardId(cardId) || !Number.isInteger(slot) || slot < 1 || slot > slotsConfig.count) {
				console.error(`AppleBus: no card "${cardId}" for slot ${key}`);
				continue;
			}
			const rom = this.slotRoms.subarray((slot - 1) * 0x100, slot * 0x100);
			this.installCard(CARD_FACTORIES[cardId](this, slot, rom));
			this.cardIds[slot] = cardId;
		}

		const handlers = installSoftSwitches(this);
		this.readHandlers = handlers.readHandlers;
		this.writeHandlers = handlers.writeHandlers;

		// The speaker's level, the joystick's buttons and paddles (polled by the handler below), the IMU's registers
		this.ioSync.fill(SYNC_SPEAKER, 0x030, 0x040);
		this.ioSync.fill(SYNC_ALL, 0x061, 0x064);
		this.ioSync[0x070] = SYNC_ALL;
		this.ioSync.fill(SYNC_ALL, IMU_IO_START - 0xc000, IMU_IO_END - 0xc000 + 1);

		this.registerTickHandler((_cycles) => {
			const registers = this.registers as DataView<ArrayBufferLike>;

			// Read analog inputs as floats and convert to 0-255 byte
			const axisX = registers.getFloat32(INPUT_ANALOG_0_OFFSET, true); // -1.0 to 1.0
			const axisY = registers.getFloat32(INPUT_ANALOG_1_OFFSET, true); // -1.0 to 1.0

			// axisX = Math.round((axisX + Number.EPSILON) * 10) / 10;
			// axisY = Math.round((axisY + Number.EPSILON) * 10) / 10;

			// Convert float to paddle value.
			this.paddleValues[0] = Math.max(0, Math.min(255, Math.round(((axisX + 1) / 2) * 255)));
			this.paddleValues[1] = Math.max(0, Math.min(255, Math.round(((axisY + 1) / 2) * 255)));

			// Read digital inputs
			const digital1 = registers.getUint8(INPUT_DIGITAL_OFFSET);
			this.joy_pb0 = (digital1 & 0b0000_0001) !== 0;
			this.joy_pb1 = (digital1 & 0b0000_0010) !== 0;
			this.joy_pb2 = (digital1 & 0b0000_0100) !== 0;
			this.joy_pb3 = (digital1 & 0b0000_1000) !== 0;
		});
	}

	/**
	 * `handler` gets the cycles gone by since its last call: not after every instruction, but in batches (see
	 * MAX_TICK_BATCH). `nextEvent`: the cycles from then until it must be called (when it raises an interrupt), as
	 * it is now; Infinity when nothing is coming. An access to its I/O must bring it up to date first (`ioSync`).
	 */
	public registerTickHandler(handler: (cycles: number) => void, nextEvent?: () => number) {
		this.tickHandlers.push({ tick: handler, nextEvent, last: this.totalCycles });
		this.flushAt = this.totalCycles; // its next event, from the next instruction
	}

	public unregisterTickHandler(handler: (cycles: number) => void) {
		const index = this.tickHandlers.findIndex(({ tick }) => tick === handler);
		if (index > -1) this.tickHandlers.splice(index, 1);
	}

	public tick(deltaCycles: number): void {
		if (deltaCycles <= 0) return;
		this.totalCycles += deltaCycles;
		if (this.totalCycles >= this.flushAt) this.flushTicks();
	}

	/** Brings every tick handler up to `totalCycles`, then sets when they are ticked next. */
	public flushTicks() {
		for (let index = 0; index < this.tickHandlers.length; index++) this.syncHandler(this.tickHandlers[index]!);
		this.scheduleTicks();
	}

	private syncHandler(handler: TickHandler) {
		const cycles = this.totalCycles - handler.last;
		if (cycles <= 0) return;
		handler.last = this.totalCycles;
		handler.tick(cycles);
	}

	/** The next batch: in MAX_TICK_BATCH cycles at most, at the first handler's event if sooner. */
	private scheduleTicks() {
		let at = this.totalCycles + MAX_TICK_BATCH;
		for (let index = 0; index < this.tickHandlers.length; index++) {
			const { nextEvent, last } = this.tickHandlers[index]!;
			if (!nextEvent) continue;
			const due = last + nextEvent();
			if (due < at) at = due;
		}
		this.flushAt = at;
	}

	/** `totalCycles` was set (reset, restored state): the handlers count from there, nothing pending. */
	private restartTicks() {
		for (const handler of this.tickHandlers) handler.last = this.totalCycles;
		this.scheduleTicks();
	}

	/** Before an access to an I/O address: what it reads or changes is brought up to date. */
	private syncIo(sync: number) {
		if (sync === SYNC_ALL) {
			for (let index = 0; index < this.tickHandlers.length; index++) this.syncHandler(this.tickHandlers[index]!);
			return;
		}
		// The speaker alone: its level changes, the samples so far are at the previous one
		const speakerTick = this.speaker.tickHandler;
		for (let index = 0; index < this.tickHandlers.length; index++)
			if (this.tickHandlers[index]!.tick === speakerTick) this.syncHandler(this.tickHandlers[index]!);
	}

	public installCard(card: ISlotCard) {
		if (this.slots[card.slot]) {
			console.error(`Slot ${card.slot} already installed !`);
			return;
		}
		this.slots[card.slot] = card;
		if (this.registers && card.setRegisters) card.setRegisters(this.registers);
		if (card.tick) {
			this.registerTickHandler(card.tick.bind(card), card.nextEvent?.bind(card));
			// Its I/O ($C0n0-$C0nF) and ROM ($Cn00-$CnFF) spaces
			this.ioSync.fill(SYNC_ALL, 0x080 + card.slot * 0x10, 0x090 + card.slot * 0x10);
			this.ioSync.fill(SYNC_ALL, card.slot * 0x100, (card.slot + 1) * 0x100);
		}
		if (isAudioSource(card)) this.speaker.addSource(card);
	}

	/**
	 * Builds the devices and wires them: their registers over the I/O addresses of `options.io` (in the slots' I/O
	 * space), the //e's soft switches of `options.switches` taken over ($C000-$C08F), none taken by a card, the IMU or
	 * another device; their line to the IMU ID `options.irq` (8-15, free). The keyboard (at most one) is also given
	 * the host's keys. One that can't be wired is logged and left out.
	 */
	public installDevices(devices: LoadedDevice[]) {
		for (const { config, Class } of devices) {
			const options = { ...config.options };
			const wiring: AppleDeviceWiring = {
				io: options.io as AppleDeviceWiring["io"],
				switches: options.switches as AppleDeviceWiring["switches"],
				irq: options.irq as number,
			};
			const error = this.deviceWiringError(config, wiring);
			if (error) {
				console.error(`AppleBus: device "${config.id}" not installed: ${error}`);
				continue;
			}
			const { irq, io, switches } = wiring;
			const setIrq = irq === undefined ? () => {} : (active: boolean) => this.imu.setLine(irq, active);
			const device = new (Class as AppleDeviceClass)({ bus: this, setIrq, options });
			if (isKeyboardDevice(device)) {
				if (this.keyboard) {
					console.error(`AppleBus: device "${config.id}" not installed: there is a keyboard already`);
					continue;
				}
				this.keyboard = device;
			}
			this.devices.push({ config, wiring, device });

			if (io) {
				for (let offset = 0; offset < io.size; offset++) {
					const index = (io.address + offset) & 0xff;
					this.readHandlers[index] = () => device.read?.(offset) ?? 0;
					this.writeHandlers[index] = (value) => device.write?.(offset, value);
				}
			}
			for (const address of switches?.read ?? [])
				this.readHandlers[address & 0xff] = () => device.readSwitch?.(address) ?? 0;
			for (const address of switches?.write ?? [])
				this.writeHandlers[address & 0xff] = (value) => device.writeSwitch?.(address, value);
			if (device.tick) {
				this.registerTickHandler(device.tick.bind(device), device.nextEvent?.bind(device));
				if (io) this.ioSync.fill(SYNC_ALL, io.address - 0xc000, io.address - 0xc000 + io.size);
				for (const address of [...(switches?.read ?? []), ...(switches?.write ?? [])])
					this.ioSync[address & 0xff] = SYNC_ALL;
			}
			device.reset?.();
		}
	}

	private deviceWiringError({ id }: DeviceConfig, { io, switches, irq }: AppleDeviceWiring): string | undefined {
		if (this.devices.some((other) => other.config.id === id)) return "its id is already taken";
		if (irq !== undefined) {
			if (!Number.isInteger(irq) || irq <= slotsConfig.count || irq >= IMU_IDS) return `no IMU ID ${irq}`;
			if (this.devices.some((other) => other.wiring.irq === irq)) return `IMU ID ${irq} already taken`;
		}
		if (io) {
			const { address, size } = io;
			const end = address + size - 1;
			if (
				!Number.isInteger(address) ||
				!Number.isInteger(size) ||
				size < 1 ||
				address < DEVICE_IO_START ||
				end > DEVICE_IO_END
			)
				return `no I/O range ${hex4(address)}+${size} (it must be in ${hex4(DEVICE_IO_START)}-${hex4(DEVICE_IO_END)})`;
			const overlaps = (start: number, last: number) => address <= last && end >= start;
			if (overlaps(IMU_IO_START, IMU_IO_END)) return `${hex4(address)}-${hex4(end)} overlaps the IMU's registers`;
			for (let slot = 1; slot <= slotsConfig.count; slot++) {
				const slotIo = 0xc080 + slot * 0x10;
				if (this.slots[slot] && overlaps(slotIo, slotIo + 0x0f))
					return `${hex4(address)}-${hex4(end)} overlaps slot ${slot}'s card`;
			}
		}
		for (const address of [...(switches?.read ?? []), ...(switches?.write ?? [])]) {
			if (!Number.isInteger(address) || address < DEVICE_SWITCHES_START || address > DEVICE_SWITCHES_END)
				return `no soft switch ${hex4(address)} (it must be in ${hex4(DEVICE_SWITCHES_START)}-${hex4(DEVICE_SWITCHES_END)})`;
		}
		// What the others took, by access (their I/O range both ways)
		const claims = (wiring: AppleDeviceWiring, access: "read" | "write") => {
			const range = wiring.io;
			const ioAddresses = range ? Array.from({ length: range.size }, (_, offset) => range.address + offset) : [];
			return [...ioAddresses, ...(wiring.switches?.[access] ?? [])];
		};
		for (const access of ["read", "write"] as const) {
			const mine = claims({ io, switches }, access);
			for (const other of this.devices) {
				const taken = claims(other.wiring, access).find((address) => mine.includes(address));
				if (taken !== undefined) return `${hex4(taken)} (${access}) is already device "${other.config.id}"'s`;
			}
		}
	}

	public setInterruptLines(lines: InterruptLines) {
		this.lines = lines;
		this.updateIrq();
		lines.irq(this.imu.irqActive);
	}

	/** The cards' IRQs, to the IMU: slot n on ID n (a card calls it when its own changes). */
	public updateIrq() {
		for (let slot = 1; slot < this.slots.length; slot++) this.imu.setLine(slot, this.slots[slot]?.irq ?? false);
	}

	public irqVector(sp: number) {
		return this.imu.irqVector(sp);
	}

	public onRti(sp: number) {
		this.imu.onRti(sp);
	}

	/** ID n: the card in slot n (IDs 0 and 3: nothing), or the device wired to it. */
	public getInterrupts(): InterruptsState {
		this.flushTicks();
		const sources = Array.from({ length: IMU_IDS }, (_, id) => {
			const cardId = this.cardIds[id];
			const device = this.devices.find(({ wiring }) => wiring.irq === id);
			if (device) {
				const { config, wiring } = device;
				return `${config.label ?? config.id}${wiring.io ? ` (${hex4(wiring.io.address)})` : ""}`;
			}
			if (!cardId) return null;
			return `Slot ${id}: ${slotsConfig.cards?.find((card) => card.id === cardId)?.label ?? cardId}`;
		});
		return { ...this.imu.getState(), sources };
	}

	public initAudio(sampleRate: number): void {
		this.speaker.init(sampleRate);
		console.log("AppleBus audio initialized");
	}

	public enableAudio?(isEnabled: boolean) {
		this.speaker.setEnabled(isEnabled);
	}

	public setClockSpeed(mhz: number): void {
		this.speaker.setClockSpeed(mhz);
	}

	public setRegistersView(view: DataView) {
		this.registers = view;
		this.slots.forEach((card) => {
			card?.setRegisters?.(view);
		});
	}

	/** The slot of the card a disk goes in when the metadata names none: the first that takes one (0: none). */
	private get diskSlot() {
		return Math.max(
			0,
			this.slots.findIndex((card) => card?.insertMedia),
		);
	}

	/** To the card of `overrides.slot`; the disk's logging (`diskLogging`) to the disk's card. */
	public setDebugOverrides(overrides: { slot?: number } & Dict) {
		const slot = overrides.slot ?? (typeof overrides.diskLogging === "boolean" ? this.diskSlot : undefined);
		if (slot) this.slots[slot]?.setDebugOverrides?.(overrides);
	}

	// Share internal state by storing it in shared mem
	// worker thread bus -> shared mem
	public syncState() {
		if (!this.registers) return;
		this.flushTicks(); // the devices up to date while the machine is paused

		this.fakingVBL = !this.fakingVBL;

		let byte1 = 0;
		if (this.lcBank2) byte1 |= APPLE_LC_BANK2_MASK;
		if (this.lcReadRam) byte1 |= APPLE_LC_READRAM_MASK;
		if (this.lcWriteRam) byte1 |= APPLE_LC_WRITERAM_MASK;
		if (this.store80) byte1 |= APPLE_STORE80_MASK;
		if (this.ramRdAux) byte1 |= APPLE_RAMRD_AUX_MASK;
		if (this.ramWrAux) byte1 |= APPLE_RAMWR_AUX_MASK;
		if (this.altZp) byte1 |= APPLE_ALTZP_MASK;
		if (this.intCxRom) byte1 |= APPLE_INTCXROM_MASK;
		this.registers.setUint8(MACHINE_STATE_OFFSET1, byte1);

		let byte2 = 0;
		if (this.slotC3Rom) byte2 |= APPLE_SLOTC3ROM_MASK;
		if (this.col80) byte2 |= APPLE_80COL_MASK;
		if (this.altChar) byte2 |= APPLE_ALTCHAR_MASK;
		if (this.text) byte2 |= APPLE_TEXT_MASK;
		if (this.mixed) byte2 |= APPLE_MIXED_MASK;
		if (this.page2) byte2 |= APPLE_PAGE2_MASK;
		if (this.hires) byte2 |= APPLE_HIRES_MASK;
		if (this.intC8Rom) byte2 |= APPLE_INTC8ROM_MASK;
		this.registers.setUint8(MACHINE_STATE_OFFSET2, byte2);

		let byte3 = 0;
		if (this.dblRes) byte3 |= APPLE_DBLRES_MASK;
		byte3 |= (this.video7Register << APPLE_VIDEO7_REG_SHIFT) & APPLE_VIDEO7_REG_MASK;
		this.registers.setUint8(MACHINE_STATE_OFFSET3, byte3);

		this.registers.setUint8(REG_TBCOLOR_OFFSET, this.tbColor);
		this.registers.setUint8(REG_BORDERCOLOR_OFFSET, this.brdrColor);
		this.registers.setUint8(REG_BANKSEL_OFFSET, this.auxMemBank);
	}

	/** `cold`: as Ctrl-OpenApple-Reset, the reset handler cold-starts and boots from the slots. */
	public reset(cold = false) {
		// The ROM warm-starts when the power-up byte PWREDUP ($3F4) is SOFTEV+1 ($3F3) EOR $A5: make it not
		if (cold) this.memory[RAM_OFFSET + PWREDUP] = ~((this.memory[RAM_OFFSET + SOFTEV_HI] ?? 0) ^ 0xa5) & 0xff;
		this.lcBank2 = false;
		this.lcReadRam = false;
		this.lcWriteRam = false;
		this.lcPreWriteCount = 0;

		this.store80 = false;
		this.ramRdAux = false;
		this.ramWrAux = false;
		this.altZp = false;
		this.auxMemBank = 1;

		this.intCxRom = false;
		this.intC8Rom = false;
		this.slotC3Rom = false;

		this.col80 = false;
		this.altChar = false;
		this.text = true;
		this.mixed = false;
		this.page2 = false;
		this.hires = false;
		this.tbColor = DEFAULT_TEXT_COLORS;
		this.dblRes = false;

		this.video7Register = 0;
		// this.video7BitToPush = 0;
		this.video7SeqState = 0;
		this.video7NextBit = 0;

		this.joy_pb0 = false;
		this.joy_pb1 = false;
		this.paddleValues.fill(127);
		this.paddleTimers.fill(0);
		this.totalCycles = 0;
		this.restartTicks();

		for (const card of this.slots) card?.reset?.();
		this.imu.reset();
		for (const { device } of this.devices) device.reset?.();
		this.updateIrq();

		this.syncState();
	}

	public async prepareWorkerPayloads(): Promise<{ video?: unknown; bus?: unknown }> {
		return generateApple2Assets();
	}

	// Retrieve internal state stored in shared mem
	// shared mem -> main thread bus
	public syncStateFromBuffer(view: DataView): Dict {
		const byte1 = view.getUint8(MACHINE_STATE_OFFSET1);
		const byte2 = view.getUint8(MACHINE_STATE_OFFSET2);
		const byte3 = view.getUint8(MACHINE_STATE_OFFSET3);

		const state = {
			lcBank2: (byte1 & APPLE_LC_BANK2_MASK) !== 0,
			lcReadRam: (byte1 & APPLE_LC_READRAM_MASK) !== 0,
			lcWriteRam: (byte1 & APPLE_LC_WRITERAM_MASK) !== 0,
			store80: (byte1 & APPLE_STORE80_MASK) !== 0,
			ramRdAux: (byte1 & APPLE_RAMRD_AUX_MASK) !== 0,
			ramWrAux: (byte1 & APPLE_RAMWR_AUX_MASK) !== 0,
			altZp: (byte1 & APPLE_ALTZP_MASK) !== 0,
			intCxRom: (byte1 & APPLE_INTCXROM_MASK) !== 0,

			slotC3Rom: (byte2 & APPLE_SLOTC3ROM_MASK) !== 0,
			col80: (byte2 & APPLE_80COL_MASK) !== 0,
			altChar: (byte2 & APPLE_ALTCHAR_MASK) !== 0,
			text: (byte2 & APPLE_TEXT_MASK) !== 0,
			mixed: (byte2 & APPLE_MIXED_MASK) !== 0,
			page2: (byte2 & APPLE_PAGE2_MASK) !== 0,
			hires: (byte2 & APPLE_HIRES_MASK) !== 0,
			intC8Rom: (byte2 & APPLE_INTC8ROM_MASK) !== 0,

			dblRes: (byte3 & APPLE_DBLRES_MASK) !== 0,
			video7Register: (byte3 & APPLE_VIDEO7_REG_MASK) >> APPLE_VIDEO7_REG_SHIFT,
		};

		// Load state into this bus instance
		this.lcBank2 = state.lcBank2;
		this.lcReadRam = state.lcReadRam;
		this.lcWriteRam = state.lcWriteRam;
		this.store80 = state.store80;
		this.ramRdAux = state.ramRdAux;
		this.ramWrAux = state.ramWrAux;
		this.altZp = state.altZp;
		this.intCxRom = state.intCxRom;
		this.intC8Rom = state.intC8Rom;
		this.slotC3Rom = state.slotC3Rom;
		this.col80 = state.col80;
		this.altChar = state.altChar;
		this.text = state.text;
		this.mixed = state.mixed;
		this.page2 = state.page2;
		this.hires = state.hires;
		this.dblRes = state.dblRes;
		this.video7Register = state.video7Register;

		this.tbColor = view.getUint8(REG_TBCOLOR_OFFSET);
		this.brdrColor = view.getUint8(REG_BORDERCOLOR_OFFSET);
		this.auxMemBank = view.getUint8(REG_BANKSEL_OFFSET);

		return {
			...state,
			tbColor: this.tbColor,
			brdrColor: this.brdrColor,
			auxMemBank: this.auxMemBank,
		};
	}

	public readRaw(address: number): number {
		return this.memory[RAM_OFFSET + address] ?? 0;
	}

	read(address: number): number {
		let bankOffset = 0;

		// $0000:01FF
		if (address < 0x0200) {
			if (this.altZp) bankOffset = 0x10000;
			return this.memory[RAM_OFFSET + address + bankOffset] ?? 0;
		}

		// $0200:BFFF
		if (address < 0xc000) {
			let aux = this.ramRdAux;
			if (this.store80) {
				if (address >= 0x0400 && address <= 0x07ff) aux = this.page2;
				else if (this.hires && address >= 0x2000 && address <= 0x3fff) aux = this.page2;
			}
			if (aux) bankOffset = 0x10000;
			return this.memory[RAM_OFFSET + address + bankOffset] ?? 0;
		}

		if (address >= 0xd000) {
			if (!this.lcReadRam) return this.rom[address - 0xd000] ?? 0;
			if (this.lcBank2 && address < 0xe000) {
				const bank = this.altZp ? this.auxbank2 : this.bank2;
				return bank[address - 0xd000] ?? 0;
			}
			if (this.altZp) bankOffset = 0x10000;
			return this.memory[RAM_OFFSET + address + bankOffset] ?? 0;
		}

		// $C000-$CFFF: the devices that count cycles brought up to date first, their next event set after
		const sync = this.ioSync[address - 0xc000];
		if (!sync) return this.readC000(address);
		this.syncIo(sync);
		const value = this.readC000(address);
		if (sync === SYNC_ALL) this.scheduleTicks();
		return value;
	}

	/** $C000-$CFFF: the soft switches and I/O, the slots' and internal ROMs. */
	private readC000(address: number): number {
		// biome-ignore lint/style/noNonNullAssertion: all handlers are defined
		if (address <= 0xc0ff) return this.readHandlers[address & 0xff]!();

		// Slot ROMs / Internal ROM ($C100-$CFFF)
		if (address <= 0xcfff) {
			const offset = address - 0xc100;

			// Reading from $CFFF disables the internal Cx ROM and resets expansion
			if (address === 0xcfff) {
				this.intC8Rom = false;
				this.activeExpansionSlot = 0;
			}

			// Hardware hack: Accessing Internal C3 ($C3xx) enables intC8Rom
			if (address >= 0xc300 && address <= 0xc3ff && this.slotC3Rom) {
				this.intC8Rom = true;
				return this.romC[offset] ?? 0;
			}

			// intC8Rom forces Internal
			if (address >= 0xc800 && this.intC8Rom) return this.romC[offset] ?? 0;

			// INTCXROM ($C015) overrides everything to Internal
			if (this.intCxRom) return this.romC[offset] ?? 0;

			// Handle Expansion ROM ($C800-$CFFF)
			if (address >= 0xc800) {
				if (this.activeExpansionSlot > 0 && this.slots[this.activeExpansionSlot]) {
					// biome-ignore lint/style/noNonNullAssertion: all slots are defined
					return this.slots[this.activeExpansionSlot]!.readExpansion(address - 0xc800);
				}
				return this.slotRoms[offset] ?? 0;
			}

			// Handle Slot ROMs ($C100-$C7FF)
			// Determine slot number from address (C1xx = Slot 1, etc.)
			const slot = (address >> 8) & 0x0f;

			// Special case for C3: Check slotC3Rom softswitch
			if (slot === 3 && !this.slotC3Rom) {
				return this.romC[offset] ?? 0;
			}

			if (this.slots[slot]) {
				this.activeExpansionSlot = slot;
				// biome-ignore lint/style/noNonNullAssertion: all slots are defined
				return this.slots[slot]!.readRom(address & 0xff);
			}

			const value = this.slotRoms[offset] ?? 0;

			return value;
		}

		throw new Error(`Unknown read address ${address.toString(16).padStart(4, "0")}`);
		// return this.memory[RAM_OFFSET + address] ?? 0;
	}

	peek(address: number): number {
		// `read` has side effects only on $C000-$CFFF (soft switches, $CFFF, slot ROM selection, cards);
		// `readDebug` gives the same bytes there (0 for I/O) without them. Banked addresses are physical.
		if (address > 0xffff || (address >= 0xc000 && address <= 0xcfff)) return this.readDebug(address);
		return this.read(address);
	}

	readDebug(address: number, overrides?: MemScopeOverride | string): number {
		const bank = address >> 16;
		const addr16 = address & 0xffff;
		const lcView = typeof overrides === "object" ? overrides?.lcView : overrides;
		const lcAux = typeof overrides === "object" ? overrides?.lcAux : "AUTO";
		if (addr16 >= 0xd000) {
			const offset = addr16 - 0xd000;
			switch (lcView) {
				case "ROM":
					return this.rom[offset] ?? 0;
				case "BANK2":
					if (addr16 < 0xe000) {
						let sourceArray: Uint8Array;
						if (bank || lcAux === "AUX") sourceArray = this.auxbank2;
						else if (lcAux === "MAIN") sourceArray = this.bank2;
						else sourceArray = this.altZp ? this.auxbank2 : this.bank2;
						return sourceArray[offset] ?? 0;
					} else return this.memory[RAM_OFFSET + address] ?? 0;
				case "BANK1":
					return this.memory[RAM_OFFSET + address] ?? 0;
			}
			if (!this.lcReadRam) return this.rom[offset] ?? 0;
			if (this.lcBank2 && addr16 < 0xe000) {
				return (bank ? this.auxbank2[offset] : this.bank2[offset]) ?? 0;
			}
			return this.memory[RAM_OFFSET + address] ?? 0;
		}

		// if (address > 0xffff) return this.memory[RAM_OFFSET + address] ?? 0;

		if (addr16 < 0xc000) return this.memory[RAM_OFFSET + address] ?? 0;

		if (addr16 >= 0xc100 && addr16 <= 0xcfff) {
			const offset = addr16 - 0xc100;

			const cxView = typeof overrides === "object" ? overrides?.cxView : overrides;
			if (cxView) {
				if (cxView === "INT") return this.romC[offset] ?? 0;
				if (cxView === "SLOT") return this.slotRoms[offset] ?? 0;
			}

			// intC8Rom forces Internal
			if (addr16 >= 0xc7ff && this.intC8Rom) return this.romC[offset] ?? 0;

			if (this.intCxRom) return this.romC[offset] ?? 0;

			if (addr16 >= 0xc300 && addr16 <= 0xc3ff && this.slotC3Rom) return this.romC[offset] ?? 0;

			return this.slotRoms[offset] ?? 0;
		}

		// Softswitches - return 0 to avoid side effects
		return 0;
	}

	public getTextMode(): TextMode {
		return {
			// With 80STORE on, PAGE2 selects main/aux memory for $400-$7FF instead of the displayed page.
			page: this.page2 && !this.store80 ? 2 : 1,
			cols: this.col80 ? 80 : 40,
			shown: this.text ? "full" : this.mixed ? "mixed" : "hidden",
		};
	}

	/** Options left out: those of the displayed screen. */
	public getTextScreen(options: TextScreenOptions = {}): string[] {
		const { page, cols } = this.getTextMode();
		return readTextScreen((address, length) => this.readDebugRange(address, length), {
			page: options.page ?? page,
			cols: options.cols ?? cols,
		});
	}

	public readDebugRange(address: number, length: number, overrides?: MemScopeOverride | string): Uint8Array {
		const result = new Uint8Array(length);
		let resultOffset = 0;
		let currentAddress = address;
		const bank = address >> 16;
		const lcView = typeof overrides === "object" ? overrides?.lcView : overrides;
		const lcAux = typeof overrides === "object" ? overrides?.lcAux : "AUTO";
		const isLcBank2 = lcView && lcView !== "AUTO" ? lcView === "BANK2" : this.lcBank2;
		const readLcRom = lcView && lcView !== "AUTO" ? lcView === "ROM" : !this.lcReadRam;

		while (resultOffset < length) {
			const addr16 = currentAddress & 0xffff;
			const remainingInRequest = length - resultOffset;

			// 1. Determine the end of the current contiguous block based on memory map boundaries
			let blockEnd = currentAddress + remainingInRequest;
			if (addr16 < 0xc000) {
				blockEnd = Math.min(blockEnd, (currentAddress & 0xffff0000) | 0xc000);
			} else if (addr16 < 0xd000) {
				blockEnd = Math.min(blockEnd, (currentAddress & 0xffff0000) | 0xd000);
			} else {
				// >= 0xd000
				if (isLcBank2 && addr16 < 0xe000) blockEnd = Math.min(blockEnd, (currentAddress & 0xffff0000) | 0xe000);
			}

			const chunkLength = blockEnd - currentAddress;

			// 2. Read the chunk
			let isSimple = false;
			let sourceArray: Uint8Array | null = null;
			let sourceOffset = 0;

			if (addr16 < 0xc000) {
				isSimple = true;
				sourceArray = this.memory;
				sourceOffset = RAM_OFFSET + (currentAddress & 0xff0000); // Bank is part of the 24-bit address
			} else if (addr16 >= 0xd000) {
				if (readLcRom) {
					isSimple = true;
					sourceArray = this.rom;
					sourceOffset = -0xd000;
				} else {
					if (isLcBank2 && addr16 < 0xe000) {
						isSimple = true;
						if (bank === 0) {
							switch (lcAux) {
								case "AUX":
									sourceArray = this.auxbank2;
									break;
								case "MAIN":
									sourceArray = this.bank2;
									break;
								default:
									sourceArray = this.altZp ? this.auxbank2 : this.bank2;
							}
						} else sourceArray = this.auxbank2;
						sourceOffset = -0xd000;
					} else {
						// Bank 1 RAM
						isSimple = true;
						sourceArray = this.memory;
						sourceOffset = RAM_OFFSET + (currentAddress & 0xff0000);
						if (lcAux === "AUX" || (lcAux === "AUTO" && this.altZp)) sourceOffset += 0x10000;
					}
				}
			}
			// For C000-CFFF, isSimple remains false, forcing byte-by-byte read.

			if (isSimple && sourceArray) {
				const start = (currentAddress & 0xffff) + sourceOffset;
				const chunk = sourceArray.subarray(start, start + chunkLength);
				result.set(chunk, resultOffset);
			} else {
				// Fallback for complex regions (I/O, slots)
				for (let i = 0; i < chunkLength; i++)
					result[resultOffset + i] = this.readDebug(currentAddress + i, overrides);
			}

			// 3. Advance to the next block
			resultOffset += chunkLength;
			currentAddress += chunkLength;
		}

		return result;
	}

	ioWrite(address: number, value: number, worker: Worker): void {
		if (address >= 0xc000 && address <= 0xc0ff) {
			this.writeHandlers[address & 0xff]!(value);
			worker.postMessage({
				command: "ioWrite",
				address,
				value,
			});
		} else this.write(address, value);
	}

	write(address: number, value: number): void {
		let bankOffset = 0;

		// $0000:01FF
		if (address < 0x0200) {
			if (this.altZp) bankOffset = 0x10000;
			this.memory[RAM_OFFSET + address + bankOffset] = value & 0xff;
			return;
		}

		// $0200:BFFF
		if (address < 0xc000) {
			let aux = this.ramWrAux;
			if (this.store80) {
				if (address >= 0x0400 && address <= 0x07ff) aux = this.page2;
				else if (this.hires && address >= 0x2000 && address <= 0x3fff) aux = this.page2;
			}
			if (aux) bankOffset = 0x10000;
			this.memory[RAM_OFFSET + address + bankOffset] = value & 0xff;
			return;
		}

		if (address >= 0xd000) {
			// can't write on ROM
			if (!this.lcWriteRam) return;
			if (this.lcBank2 && address < 0xe000) {
				const bank = this.altZp ? this.auxbank2 : this.bank2;
				bank[address - 0xd000] = value & 0xff;
				return;
			}
			if (this.altZp) bankOffset = 0x10000;
			this.memory[RAM_OFFSET + address + bankOffset] = value & 0xff;
			return;
		}

		// $C000-$CFFF: the devices that count cycles brought up to date first, their next event set after
		const sync = this.ioSync[address - 0xc000];
		if (!sync) return this.writeC000(address, value);
		this.syncIo(sync);
		this.writeC000(address, value);
		if (sync === SYNC_ALL) this.scheduleTicks();
	}

	/** $C000-$CFFF: the soft switches and I/O, the slots' ROMs (cards that take writes there). */
	private writeC000(address: number, value: number): void {
		if (address <= 0xc0ff) {
			// biome-ignore lint/style/noNonNullAssertion: all handlers are defined
			this.writeHandlers[address & 0xff]!(value);
			return;
		}

		// Slot ROMs / Internal ROM ($C100-$CFFF)
		if (address <= 0xcfff) {
			if (address === 0xcfff) {
				this.intC8Rom = false;
				this.activeExpansionSlot = 0;
			}

			if (this.intCxRom) return;

			// Handle Expansion ROM ($C800-$CFFF)
			if (address >= 0xc800) {
				if (this.intC8Rom) return;
				if (this.activeExpansionSlot > 0 && this.slots[this.activeExpansionSlot]) {
					this.slots[this.activeExpansionSlot]?.writeExpansion?.(address - 0xc800, value);
				}
				return;
			}

			// Handle Slot ROMs ($C100-$C7FF)
			const slot = (address >> 8) & 0x0f;
			if (slot === 3 && !this.slotC3Rom) return;

			if (this.slots[slot]) {
				this.activeExpansionSlot = slot;
				this.slots[slot]?.writeRom?.(address & 0xff, value);
			}
			return;
		}

		// this.memory[RAM_OFFSET + address] = value & 0xff;
		throw new Error(`Unknown write address ${address.toString(16).padStart(4, "0")}`);
	}

	writeDebug(address: number, value: number, overrides?: Record<string, unknown>): void {
		const bank = address >> 16;
		const addr16 = address & 0xffff;

		if (addr16 >= 0xd000) {
			switch (overrides?.lcView) {
				case "ROM":
					this.rom[addr16 - 0xd000] = value & 0xff;
					return;
				case "BANK2":
					if (addr16 < 0xe000) {
						const bank2 = bank ? this.auxbank2 : this.bank2;
						bank2[addr16 - 0xd000] = value & 0xff;
						return;
					}
					this.memory[RAM_OFFSET + addr16] = value & 0xff;
					return;
				case "BANK1":
					this.memory[RAM_OFFSET + address] = value & 0xff;
					return;
			}

			if (!this.lcReadRam) {
				this.rom[addr16 - 0xd000] = value & 0xff;
				return;
			}

			if (this.lcBank2 && addr16 < 0xe000) {
				const bank2 = bank ? this.auxbank2 : this.bank2;
				bank2[addr16 - 0xd000] = value & 0xff;
				return;
			}

			this.memory[RAM_OFFSET + address] = value & 0xff;
			return;
		}

		if (addr16 >= 0xc100 && addr16 <= 0xcfff) {
			const view = overrides?.cxView;
			if (view === "INT") this.romC[addr16 - 0xc100] = value & 0xff;
			if (view === "SLOT") this.slotRoms[addr16 - 0xc100] = value & 0xff;
			return;
		}

		if (addr16 >= 0xc000 && addr16 <= 0xc0ff) return;

		this.memory[RAM_OFFSET + address] = value & 0xff;
	}

	load(address: number, data: Uint8Array, bank: number = 0, tag?: string): void {
		loadMemoryChunks(this, address, data, bank, tag);
	}

	// The host's keys, to the keyboard device (none: lost)
	public pressKey(key: string, code?: string, ctrl?: boolean) {
		this.keyboard?.pressKey(key, code, ctrl);
	}

	public releaseKey(key?: string, code?: string) {
		this.keyboard?.releaseKey(key, code);
	}

	public typeText(text: string) {
		return this.requireKeyboard().typeText(text);
	}

	public holdKey(key: string | number | null) {
		this.requireKeyboard().holdKey(key);
	}

	public clearKeys() {
		this.requireKeyboard().clearKeys();
	}

	public setKeyDelay(cycles: number) {
		this.requireKeyboard().setKeyDelay(cycles);
	}

	public getKeyboardState(): KeyboardState {
		return this.requireKeyboard().getKeyboardState();
	}

	private requireKeyboard() {
		if (!this.keyboard) throw new Error("This machine has no keyboard");
		return this.keyboard;
	}

	search(
		pattern: (number | null)[],
		startAddress: number,
		endAddress = 0xffffff,
		is7Bit = false,
		candidates?: number[][],
	): PatternMatch[] {
		return searchPattern(this.memory, APPLE_SEARCH_REGIONS, pattern, startAddress, endAddress, is7Bit, candidates);
	}

	getMachineStateSpecs(): (MachineStateSpec | [MachineStateSpec, MachineStateSpec])[] {
		return [
			{ id: "lcBank2", label: "Bank 2", type: "led", group: "Language Card" },
			[
				{ id: "lcReadRam", label: "Read RAM", type: "led", group: "Language Card" },
				{ id: "lcWriteRam", label: "Write RAM", type: "led", group: "Language Card" },
			],

			{ id: "store80", label: "80STORE", type: "led", group: "Main/Aux" },
			[
				{ id: "ramRdAux", label: "Aux Read", type: "led", group: "Main/Aux" },
				{ id: "ramWrAux", label: "Aux Write", type: "led", group: "Main/Aux" },
			],
			{ id: "altZp", label: "Alt ZP", type: "led", group: "Main/Aux" },

			[
				{ id: "intCxRom", label: "Internal Cx", type: "led", group: "Slot ROMs" },
				{ id: "intC8Rom", label: "Internal C8", type: "led", group: "Slot ROMs" },
			],
			{ id: "slotC3Rom", label: "Slot C3", type: "led", group: "Slot ROMs" },

			[
				{ id: "text", label: "Text", type: "led", group: "Video" },
				{ id: "hires", label: "Hi-Res", type: "led", group: "Video" },
			],
			{ id: "mixed", label: "Mixed Mode", type: "led", group: "Video" },
			{ id: "page2", label: "Page 2", type: "led", group: "Video" },

			{ id: "col80", label: "80 Columns", type: "led", group: "Video80" },
			{ id: "altChar", label: "Alt Charset", type: "led", group: "Video80" },

			{ id: "dblRes", label: "Dbl Hi-Res", type: "led", group: "Video+" },
			{ id: "video7Register", label: "Video-7 Mode", type: "text", group: "Video+" },
		];
	}

	saveState(): Record<string, boolean> {
		return {
			lcBank2: this.lcBank2,
			lcReadRam: this.lcReadRam,
			lcWriteRam: this.lcWriteRam,
			store80: this.store80,
			ramRdAux: this.ramRdAux,
			ramWrAux: this.ramWrAux,
			altZp: this.altZp,
			intCxRom: this.intCxRom,
			intC8Rom: this.intC8Rom,
			slotC3Rom: this.slotC3Rom,
			col80: this.col80,
			altChar: this.altChar,
			text: this.text,
			mixed: this.mixed,
			page2: this.page2,
			hires: this.hires,
			dblRes: this.dblRes,
		};
	}

	public snapshot(): AppleBusSnapshot {
		this.flushTicks();
		const fields: Partial<Record<SnapshotField, number | boolean>> = {};
		for (const key of SNAPSHOT_FIELDS) fields[key] = this[key];
		return {
			fields: fields as Record<SnapshotField, number | boolean>,
			paddleTimers: [...this.paddleTimers],
			cards: this.slots.map((card) => card?.snapshot?.()),
			imu: this.imu.snapshot(),
			devices: Object.fromEntries(this.devices.map(({ config, device }) => [config.id, device.snapshot?.()])),
		};
	}

	public restoreSnapshot(state: unknown) {
		const { fields, paddleTimers, cards, keyboard, imu, devices, timer } = state as AppleBusSnapshot;
		// The states saved before the keyboard device had its latch, strobe and Apple keys in the bus's fields
		const { lastKey, keyStrobe, kbd_pb0, kbd_pb1, ...busFields } = fields;
		Object.assign(this, busFields);
		this.paddleTimers = [...paddleTimers];
		this.slots.forEach((card, slot) => {
			if (cards[slot] !== undefined) card?.restoreSnapshot?.(cards[slot]);
		});
		if (imu) this.imu.restoreSnapshot(imu);
		else this.imu.reset();
		// The states saved before the devices had the timer's at the top
		const deviceStates: Record<string, unknown> = devices ?? (timer ? { timer } : {});
		const oldKeyboard: KeyboardSnapshot | undefined =
			lastKey === undefined
				? undefined
				: {
						...(keyboard as KeyboardSnapshot),
						latch: lastKey as number,
						strobe: keyStrobe as boolean,
						openApple: kbd_pb0 as boolean,
						solidApple: kbd_pb1 as boolean,
					};
		for (const { config, device } of this.devices) {
			const deviceState = deviceStates[config.id] ?? (device === this.keyboard ? oldKeyboard : undefined);
			if (deviceState !== undefined && device.restoreSnapshot) device.restoreSnapshot(deviceState);
			else device.reset?.();
		}
		this.restartTicks();
		this.updateIrq();
		this.syncState(); // the soft switches the main thread and the UI read
		this.fakingVBL = fields.fakingVBL as boolean; // syncState toggles it (once per frame)
	}

	/** Into the card of `metadata.slot`, else the first card that takes a disk (the SmartPort's). */
	public insertMedia(data: Uint8Array, metadata: Record<string, unknown> = {}) {
		const slot = typeof metadata.slot === "number" ? metadata.slot : this.diskSlot;
		const card = this.slots[slot];
		if (!card?.insertMedia) console.warn(`AppleBus: no card in slot ${slot} takes a disk`);
		card?.insertMedia?.(data, metadata);
	}

	public ejectMedia(metadata: Record<string, unknown> = {}) {
		this.slots[typeof metadata.slot === "number" ? metadata.slot : this.diskSlot]?.ejectMedia?.();
	}

	public getScope(address: number): string {
		if (address < 0x0200) return this.altZp ? "aux" : "main";

		if (address < 0xc000) {
			let aux = this.ramRdAux;
			if (this.store80) {
				if (address >= 0x0400 && address <= 0x07ff) aux = this.page2;
				else if (this.hires && address >= 0x2000 && address <= 0x3fff) aux = this.page2;
			}
			return aux ? "aux" : "main";
		}

		if (address <= 0xcfff) {
			if (address < 0xc100) return "io";

			// Internal Cx ROM override
			if (this.intCxRom) return "int_rom";

			// C800-CFFF
			if (address >= 0xc800) {
				if (this.intC8Rom) return "int_rom";
				// if (this.activeExpansionSlot > 0 && this.slots[this.activeExpansionSlot])
				// 	return `slot_rom_${this.activeExpansionSlot}`;
				return "slot_rom";
			}

			// C100-C7FF
			const slot = (address >> 8) & 0x0f;
			if (slot === 3 && !this.slotC3Rom) return "int_rom";
			// if (this.slots[slot]) return `slot_rom_${slot}`;

			return "slot_rom";
		}

		if (!this.lcReadRam) return "rom";
		if (this.lcBank2 && address < 0xe000) return "lc_bank2";
		return "lc_bank1";
	}

	public getScopes?() {
		return MEM_SCOPES;
	}

	public getBank?(address: number): number {
		if (address >= 0x200 && address < 0xd000) return this.ramRdAux ? this.auxMemBank : 0;
		return this.altZp ? this.auxMemBank : 0;
	}
}
