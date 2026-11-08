// The single registry of tools exposed to agents.
// Transports (the WebSocket bridge to the vm6502-mcp server, WebMCP) only adapt these definitions:
// a tool is written once here, with its JSON Schema, and is available everywhere.

import { watch } from "vue";
import { useMachine } from "@/composables/useMachine";
import { useCommands } from "@/composables/useCommands";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { useLogWindows } from "@/composables/useLogWindows";
import { type InsertedDisk, useDiskDrive } from "@/composables/useDiskDrive";
import type { StoredDisk } from "@/composables/useDiskStorage";
import { parseAddress } from "@/lib/parse.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { StopInfo } from "@/types/stopinfo.interface";
import type { Breakpoint } from "@/types/breakpoint.interface";
import { HYPERCALL_NAMES } from "@/lib/hypercalls.lib";
import { disassemble } from "@/lib/disassembler";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import {
	INSTRUCTION_TRACE_DEFAULT_SIZE,
	INSTRUCTION_TRACE_MAX_SIZE,
	type TraceSnapshot,
	unpackTraceEntries,
} from "@/virtualmachine/cpu/instructionTrace";
import {
	FLAG_B_MASK,
	FLAG_C_MASK,
	FLAG_D_MASK,
	FLAG_I_MASK,
	FLAG_N_MASK,
	FLAG_V_MASK,
	FLAG_Z_MASK,
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";

// ─── Types ────────────────────────────────────────────────────────────────────

export type JsonSchema = Record<string, unknown>;
export type ToolInput = Record<string, unknown>;

export type McpTool = {
	name: string;
	description: string;
	/** JSON Schema of the input (always an object schema). */
	inputSchema: JsonSchema & { type: "object" };
	annotations?: { readOnlyHint?: boolean };
	/** Returns the text handed back to the agent. Throws on error. */
	execute: (input: ToolInput, ctx: { signal?: AbortSignal }) => Promise<string>;
};

/** What a transport needs to advertise a tool (everything but `execute`). */
export type McpToolDescriptor = Omit<McpTool, "execute">;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Transports may receive requests before the worker is initialised.
const getVm = async (): Promise<VirtualMachine> => {
	const { vm } = useMachine();
	if (!vm.value) throw new Error("No virtual machine loaded");
	await vm.value.ready;
	return vm.value;
};

const hex = (v: number, width: number) => `$${v.toString(16).toUpperCase().padStart(width, "0")}`;
const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Number, "$C000", "0xC000", "$1C000" (bank 1), decimal string, or a label ("KEYIN", "ns::label"). */
const toAddress = (v: unknown, field: string): number => {
	if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
	if (typeof v !== "string" || !v.trim()) throw new Error(`${field}: address expected`);
	const s = v.trim();
	const hexMatch = s.match(/^(?:\$|0x)([0-9a-f]{1,6})$/i);
	if (hexMatch) return Number.parseInt(hexMatch[1] as string, 16);
	if (/^\d+$/.test(s)) return Number(s);
	return parseAddress(s); // labels
};

const toInt = (v: unknown, field: string, def: number, min: number, max: number): number => {
	if (v === undefined || v === null) return def;
	const n = typeof v === "string" ? Number(v) : v;
	if (typeof n !== "number" || !Number.isInteger(n)) throw new Error(`${field}: integer expected`);
	if (n < min || n > max) throw new Error(`${field}: must be between ${min} and ${max}`);
	return n;
};

const toStr = (v: unknown, field: string): string => {
	if (typeof v !== "string") throw new Error(`${field}: string expected`);
	return v;
};

/**
 * Bytes as an array of 0-255 integers, or a hex string: "A9 00 8D 00 C0", "A9008D00C0", "$A9,$00".
 * In a string, a 1-2 digit token is one byte; a longer one is read as pairs (so it needs an even length).
 */
const toBytes = (v: unknown, field: string, max: number): Uint8Array => {
	let bytes: number[];
	if (Array.isArray(v)) {
		bytes = v.map((b, i) => {
			if (typeof b !== "number" || !Number.isInteger(b) || b < 0 || b > 0xff)
				throw new Error(`${field}[${i}]: byte (0-255) expected`);
			return b;
		});
	} else if (typeof v === "string") {
		bytes = [];
		for (const token of v.split(/[\s,]+/).filter(Boolean)) {
			const digits = token.replace(/^(\$|0x)/i, "");
			if (!/^[0-9a-f]+$/i.test(digits)) throw new Error(`${field}: "${token}" is not hex`);
			if (digits.length <= 2) bytes.push(Number.parseInt(digits, 16));
			else if (digits.length % 2) throw new Error(`${field}: "${token}" has an odd number of digits`);
			else for (let i = 0; i < digits.length; i += 2) bytes.push(Number.parseInt(digits.slice(i, i + 2), 16));
		}
	} else throw new Error(`${field}: array of bytes or hex string expected`);
	if (!bytes.length) throw new Error(`${field}: no bytes`);
	if (bytes.length > max) throw new Error(`${field}: at most ${max} bytes`);
	return Uint8Array.from(bytes);
};

const hexBytes = (bytes: Uint8Array) =>
	Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");

const addressSchema = {
	type: ["string", "integer"],
	description: 'Address: number, "$C000", "0xC000", or a label name. Above $FFFF selects a bank.',
};

const readRegisters = (vm: VirtualMachine) => {
	const r = vm.sharedRegisters;
	const P = r.getUint8(REG_STATUS_OFFSET);
	const flags = [
		["N", FLAG_N_MASK],
		["V", FLAG_V_MASK],
		["B", FLAG_B_MASK],
		["D", FLAG_D_MASK],
		["I", FLAG_I_MASK],
		["Z", FLAG_Z_MASK],
		["C", FLAG_C_MASK],
	] as const;
	return {
		running: useMachine().isRunning.value,
		PC: hex(r.getUint16(REG_PC_OFFSET, true), 4),
		A: hex(r.getUint8(REG_A_OFFSET), 2),
		X: hex(r.getUint8(REG_X_OFFSET), 2),
		Y: hex(r.getUint8(REG_Y_OFFSET), 2),
		SP: hex(r.getUint8(REG_SP_OFFSET), 2),
		P: hex(P, 2),
		flags: flags.map(([name, mask]) => (P & mask ? name : name.toLowerCase())).join(""),
	};
};

const hexAddr = (a: number) => hex(a, a > 0xffff ? 6 : 4);
// `address` from the user may omit the bank; stop addresses are physical ((bank << 16) | addr).
const isSameAddress = (physical: number, address: number) =>
	physical === address || (address <= 0xffff && (physical & 0xffff) === address);

/** Why the machine stopped, for the agent. `target`: run_until's address, reported as `reached_address`. */
const describeStop = (stop: StopInfo | undefined, target?: number): Record<string, unknown> => {
	if (!stop) return { stopped: "unknown" };
	switch (stop.reason) {
		case "breakpoint":
			if (target !== undefined && stop.breakpointType === "pc" && isSameAddress(stop.address, target))
				return { stopped: "reached_address", address: hexAddr(stop.address) };
			return { stopped: "breakpoint", breakpoint: { type: stop.breakpointType, address: hexAddr(stop.address) } };
		case "error":
			return { stopped: "error", address: hexAddr(stop.address), message: stop.message };
		case "pause":
		case "reset":
			return { stopped: stop.reason };
		case "hypercall":
			return { stopped: "hypercall", command: HYPERCALL_NAMES[stop.cmd], address: hexAddr(stop.address) };
		default:
			return { stopped: stop.reason, address: hexAddr(stop.address) };
	}
};

const BP_TYPES: Breakpoint["type"][] = ["pc", "read", "write", "access"];

/** `{ type?, address, end_address? }` → the Breakpoint the store keys on (a one-byte range is a plain address). */
const toBreakpoint = (input: ToolInput): Breakpoint => {
	const type = (input.type ?? "pc") as Breakpoint["type"];
	if (!BP_TYPES.includes(type)) throw new Error(`type: must be one of ${BP_TYPES.join(", ")}`);
	const address = toAddress(input.address, "address");
	if (input.end_address === undefined || input.end_address === null) return { type, address };
	const endAddress = toAddress(input.end_address, "end_address");
	if (endAddress < address) throw new Error("end_address: must not be before address");
	if (endAddress === address) return { type, address };
	if (type === "pc") throw new Error("end_address: ranges are for read / write / access breakpoints");
	return { type, address, endAddress };
};

const describeBreakpoint = (bp: Breakpoint & { enabled?: boolean }) => ({
	type: bp.type,
	address: hexAddr(bp.address),
	...(bp.endAddress !== undefined && { end_address: hexAddr(bp.endAddress) }),
	...(bp.enabled !== undefined && { enabled: bp.enabled }),
	...(bp.isTemporary && { temporary: true }),
	...(bp.command && { command: bp.command }),
});

/** Resolves true when `isRunning` equals `value`; false after `ms` or on abort. */
const waitForRunning = (value: boolean, ms: number, signal?: AbortSignal) =>
	new Promise<boolean>((resolve) => {
		const { isRunning } = useMachine();
		if (isRunning.value === value) return resolve(true);
		const done = (ok: boolean) => {
			clearTimeout(timer);
			stop();
			signal?.removeEventListener("abort", onAbort);
			resolve(ok);
		};
		const onAbort = () => done(false);
		const timer = setTimeout(() => done(false), ms);
		const stop = watch(isRunning, (v) => v === value && done(true));
		signal?.addEventListener("abort", onAbort);
	});

/** Pretty JSON, but each item of `list` on one line (a disassembly would otherwise take 8 lines per instruction). */
const jsonWithList = (
	head: Record<string, unknown>,
	key: string,
	list: unknown[],
	tail: Record<string, unknown> = {},
) => {
	const placeholder = "\u0000list\u0000";
	const items = list.length ? `[\n${list.map((item) => `    ${JSON.stringify(item)}`).join(",\n")}\n  ]` : "[]";
	return JSON.stringify({ ...head, [key]: placeholder, ...tail }, null, 2).replace(
		JSON.stringify(placeholder),
		items,
	);
};

const ZP_MODES = new Set(["ZP", "ZPX", "ZPY", "IDX", "IDY", "ZPI"]);
const DISASM_BYTES_MAX = 16;

/** A disassembled line for the agent; `length` comes from the next line's address (data lines truncate `bytes`). */
const describeLine = (vm: VirtualMachine, line: DisassemblyLine, length: number) => {
	const shown = vm.readDebugRange(line.addr, Math.min(length, DISASM_BYTES_MAX));
	// The operand shows a label: give its value too.
	const symbolic = line.opr && !/^\(?\$/.test(line.opr) && !["IMP", "ACC", "IMM"].includes(line.mode);
	return {
		address: hexAddr(line.addr),
		bytes: hexBytes(shown) + (length > DISASM_BYTES_MAX ? ` ... (${length} bytes)` : ""),
		...(line.label && { label: line.label }),
		instruction: line.opr ? `${line.opc} ${line.opr}` : line.opc,
		...(symbolic && { target: hex(line.oprn, ZP_MODES.has(line.mode) ? 2 : 4) }),
		...(line.comment && { comment: line.comment }),
		...(line.blockComment && { block_comment: line.blockComment }),
	};
};

const describeDisk = (disk: InsertedDisk) => ({
	key: String(disk.key),
	name: disk.name,
	type: disk.type,
	size: disk.size,
});

/** The library disk named `wanted`: by key, else by name (exact, then ignoring case). */
const findLibraryDisk = (disks: StoredDisk[], wanted: string) => {
	const byKey = disks.find((d) => String(d.key) === wanted);
	if (byKey) return byKey;
	for (const same of [(n: string) => n === wanted, (n: string) => n.toLowerCase() === wanted.toLowerCase()]) {
		const found = disks.filter((d) => same(d.name));
		if (found.length > 1)
			throw new Error(
				`disk: ${found.length} disks named '${wanted}', use the key: ${found.map((d) => String(d.key)).join(", ")}`,
			);
		if (found[0]) return found[0];
	}
	throw new Error(`disk: no '${wanted}' in the library (list_disks shows what's there)`);
};

// Apple II: the reset handler cold-starts (and boots from the slots) when the power-up byte
// PWREDUP ($3F4) isn't SOFTEV+1 ($3F3) EOR $A5, which is what Ctrl-OpenApple-Reset does.
const PWREDUP = 0x3f4;
const SOFTEV_HI = 0x3f3;
const coldBoot = async (vm: VirtualMachine) => {
	vm.writeDebug(PWREDUP, (vm.readDebug(SOFTEV_HI) ^ 0xa5 ^ 0xff) & 0xff);
	await vm.reset();
	vm.play();
	await waitForRunning(true, 1000);
};

const h2 = (v: number) => v.toString(16).toUpperCase().padStart(2, "0");

/** Trace entries for the agent: disassembled from memory as it is now, registers as they were before. */
const describeTrace = async (vm: VirtualMachine, snapshot: TraceSnapshot) => {
	const lines = new Map<number, DisassemblyLine | undefined>();
	const entries = [];
	for (const e of unpackTraceEntries(snapshot.words)) {
		if (!lines.has(e.address)) {
			const [line] = await disassemble({
				readByte: (a) => vm.readDebug(a) ?? 0,
				scope: vm.getScope(e.address & 0xffff),
				fromAddress: e.address,
				lineCount: 1,
			});
			lines.set(e.address, line);
		}
		const line = lines.get(e.address);
		entries.push({
			address: hexAddr(e.address),
			...(line?.label && { label: line.label }),
			instruction: line ? (line.opr ? `${line.opc} ${line.opr}` : line.opc) : "?",
			regs: `A=${h2(e.a)} X=${h2(e.x)} Y=${h2(e.y)} P=${h2(e.p)} SP=${h2(e.sp)}`,
		});
	}
	return entries;
};

const hexdump = (start: number, bytes: Uint8Array) => {
	const lines: string[] = [];
	for (let i = 0; i < bytes.length; i += 16) {
		const row = Array.from(bytes.subarray(i, i + 16));
		const hexPart = row.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
		const ascii = row
			.map((b) => b & 0x7f)
			.map((c) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : "."))
			.join("");
		lines.push(`${(start + i).toString(16).toUpperCase().padStart(4, "0")}: ${hexPart.padEnd(47)}  ${ascii}`);
	}
	return lines.join("\n");
};

// ─── Tools ────────────────────────────────────────────────────────────────────

export const MCP_TOOLS: McpTool[] = [
	{
		name: "exec_command",
		description:
			"Run a line in the emulator's debugger console and return its output. " +
			"The full command language is available (`help` lists commands, `help <name>` details one): " +
			"disassembly, hexdump, labels, comments, breakpoints, hooks, routines, search, xref, etc. " +
			"For breakpoints, prefer the set_breakpoint / remove_breakpoint / list_breakpoints tools (structured results). " +
			"`brk on|off`: whether a BRK stops the machine (on by default, so a crash into zeroed memory stops " +
			"there) or runs through the $FFFE vector like real hardware (e.g. into the Apple II monitor). " +
			"Several lines can be sent at once (newline-separated); multi-line commands (`asm`, `routine`…) " +
			"must include their lines and terminator in the same call. " +
			"Waits for its turn if another command is running. " +
			"Note: `run` returns immediately; use run_until to wait for the machine to stop.",
		inputSchema: {
			type: "object",
			properties: { command: { type: "string", description: "Command line, e.g. `help`, `d $300 20`" } },
			required: ["command"],
		},
		async execute(input) {
			const vm = await getVm();
			// Queued behind any command already running (user's console, breakpoint command…).
			const report = await useCommands().runCommand(toStr(input.command, "command"), vm, { standalone: true });
			if (!report.ok) throw new Error(report.error || "Command failed");
			return report.output.map((o) => o.content).join("\n") || "(no output)";
		},
	},
	{
		name: "read_memory",
		description: "Read memory as a hex dump (debug read: no I/O side effects). Max 4096 bytes.",
		inputSchema: {
			type: "object",
			properties: {
				address: addressSchema,
				length: { type: "integer", minimum: 1, maximum: 4096, default: 256 },
			},
			required: ["address"],
		},
		annotations: { readOnlyHint: true },
		async execute(input) {
			const vm = await getVm();
			const address = toAddress(input.address, "address");
			const length = toInt(input.length, "length", 256, 1, 4096);
			vm.syncBusState(); // language card banking as it is now, even when the screen isn't rendering
			return hexdump(address, vm.readDebugRange(address, length));
		},
	},
	{
		name: "write_memory",
		description:
			"Write bytes to memory (debug write: no I/O side effects, works running or paused). Writes where read_memory " +
			"reads: above $FFFF selects a bank (Apple II: $1xxxx = aux memory); $D000-$FFFF goes to what is currently " +
			"read there (ROM or language card RAM, so a ROM can be patched). `bytes`: array of 0-255 or a hex string " +
			'("A9 00 8D 00 C0" / "A9008D00C0"), max 4096. Bytes are read back: `not_written` lists the ranges that ' +
			"didn't take (I/O $C000-$C0FF, slot ROM space, or bytes the running program changed in between). " +
			"Returns `previous` (the bytes before, hex: write them back to undo).",
		inputSchema: {
			type: "object",
			properties: {
				address: addressSchema,
				bytes: {
					type: ["array", "string"],
					items: { type: "integer", minimum: 0, maximum: 255 },
					description: 'Bytes to write: [169, 0] or "A9 00"',
				},
			},
			required: ["address", "bytes"],
		},
		async execute(input) {
			const vm = await getVm();
			const address = toAddress(input.address, "address");
			const bytes = toBytes(input.bytes, "bytes", 4096);
			vm.syncBusState(); // language card banking decides where $D000-$FFFF goes
			const previous = vm.readDebugRange(address, bytes.length);
			bytes.forEach((b, i) => vm.writeDebug(address + i, b));
			const after = vm.readDebugRange(address, bytes.length);

			const notWritten: { address: string; end_address?: string }[] = [];
			let written = 0;
			for (let i = 0; i < bytes.length; i++) {
				if (after[i] === bytes[i]) {
					written++;
					continue;
				}
				let end = i;
				while (end + 1 < bytes.length && after[end + 1] !== bytes[end + 1]) end++;
				notWritten.push({
					address: hexAddr(address + i),
					...(end > i && { end_address: hexAddr(address + end) }),
				});
				i = end;
			}
			return json({
				address: hexAddr(address),
				length: bytes.length,
				written,
				...(notWritten.length && { not_written: notWritten }),
				previous: hexBytes(previous),
			});
		},
	},
	{
		name: "disassemble",
		description:
			"Disassemble memory as JSON, one entry per instruction: `address`, `bytes`, `instruction` (operands use labels " +
			"when there are some, `target` then gives the address), `label` of the line, `comment` / `block_comment` from " +
			"the metadata. Data formats (`.BYTE` / `.WORD` / `.STR`) and hypercalls (`!!LOG_STRING`…) show as such. " +
			"Paginated: at most `count` lines (default 32, max 256) from `address`, up to `end_address` (inclusive; " +
			"default: the end of the address's 64K bank). `next_address` is where the next page starts (pass it back as " +
			"`address`); it is absent once `end_address` is reached. Debug reads only (no I/O side effects); $D000-$FFFF " +
			"shows what is currently mapped there (ROM or language card RAM).",
		inputSchema: {
			type: "object",
			properties: {
				address: addressSchema,
				count: { type: "integer", minimum: 1, maximum: 256, default: 32, description: "Max lines" },
				end_address: { ...addressSchema, description: "Last address to disassemble (inclusive)" },
			},
			required: ["address"],
		},
		annotations: { readOnlyHint: true },
		async execute(input) {
			const vm = await getVm();
			const address = toAddress(input.address, "address");
			const count = toInt(input.count, "count", 32, 1, 256);
			const end =
				input.end_address === undefined ? address | 0xffff : toAddress(input.end_address, "end_address");
			if (end < address) throw new Error("end_address: must not be before address");

			vm.syncBusState(); // language card banking decides what $D000-$FFFF holds
			// One line more than asked: its address ends the last line and starts the next page.
			const lines = await disassemble({
				readByte: (a) => vm.readDebug(a) ?? 0,
				scope: vm.getScope(address),
				fromAddress: address,
				lineCount: count + 1,
			});
			const page: ReturnType<typeof describeLine>[] = [];
			for (let i = 0; i < count && i < lines.length - 1; i++) {
				const line = lines[i] as DisassemblyLine;
				if (line.addr > end) break;
				page.push(describeLine(vm, line, (lines[i + 1] as DisassemblyLine).addr - line.addr));
			}
			const next = lines[page.length]?.addr;
			return jsonWithList(
				{ address: hexAddr(address), end_address: hexAddr(end) },
				"lines",
				page,
				next !== undefined && next <= end ? { next_address: hexAddr(next) } : {},
			);
		},
	},
	{
		name: "get_registers",
		description:
			"CPU registers, flags (uppercase = set), whether the machine is running and, when it is not, " +
			"why it last stopped (`last_stop`, same values as run_until's `stopped`).",
		inputSchema: { type: "object", properties: {} },
		annotations: { readOnlyHint: true },
		async execute() {
			const vm = await getVm();
			const regs = readRegisters(vm);
			return json(regs.running || !vm.lastStop ? regs : { ...regs, last_stop: describeStop(vm.lastStop) });
		},
	},
	{
		name: "screen_text",
		description:
			"Text screen as plain text, one line per row (Apple II: 24 lines), read from video memory. " +
			"By default the screen being displayed (page 1/2, 40/80 columns, from the soft switches); " +
			"`page` / `cols` force one. The first line says what was read, e.g. `[page 1, 80 cols]`, and " +
			"whether it is actually on screen (graphics mode hides it, mixed mode shows only the last 4 rows). " +
			"Inverse/flashing chars are shown as normal chars.",
		inputSchema: {
			type: "object",
			properties: {
				page: { type: "integer", enum: [1, 2], description: "Default: the displayed page" },
				cols: { type: "integer", enum: [40, 80], description: "Default: the displayed width" },
			},
		},
		annotations: { readOnlyHint: true },
		async execute(input) {
			const vm = await getVm();
			// The machine's bus knows its screen layout, character set and display mode.
			const bus = vm.bus;
			if (!bus?.getTextScreen) throw new Error(`No text screen for ${vm.machineConfig.name}`);
			const oneOf = <T extends number>(v: unknown, field: string, values: readonly T[]): T | undefined => {
				if (v === undefined || v === null) return undefined;
				const n = typeof v === "string" ? Number(v) : v;
				if (!values.includes(n as T)) throw new Error(`${field}: must be ${values.join(" or ")}`);
				return n as T;
			};
			const page = oneOf(input.page, "page", [1, 2] as const);
			const cols = oneOf(input.cols, "cols", [40, 80] as const);

			vm.syncBusState(); // soft switches as they are now, even when the screen isn't rendering
			const shown = bus.getTextMode?.();
			const read = { page: page ?? shown?.page ?? 1, cols: cols ?? shown?.cols ?? 40 };
			const notes: string[] = [];
			if (shown && (read.page !== shown.page || read.cols !== shown.cols))
				notes.push(`displayed: page ${shown.page}, ${shown.cols} cols`);
			if (shown?.shown === "hidden") notes.push("graphics mode: no text on screen");
			if (shown?.shown === "mixed") notes.push("mixed mode: only the last 4 rows are on screen");
			const header = `[page ${read.page}, ${read.cols} cols${notes.length ? ` — ${notes.join("; ")}` : ""}]`;
			return [header, ...bus.getTextScreen(read)].join("\n");
		},
	},
	{
		name: "read_log",
		description:
			"Read a log window: `hyper` gets the hypercall logs (LOG_STRING / LOG_REGS), other windows are written " +
			"by `log <name> …` commands. Without `name`, lists the windows. Returns `lines` (oldest first) and " +
			"`cursor`: pass it back as `after` to get only the lines written since. At most `limit` lines per call; " +
			"`more: true` means call again with the new cursor. A window keeps its last 500 lines: `dropped: true` " +
			"means lines after `after` are gone (overflowed or cleared). A window that doesn't exist yet (e.g. `hyper` " +
			"before the first hypercall log) returns no lines, not an error.",
		inputSchema: {
			type: "object",
			properties: {
				name: { type: "string", description: "Log window name, e.g. `hyper`" },
				after: { type: "integer", minimum: -1, description: "`cursor` from a previous call" },
				limit: { type: "integer", minimum: 1, maximum: 500, default: 200 },
			},
		},
		annotations: { readOnlyHint: true },
		async execute(input) {
			const { logWindows, getLines } = useLogWindows();
			const windows = () =>
				Array.from(logWindows.values(), (w) => ({
					name: w.name,
					lines: getLines(w.name).length,
					visible: w.isVisible,
				}));
			if (input.name === undefined) return json({ windows: windows() });

			const name = toStr(input.name, "name");
			const after =
				input.after === undefined ? undefined : toInt(input.after, "after", -1, -1, Number.MAX_SAFE_INTEGER);
			const limit = toInt(input.limit, "limit", 200, 1, 500);
			if (!logWindows.has(name))
				return json({
					name,
					lines: [],
					cursor: after ?? -1,
					note: `No log window '${name}' yet`,
					windows: windows(),
				});

			const all = getLines(name);
			const fresh = after === undefined ? all : all.filter((l) => l.id > after);
			const lines = fresh.slice(0, limit);
			const first = all[0];
			return json({
				name,
				lines: lines.map((l) => l.text),
				cursor: lines.at(-1)?.id ?? after ?? -1,
				...(fresh.length > limit && { more: true }),
				...(after !== undefined && first && first.id > after + 1 && { dropped: true }),
			});
		},
	},
	{
		name: "type_keys",
		description: "Type text on the emulated keyboard. Use \\n for Return. The machine must be running.",
		inputSchema: {
			type: "object",
			properties: { text: { type: "string" } },
			required: ["text"],
		},
		async execute(input) {
			const vm = await getVm();
			const text = toStr(input.text, "text");
			if (!useMachine().isRunning.value) throw new Error("The machine is paused: keys would not be read");
			await vm.typeText(text);
			return `Typed ${text.length} chars`;
		},
	},
	{
		name: "run_until",
		description:
			"Resume the machine and block until it stops (breakpoint, BRK, pause) or the timeout expires. " +
			"With `address`, a temporary PC breakpoint is set there first. " +
			"On timeout the machine is paused (unless pause_on_timeout is false). Returns the registers and `stopped`: " +
			"`reached_address`, `breakpoint` (with its type and address; for read/write breakpoints the address is the " +
			"memory accessed, PC is the instruction), `brk` (when break on BRK is on; resuming then executes it), `step` (step over/out done), `error` (unimplemented opcode), " +
			"`pause` (paused by someone else), `reset`, `hypercall` (a `BRK $8x` hypercall asked to stop: `command` " +
			"and `address` of the call, PC is after it), or `timeout (paused)` / `cancelled (…)`. " +
			"Hypercalls without the stop bit don't stop the machine.",
		inputSchema: {
			type: "object",
			properties: {
				address: addressSchema,
				timeout_ms: { type: "integer", minimum: 10, maximum: 120_000, default: 5000 },
				pause_on_timeout: { type: "boolean", default: true },
			},
		},
		async execute(input, { signal }) {
			const vm = await getVm();
			const address = input.address === undefined ? undefined : toAddress(input.address, "address");
			const timeoutMs = toInt(input.timeout_ms, "timeout_ms", 5000, 10, 120_000);
			const pauseOnTimeout = input.pause_on_timeout !== false;
			const { isRunning } = useMachine();
			const { getBreakpoint, addBreakpoint, removeBreakpoint } = useBreakpoints();

			// Only add (and later remove) the breakpoint if the user doesn't already have one there.
			let tempBp: { type: "pc"; address: number; isTemporary: true } | undefined;
			if (address !== undefined) {
				const bp = { type: "pc" as const, address, isTemporary: true as const };
				if (!getBreakpoint(bp)) {
					addBreakpoint(bp, vm);
					tempBp = bp;
				}
			}

			const deadline = Date.now() + timeoutMs;
			const stopBefore = vm.lastStop; // each stop is a new object: tells a fresh stop from an old one
			const report = () => json({ ...describeStop(vm.lastStop, address), ...readRegisters(vm) });

			try {
				if (!isRunning.value) {
					vm.play();
					if (!(await waitForRunning(true, 1000, signal))) {
						if (vm.lastStop !== stopBefore) return report(); // stopped before we saw it running
						return json({ stopped: "did not start", ...readRegisters(vm) });
					}
				}
				if (await waitForRunning(false, Math.max(0, deadline - Date.now()), signal)) return report();
				const why = signal?.aborted ? "cancelled" : "timeout";
				if (pauseOnTimeout) {
					vm.pause();
					await waitForRunning(false, 1000);
				}
				return json({
					stopped: `${why} (${pauseOnTimeout ? "paused" : "still running"})`,
					...readRegisters(vm),
				});
			} finally {
				// A temporary BP that was hit is already removed by useMachine; this handles the other cases.
				if (tempBp && getBreakpoint(tempBp)) removeBreakpoint(tempBp, vm);
			}
		},
	},
	{
		name: "pause",
		description: "Pause the machine and return the registers.",
		inputSchema: { type: "object", properties: {} },
		async execute() {
			const vm = await getVm();
			vm.pause();
			await waitForRunning(false, 1000);
			return json(readRegisters(vm));
		},
	},
	{
		name: "step",
		description:
			"Execute `count` instructions (default 1) on the paused machine, like the debugger's Step Into: BRKs and " +
			"hypercalls execute, read/write breakpoints don't fire. Stops early after an error (unimplemented opcode), " +
			"a hypercall with the stop bit (`BRK $8x`), or when the next instruction has a PC breakpoint. Returns " +
			"`executed`, the registers and, if it stopped early, `stopped` (same values as run_until). " +
			"The machine must be paused (call pause first). To step over a JSR, run_until the next instruction's address.",
		inputSchema: {
			type: "object",
			properties: { count: { type: "integer", minimum: 1, maximum: 100_000, default: 1 } },
		},
		async execute(input) {
			const vm = await getVm();
			const count = toInt(input.count, "count", 1, 1, 100_000);
			if (useMachine().isRunning.value) throw new Error("The machine is running: pause it first");
			const { executed, stop } = await vm.step(count);
			return json({ executed, ...(stop && describeStop(stop)), ...readRegisters(vm) });
		},
	},
	{
		name: "reset",
		description:
			"Reset the machine, like the Reset button: CPU (PC from the $FFFC vector, I set, SP=$FD), soft switches " +
			"and video; memory is kept. The machine is left paused on the reset vector: call run_until to let it run " +
			"(e.g. boot). Breakpoints are kept. Returns the registers.",
		inputSchema: { type: "object", properties: {} },
		async execute() {
			const vm = await getVm();
			await vm.reset();
			await waitForRunning(false, 1000); // the worker's `isRunning: false` comes before its reply
			return json(readRegisters(vm));
		},
	},
	{
		name: "list_disks",
		description:
			"The disk library (images kept in the browser) and what is in the drive. Use a disk from here with " +
			"load_disk rather than asking for the file again. Each disk: `key` (what load_disk takes; the file name, " +
			"or the URL for a URL disk), `name` (display name, may have been renamed), `type` (`physical` = stored " +
			"image, `url` = fetched when loaded), `size` (bytes; 0 for URL disks), `in_drive: true` for the inserted one.",
		inputSchema: { type: "object", properties: {} },
		annotations: { readOnlyHint: true },
		async execute() {
			const { inserted, listDisks } = useDiskDrive();
			const inDrive = inserted.value;
			const disks = (await listDisks()).map((d) => ({
				key: String(d.key),
				name: d.name,
				type: d.type,
				size: d.size,
				...(d.path && d.path !== String(d.key) && d.path !== d.name && { path: d.path }),
				...(inDrive && String(inDrive.key) === String(d.key) && { in_drive: true }),
			}));
			return json({ in_drive: inDrive ? describeDisk(inDrive) : null, count: disks.length, disks });
		},
	},
	{
		name: "load_disk",
		description:
			"Insert a disk from the library (see list_disks) into the drive, by `key` or name. Like the user loading it: " +
			"its labels / data formats / notes become the current disk's, and it comes back at the next startup. " +
			"Inserting doesn't restart the machine: `boot: true` then cold-boots (like Ctrl-OpenApple-Reset: the ROM " +
			"scans the slots and boots the disk) and leaves it running; use run_until / screen_text to follow the boot. " +
			"Returns the inserted disk.",
		inputSchema: {
			type: "object",
			properties: {
				disk: { type: "string", description: "Library key or disk name" },
				boot: { type: "boolean", default: false, description: "Cold-boot after inserting" },
			},
			required: ["disk"],
		},
		async execute(input) {
			const vm = await getVm();
			if (!vm.machineConfig.disk) throw new Error(`${vm.machineConfig.name} has no disk drive`);
			const { listDisks, insertFromLibrary } = useDiskDrive();
			const found = findLibraryDisk(await listDisks(), toStr(input.disk, "disk").trim());
			const disk = await insertFromLibrary(vm, found.key);
			if (input.boot === true) await coldBoot(vm);
			return json({
				result: "inserted",
				disk: describeDisk(disk),
				...(input.boot === true && { booted: true, ...readRegisters(vm) }),
			});
		},
	},
	{
		name: "eject_disk",
		description:
			'Eject the disk: the drive is empty (disk accesses fail with "no device"), and stays empty at the next ' +
			"startup; labels / data formats / notes go back to the system ones. The machine keeps running what it " +
			"was. `result`: `ejected` (with the disk) or `already_empty`.",
		inputSchema: { type: "object", properties: {} },
		async execute() {
			const vm = await getVm();
			const { inserted, eject } = useDiskDrive();
			const disk = inserted.value;
			if (!disk) return json({ result: "already_empty" });
			await eject(vm);
			return json({ result: "ejected", disk: describeDisk(disk) });
		},
	},
	{
		name: "get_trace",
		description:
			"The last instructions executed, oldest first, each with the registers *before* it: how the machine got " +
			"where it is (after a breakpoint, a crash, a BRK…). Off by default (it costs a little speed): " +
			"`enable: true` starts recording (cleared; keeps the last `size` instructions, default 4096, max 65536), " +
			"then run (run_until / step) and call get_trace again. `enable: false` stops recording and keeps what was " +
			"recorded. Returns `recording`, `capacity`, `recorded` (instructions recorded since enabled: more than " +
			"`capacity` means the oldest are gone) and the last `count` entries (default 50, max 1000): `address`, " +
			"`label`, `instruction` (disassembled from memory as it is now: self-modified code may differ), `regs`. " +
			"The last entry is the last instruction executed; PC (get_registers) is the next one. Everything executed " +
			"is recorded, interrupt handlers included.",
		inputSchema: {
			type: "object",
			properties: {
				enable: { type: "boolean", description: "true: start recording (cleared); false: stop (kept)" },
				size: {
					type: "integer",
					minimum: 1,
					maximum: INSTRUCTION_TRACE_MAX_SIZE,
					default: INSTRUCTION_TRACE_DEFAULT_SIZE,
					description: "With enable: true, how many instructions to keep (rounded up to a power of 2)",
				},
				count: { type: "integer", minimum: 1, maximum: 1000, default: 50, description: "Entries returned" },
			},
		},
		async execute(input) {
			const vm = await getVm();
			const count = toInt(input.count, "count", 50, 1, 1000);
			const size = toInt(input.size, "size", INSTRUCTION_TRACE_DEFAULT_SIZE, 1, INSTRUCTION_TRACE_MAX_SIZE);
			if (input.enable !== undefined && typeof input.enable !== "boolean")
				throw new Error("enable: boolean expected");
			if (input.enable === true) {
				const state = await vm.setInstructionTrace(true, size);
				return json({
					recording: true,
					capacity: state.capacity,
					recorded: 0,
					note: "Recording: run the machine, then call get_trace",
				});
			}
			if (input.enable === false) await vm.setInstructionTrace(false);
			const snapshot = await vm.getInstructionTrace(count);
			const head = {
				recording: snapshot.enabled,
				capacity: snapshot.capacity,
				recorded: snapshot.total,
				...(!snapshot.enabled &&
					snapshot.total === 0 && { note: "Nothing recorded: call get_trace with enable: true, then run" }),
			};
			return jsonWithList(head, "entries", await describeTrace(vm, snapshot));
		},
	},
	{
		name: "set_breakpoint",
		description:
			"Set a breakpoint: `pc` stops before executing the instruction at `address`, `read` / `write` / `access` stop on a " +
			"memory access to `address` (or to any byte of `address`..`end_address`). Idempotent: an existing one " +
			"(same type and address/range) is re-enabled and gets the new `command` if one is given. " +
			"`command`: debugger command line run when it is hit (a hook); the machine stays stopped unless the command " +
			"resumes it (end it with `;run`). When several cover the address hit, the most specific one's command runs " +
			"(same type before `access`, then the narrowest range); a plain breakpoint there just stops. Breakpoints are the user's too: they show in the debugger and are saved " +
			"across reloads, so remove the ones you no longer need. Returns `result` (`added` / `updated` / `unchanged`) " +
			"and the breakpoint.",
		inputSchema: {
			type: "object",
			properties: {
				address: addressSchema,
				end_address: { ...addressSchema, description: "Last address of a range (inclusive). Not for `pc`." },
				type: { type: "string", enum: BP_TYPES, default: "pc" },
				command: { type: "string", description: 'Command run when hit; `""` removes it' },
			},
			required: ["address"],
		},
		async execute(input) {
			const vm = await getVm();
			const bp = toBreakpoint(input);
			const command = input.command === undefined ? undefined : toStr(input.command, "command").trim();
			const { getBreakpoint, addBreakpoint, toggleBreakpointEnable, updateBreakpointCommand } = useBreakpoints();

			const existing = getBreakpoint(bp);
			if (!existing) {
				addBreakpoint(command ? { ...bp, command } : bp, vm);
				return json({ result: "added", breakpoint: describeBreakpoint(getBreakpoint(bp)!) });
			}
			let changed = false;
			if (!existing.enabled) {
				toggleBreakpointEnable(bp, vm);
				changed = true;
			}
			if (command !== undefined && command !== (existing.command ?? "")) {
				updateBreakpointCommand(bp, command);
				changed = true;
			}
			return json({
				result: changed ? "updated" : "unchanged",
				breakpoint: describeBreakpoint(getBreakpoint(bp)!),
			});
		},
	},
	{
		name: "remove_breakpoint",
		description:
			"Remove a breakpoint (same type and address/range as when it was set), or all of them with `all: true`. " +
			"Removing one that doesn't exist is not an error: `result` is `not_found`.",
		inputSchema: {
			type: "object",
			properties: {
				address: addressSchema,
				end_address: { ...addressSchema, description: "Last address of the range, as set" },
				type: { type: "string", enum: BP_TYPES, default: "pc" },
				all: {
					type: "boolean",
					description: "Remove every breakpoint (hooks included); ignores the other fields",
				},
			},
		},
		async execute(input) {
			const vm = await getVm();
			const { breakpoints, getBreakpoint, removeBreakpoint } = useBreakpoints();
			if (input.all === true) {
				const removed = breakpoints.value.map(describeBreakpoint);
				for (const bp of breakpoints.value) removeBreakpoint(bp, vm);
				return json({ result: "removed", count: removed.length, removed });
			}
			if (input.address === undefined) throw new Error("address: required (or `all: true`)");
			const bp = toBreakpoint(input);
			const existing = getBreakpoint(bp);
			if (!existing) return json({ result: "not_found", breakpoint: describeBreakpoint(bp) });
			removeBreakpoint(existing, vm);
			return json({ result: "removed", breakpoint: describeBreakpoint(existing) });
		},
	},
	{
		name: "list_breakpoints",
		description:
			"List breakpoints (hooks and run_until's temporary one included), sorted by address. With `address` " +
			"(and `end_address`), only those covering that address or overlapping that range.",
		inputSchema: {
			type: "object",
			properties: {
				address: addressSchema,
				end_address: { ...addressSchema, description: "Last address of the range to look at" },
			},
		},
		annotations: { readOnlyHint: true },
		async execute(input) {
			let list = useBreakpoints().breakpoints.value;
			if (input.address !== undefined) {
				const lo = toAddress(input.address, "address");
				const hi = input.end_address === undefined ? lo : toAddress(input.end_address, "end_address");
				if (hi < lo) throw new Error("end_address: must not be before address");
				list = list.filter((bp) => bp.address <= hi && (bp.endAddress ?? bp.address) >= lo);
			}
			return json({ count: list.length, breakpoints: list.map(describeBreakpoint) });
		},
	},
];

export const getToolDescriptors = (): McpToolDescriptor[] =>
	MCP_TOOLS.map(({ execute: _execute, ...descriptor }) => descriptor);

export const findTool = (name: string) => MCP_TOOLS.find((t) => t.name === name);
