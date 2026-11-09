// The single registry of tools exposed to agents.
// Transports (the WebSocket bridge to the vm6502-mcp server, WebMCP) only adapt these definitions:
// a tool is written once here, with its JSON Schema, and is available everywhere.

import { watch } from "vue";
import { useMachine } from "@/composables/useMachine";
import { useCommands } from "@/composables/useCommands";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { isSameAddress, useRunUntil } from "@/composables/useRunUntil";
import { useLogWindows } from "@/composables/useLogWindows";
import { DISK_EXTENSIONS, type InsertedDisk, useDiskDrive } from "@/composables/useDiskDrive";
import type { StoredDisk } from "@/composables/useDiskStorage";
import { parseAddress } from "@/lib/parse.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { StopInfo } from "@/types/stopinfo.interface";
import type { Breakpoint } from "@/types/breakpoint.interface";
import { HYPERCALL_NAMES } from "@/lib/hypercalls.lib";
import { disassemble } from "@/lib/disassembler";
import { base64ToBytes, bytesToBase64 } from "@/lib/png.lib";
import {
	type MemoryCandidate,
	type MemoryFilter,
	type MemoryRange,
	MemorySearch,
	normalizeRanges,
} from "@/lib/memorySearch.lib";
import { useSymbols } from "@/composables/useSymbols";
import { SAVE_STATES_MAX, type SaveStateInfo } from "@/virtualmachine/cpu/saveStates";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import {
	INSTRUCTION_TRACE_DEFAULT_SIZE,
	INSTRUCTION_TRACE_MAX_SIZE,
	type TraceSnapshot,
	unpackTraceEntries,
} from "@/virtualmachine/cpu/instructionTrace";
import { readRegisters } from "@/virtualmachine/cpu/shared-memory";

// ─── Types ────────────────────────────────────────────────────────────────────

export type JsonSchema = Record<string, unknown>;
export type ToolInput = Record<string, unknown>;

/** An MCP content block: what a tool can answer besides plain text. */
export type McpContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

/** Text (most tools), or MCP content blocks (e.g. an image), passed through as they are by the transports. */
export type McpToolResult = string | { content: McpContent[] };

export type McpTool = {
	name: string;
	description: string;
	/** JSON Schema of the input (always an object schema). */
	inputSchema: JsonSchema & { type: "object" };
	annotations?: { readOnlyHint?: boolean };
	/** Returns what is handed back to the agent. Throws on error. */
	execute: (input: ToolInput, ctx: { signal?: AbortSignal }) => Promise<McpToolResult>;
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

/**
 * Debug-writes `bytes` at `address` and reads them back: `notWritten` lists the ranges that didn't take
 * (I/O, slot ROM space, or bytes the running program changed in between). `previous`: the bytes before.
 */
const writeAndVerify = (vm: VirtualMachine, address: number, bytes: Uint8Array) => {
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
	return { written, notWritten, previous };
};

const addressSchema = {
	type: ["string", "integer"],
	description: 'Address: number, "$C000", "0xC000", or a label name. Above $FFFF selects a bank.',
};

const describeRegisters = (vm: VirtualMachine) => {
	const r = readRegisters(vm.sharedRegisters);
	return {
		running: useMachine().isRunning.value,
		PC: hex(r.PC, 4),
		A: hex(r.A, 2),
		X: hex(r.X, 2),
		Y: hex(r.Y, 2),
		SP: hex(r.SP, 2),
		P: hex(r.P, 2),
		flags: (["N", "V", "B", "D", "I", "Z", "C"] as const).map((f) => (r[f] ? f : f.toLowerCase())).join(""),
	};
};

const hexAddr = (a: number) => hex(a, a > 0xffff ? 6 : 4);

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
	...(bp.once && { once: true }),
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

/**
 * Waits for a stop the machine stays stopped on (not one a hook or a run until going through resumes from).
 * Resolves with it, or with undefined on timeout / abort.
 */
const waitForSettledStop = (ms: number, signal?: AbortSignal, accept: (stop: StopInfo) => boolean = () => true) =>
	new Promise<StopInfo | undefined>((resolve) => {
		const done = (stop: StopInfo | undefined) => {
			clearTimeout(timer);
			off();
			signal?.removeEventListener("abort", onAbort);
			resolve(stop);
		};
		const onAbort = () => done(undefined);
		const timer = setTimeout(() => done(undefined), ms);
		const off = useRunUntil().onSettledStop((stop) => accept(stop) && done(stop));
		if (signal?.aborted) return done(undefined);
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

/**
 * Marks a string property as a file on the agent's machine: the vm6502-mcp server reads it and passes a
 * `HostFile` in its place (a page can't read the agent's files). Other transports (WebMCP) pass the string.
 */
export const HOST_FILE_KEY = "x-vm6502-host-file";
const hostFileSchema = (description: string) => ({ type: "string", description, [HOST_FILE_KEY]: true });

/** What the vm6502-mcp server sends for a host file property. */
export type HostFile = { name: string; path: string; size: number; data: string };

const toHostFile = (v: unknown, field: string) => {
	if (typeof v === "string")
		throw new Error(
			`${field}: files on the agent's machine are read by the vm6502-mcp server, not by this transport`,
		);
	const f = v as Partial<HostFile> | null;
	if (!f || typeof f !== "object" || typeof f.name !== "string" || typeof f.data !== "string")
		throw new Error(`${field}: file path expected`);
	return { name: f.name, path: String(f.path ?? f.name), bytes: base64ToBytes(f.data) };
};

/** CiderPress-style file name `NAME#06AAAA`: ProDOS type $06 (BIN), aux type = load address. */
const binLoadAddress = (name: string) => {
	const m = name.match(/#([0-9a-f]{2})([0-9a-f]{4})(?:\.[^.#]*)?$/i);
	return m && (m[1] as string).toLowerCase() === "06" ? Number.parseInt(m[2] as string, 16) : undefined;
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

// ─── Memory search (memory_snapshot / memory_diff) ────────────────────────────

const SEARCH_DEFAULT_RANGE: MemoryRange = { start: 0x0000, end: 0xbfff }; // Apple II main RAM below the I/O
const SEARCH_MAX_BYTES = 0x40000;
const MEMORY_FILTERS = ["changed", "unchanged", "increased", "decreased", "equals", "not_equals"] as const;

/** The search in progress: kept in the tab between calls. */
let memorySearch: MemorySearch | undefined;

/** For tests. */
export const resetMemorySearch = () => {
	memorySearch = undefined;
};

const toRange = (address: unknown, endAddress: unknown, field: string): MemoryRange => {
	const start = toAddress(address, `${field}address`);
	const end = endAddress === undefined || endAddress === null ? start : toAddress(endAddress, `${field}end_address`);
	return { start, end };
};

const toSearchRanges = (input: ToolInput): MemoryRange[] => {
	let ranges: MemoryRange[];
	if (input.ranges !== undefined) {
		if (input.address !== undefined) throw new Error("address: give `ranges` or `address`, not both");
		if (!Array.isArray(input.ranges) || !input.ranges.length) throw new Error("ranges: non-empty array expected");
		ranges = input.ranges.map((r, i) => {
			if (!r || typeof r !== "object") throw new Error(`ranges[${i}]: { address, end_address } expected`);
			const { address, end_address } = r as ToolInput;
			if (end_address === undefined) throw new Error(`ranges[${i}].end_address: required`);
			return toRange(address, end_address, `ranges[${i}].`);
		});
	} else if (input.address !== undefined) {
		if (input.end_address === undefined) throw new Error("end_address: required with address");
		ranges = [toRange(input.address, input.end_address, "")];
	} else ranges = [SEARCH_DEFAULT_RANGE];
	ranges = normalizeRanges(ranges);
	const size = ranges.reduce((n, r) => n + r.end - r.start + 1, 0);
	if (size > SEARCH_MAX_BYTES) throw new Error(`ranges: at most ${SEARCH_MAX_BYTES} bytes in all (${size} asked)`);
	return ranges;
};

const toByte = (v: unknown, field: string): number => {
	if (typeof v === "string") {
		const m = v.trim().match(/^(?:\$|0x)([0-9a-f]{1,2})$/i);
		if (m) return Number.parseInt(m[1] as string, 16);
	}
	return toInt(v, field, 0, 0, 255);
};

const toMemoryFilter = (input: ToolInput): MemoryFilter => {
	const kind = input.filter as (typeof MEMORY_FILTERS)[number];
	if (!MEMORY_FILTERS.includes(kind)) throw new Error(`filter: must be one of ${MEMORY_FILTERS.join(", ")}`);
	if (kind === "equals" || kind === "not_equals") {
		if (input.value === undefined) throw new Error(`value: required with ${kind}`);
		return { kind, value: toByte(input.value, "value") };
	}
	if (input.value !== undefined) throw new Error(`value: only with equals / not_equals`);
	if (kind === "increased" || kind === "decreased")
		return input.by === undefined ? { kind } : { kind, by: toInt(input.by, "by", 1, 1, 255) };
	if (input.by !== undefined) throw new Error("by: only with increased / decreased");
	return { kind };
};

const describeRange = (r: MemoryRange) => ({ address: hexAddr(r.start), end_address: hexAddr(r.end) });

const describeCandidate = (c: MemoryCandidate) => {
	const label = c.address <= 0xffff ? useSymbols().getLabelForAddress(c.address) : undefined;
	return {
		address: hexAddr(c.address),
		...(label && { label }),
		previous: hex(c.previous, 2),
		value: hex(c.value, 2),
	};
};

// ─── Save states ──────────────────────────────────────────────────────────────

const DEFAULT_STATE_NAME = "default";

type StateDisk = { key: string; name: string } | null;
const stateDisk = (info: SaveStateInfo): StateDisk => (info.meta.disk as StateDisk | undefined) ?? null;

const describeState = (info: SaveStateInfo) => ({
	name: info.name,
	pc: hex(info.pc, 4),
	...(info.cycles !== undefined && { cycles: info.cycles }),
	created: new Date(info.createdAt).toISOString(),
	bytes: info.bytes,
	disk: stateDisk(info),
});

const toStateName = (v: unknown) => {
	if (v === undefined) return DEFAULT_STATE_NAME;
	const name = toStr(v, "name").trim();
	if (!name) throw new Error("name: must not be empty");
	return name;
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
			const report = await useCommands().runCommand(toStr(input.command, "command"), vm, {
				standalone: true,
				source: "mcp",
			});
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
			const { written, notWritten, previous } = writeAndVerify(vm, address, bytes);
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
			"why it last stopped (`last_stop`, same values as run_until's `stopped`), and the run until's target " +
			"while it is armed (`pending_target`, see run_until).",
		inputSchema: { type: "object", properties: {} },
		annotations: { readOnlyHint: true },
		async execute() {
			const vm = await getVm();
			const regs = describeRegisters(vm);
			const target = useRunUntil().getRunUntilTarget();
			return json({
				...regs,
				...(!regs.running && vm.lastStop && { last_stop: describeStop(vm.lastStop) }),
				...(target && { pending_target: hexAddr(target.address), ...(target.through && { through: true }) }),
			});
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
		name: "screenshot",
		description:
			"The screen as a PNG image, as displayed: any video mode (text, GR, HGR, double hi-res…) with the " +
			"border, at the video buffer's resolution (Apple //e: 640x480, the 560x384 picture in its border, " +
			"so a hi-res pixel is 2x2). When paused, the frame is redrawn from memory first. For text, " +
			"screen_text is exact and much cheaper.",
		inputSchema: { type: "object", properties: {} },
		annotations: { readOnlyHint: true },
		async execute() {
			const vm = await getVm();
			const shot = await vm.screenshot();
			if (!shot) throw new Error(`No video output for ${vm.machineConfig.name}`);
			return {
				content: [
					{ type: "image", data: bytesToBase64(shot.png), mimeType: "image/png" },
					{ type: "text", text: json({ width: shot.width, height: shot.height, running: vm.isRunning }) },
				],
			};
		},
	},
	{
		name: "memory_snapshot",
		description:
			"Start a memory search (cheat-finder style): records the bytes of the ranges, and every byte becomes a " +
			"candidate. Then let the program run (run_until, type_keys…) and call memory_diff to keep only the bytes " +
			"that changed the way you expect (lives counter: `decreased` `by: 1` after losing a life, `unchanged` while " +
			"nothing happens); repeat until a few remain, then confirm with write_memory or a write breakpoint. " +
			"Default range: $0000-$BFFF (Apple II main RAM). `address` + `end_address`, or `ranges` ([{ address, " +
			"end_address }], not overlapping): above $FFFF selects a bank (Apple II: $10000-$1BFFF = aux RAM); " +
			"$D000-$FFFF reads what is currently mapped there. At most 256 KB in all. Debug reads (no I/O side " +
			"effects), works running or paused. Replaces the search in progress. Byte-wise: a 16-bit or BCD " +
			"counter shows as its bytes.",
		inputSchema: {
			type: "object",
			properties: {
				address: { ...addressSchema, description: "Start of a single range (with end_address)" },
				end_address: { ...addressSchema, description: "Last address of the range (inclusive)" },
				ranges: {
					type: "array",
					items: {
						type: "object",
						properties: { address: addressSchema, end_address: addressSchema },
						required: ["address", "end_address"],
					},
					description: "Several ranges instead of address / end_address",
				},
			},
		},
		annotations: { readOnlyHint: true },
		async execute(input) {
			const vm = await getVm();
			const ranges = toSearchRanges(input);
			vm.syncBusState(); // language card banking decides what $D000-$FFFF holds
			memorySearch = new MemorySearch(ranges, (a, n) => vm.readDebugRange(a, n));
			return json({
				ranges: ranges.map(describeRange),
				candidates: memorySearch.count,
				note: "Run the program, then call memory_diff with a filter",
			});
		},
	},
	{
		name: "memory_diff",
		description:
			"Narrow the memory search started by memory_snapshot: compares each candidate's value now to its " +
			"reference (its value at the snapshot, then at the previous memory_diff) and keeps those matching " +
			"`filter`: `changed`, `unchanged`, `increased` / `decreased` (with `by`: by exactly that much, modulo 256, " +
			"so $00 → $FF is decreased by 1; without: unsigned compare), `equals` / `not_equals` `value` (the value " +
			"now; e.g. right after the snapshot when you know the lives count). The kept candidates' value now " +
			"becomes their reference for the next call. Without `filter`, nothing is narrowed: lists the candidates " +
			"with their reference (`previous`) and current `value`. Returns `before` / `remaining` counts, `round` " +
			"and the first `count` candidates (default 50, max 500): `address`, `label`, `previous`, `value`; `more: " +
			"true` when there are others. The search lives in the browser tab: a reload loses it.",
		inputSchema: {
			type: "object",
			properties: {
				filter: { type: "string", enum: [...MEMORY_FILTERS] },
				value: {
					type: ["integer", "string"],
					description: 'Byte (0-255 or "$2A") for equals / not_equals',
				},
				by: {
					type: "integer",
					minimum: 1,
					maximum: 255,
					description: "For increased / decreased: exact change",
				},
				count: { type: "integer", minimum: 1, maximum: 500, default: 50, description: "Candidates listed" },
			},
		},
		annotations: { readOnlyHint: true },
		async execute(input) {
			const vm = await getVm();
			if (!memorySearch) throw new Error("No memory search: call memory_snapshot first");
			const search = memorySearch;
			const count = toInt(input.count, "count", 50, 1, 500);
			const filter = input.filter === undefined ? undefined : toMemoryFilter(input);
			vm.syncBusState();
			const read = (a: number, n: number) => vm.readDebugRange(a, n);
			const before = search.count;
			const candidates = filter ? search.filter(filter, read, count) : search.list(read, count);
			const head = {
				...(filter && {
					filter: filter.kind,
					...("by" in filter && filter.by !== undefined && { by: filter.by }),
					...("value" in filter && { value: hex(filter.value, 2) }),
					before,
				}),
				round: search.rounds,
				remaining: search.count,
				...(search.count === 0 && { note: "No candidate left: start again with memory_snapshot" }),
			};
			return jsonWithList(
				head,
				"candidates",
				candidates.map(describeCandidate),
				search.count > candidates.length ? { more: true } : {},
			);
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
		description:
			"Type text on the emulated keyboard: the keys are queued and the program gets them as it reads the " +
			"keyboard ($C000), one at a time; paused, they wait (type, then boot or run). \\n is Return; other " +
			"control keys as JSON escapes: \\u001b Esc, \\u0003 Ctrl-C, \\b ←, \\u0015 →. Returns how many were " +
			"queued and the keyboard state (`queued`: still waiting). If a program eats keys (it flushes the keyboard " +
			"after reading one), lengthen the delay between keys: exec_command `key delay <cycles>`; `key clear` " +
			"empties the queue.",
		inputSchema: {
			type: "object",
			properties: { text: { type: "string" } },
			required: ["text"],
		},
		async execute(input) {
			const vm = await getVm();
			const text = toStr(input.text, "text");
			const { queued, skipped, state } = await vm.typeText(text);
			return json({
				queued,
				...(skipped && { skipped }),
				keyboard: state,
				...(!useMachine().isRunning.value && { note: "The machine is paused: the keys are read when it runs" }),
			});
		},
	},
	{
		name: "hold_key",
		description:
			"Hold a key down on the emulated keyboard, as a finger would: latched now, it reads as down in $C010 " +
			"bit 7 (AKD) and repeats (after ~0.5 s, then 15/s) until released. Works paused (hold, then boot: " +
			'"a key held at boot"). `key`: a character, or a key code (0-127); omit it to release the key held.',
		inputSchema: {
			type: "object",
			properties: { key: { type: ["string", "integer"] } },
		},
		async execute(input) {
			const vm = await getVm();
			let key: string | number | null = null;
			if (typeof input.key === "string") {
				if (input.key.length === 0) throw new Error("key: a character expected");
				key = input.key;
			} else if (input.key !== undefined && input.key !== null) key = toInt(input.key, "key", 0, 0, 127);
			const { state } = await vm.holdKey(key);
			return json({ keyboard: state });
		},
	},
	{
		name: "run_until",
		description:
			"Resume the machine and block until it stops (breakpoint, BRK, pause) or the timeout expires. " +
			"With `address`, a temporary PC breakpoint is set there first (the run until's target). " +
			"`breakpoints`: `honour` (default) lets the other breakpoints stop the machine on the way; the target then " +
			"stays armed (`pending_target` in the result), so the next run / run_until goes on to it. `through` " +
			"doesn't stop on them (their hooks still run) until the machine stops for something else. " +
			"A hook (a breakpoint whose command resumes the machine) never ends the wait. " +
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
				breakpoints: { type: "string", enum: ["honour", "through"], default: "honour" },
				timeout_ms: { type: "integer", minimum: 10, maximum: 120_000, default: 5000 },
				pause_on_timeout: { type: "boolean", default: true },
			},
		},
		async execute(input, { signal }) {
			const vm = await getVm();
			const address = input.address === undefined ? undefined : toAddress(input.address, "address");
			const timeoutMs = toInt(input.timeout_ms, "timeout_ms", 5000, 10, 120_000);
			const pauseOnTimeout = input.pause_on_timeout !== false;
			const mode = input.breakpoints ?? "honour";
			if (mode !== "honour" && mode !== "through") throw new Error("breakpoints: must be honour or through");
			if (mode === "through" && address === undefined) throw new Error("breakpoints: through needs an address");
			const { startRunUntil, getRunUntilTarget } = useRunUntil();

			// The target, if still armed: the machine stopped before it
			const pending = () => {
				const t = getRunUntilTarget();
				return t ? { pending_target: hexAddr(t.address), ...(t.through && { through: true }) } : {};
			};
			// Only the stops after this call: one the main thread is still busy with (a hook) is not ours.
			// The worker answers by message: no stop can come before the wait below is set.
			const stopBefore = vm.lastStop;
			if (address !== undefined) startRunUntil(vm, address, { through: mode === "through" });
			else if (!vm.isRunningOrStarting) vm.play();
			const stopped = waitForSettledStop(timeoutMs, signal, (stop) => stop !== stopBefore);
			// Without `address`, an armed target is where it goes
			const goal = address ?? getRunUntilTarget()?.address;

			const stop = await stopped;
			if (stop) return json({ ...describeStop(stop, goal), ...pending(), ...describeRegisters(vm) });

			const why = signal?.aborted ? "cancelled" : "timeout";
			if (pauseOnTimeout) {
				const paused = waitForSettledStop(1000);
				vm.pause();
				await paused;
			}
			return json({
				stopped: `${why} (${pauseOnTimeout ? "paused" : "still running"})`,
				...pending(),
				...describeRegisters(vm),
			});
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
			return json(describeRegisters(vm));
		},
	},
	{
		name: "step",
		description:
			"Execute `count` instructions (default 1) on the paused machine, like the debugger's Step Into: BRKs and " +
			"hypercalls execute, read/write breakpoints don't fire. Stops early after an error (unimplemented opcode), " +
			"a hypercall with the stop bit (`BRK $8x`), or when the next instruction has a PC breakpoint. Returns " +
			"`executed`, the registers and, if it stopped early, `stopped` (same values as run_until). " +
			"The machine must be paused (call pause first). " +
			"`mode`: `into` (the default; the above), `over` (a JSR runs to the instruction after it, anything else " +
			"is one step), `out` (runs until the current routine returns). Over a JSR and out run the machine and " +
			"block like run_until (`timeout_ms`, `pause_on_timeout`); `stopped` is `step` at their end. " +
			"`breakpoints`, for them: `honour` (default) lets the breakpoints on the way stop the machine; the step " +
			"then stays armed, so the next run_until (without address) goes on to its end. `through` doesn't stop on " +
			"them (their hooks still run) until the machine stops for something else.",
		inputSchema: {
			type: "object",
			properties: {
				count: { type: "integer", minimum: 1, maximum: 100_000, default: 1 },
				mode: { type: "string", enum: ["into", "over", "out"], default: "into" },
				breakpoints: { type: "string", enum: ["honour", "through"], default: "honour" },
				timeout_ms: { type: "integer", minimum: 10, maximum: 120_000, default: 5000 },
				pause_on_timeout: { type: "boolean", default: true },
			},
		},
		async execute(input, { signal }) {
			const vm = await getVm();
			const mode = input.mode ?? "into";
			if (mode !== "into" && mode !== "over" && mode !== "out")
				throw new Error("mode: must be into, over or out");
			const breakpoints = input.breakpoints ?? "honour";
			if (breakpoints !== "honour" && breakpoints !== "through")
				throw new Error("breakpoints: must be honour or through");
			if (mode !== "into" && input.count !== undefined) throw new Error("count: only with mode into");
			if (mode === "into" && input.breakpoints !== undefined)
				throw new Error("breakpoints: only with mode over / out");
			if (useMachine().isRunning.value) throw new Error("The machine is running: pause it first");

			if (mode === "into") {
				const count = toInt(input.count, "count", 1, 1, 100_000);
				const { executed, stop } = await vm.step(count);
				return json({ executed, ...(stop && describeStop(stop)), ...describeRegisters(vm) });
			}

			const timeoutMs = toInt(input.timeout_ms, "timeout_ms", 5000, 10, 120_000);
			const pauseOnTimeout = input.pause_on_timeout !== false;
			// Set before the step: the worker's stop messages may come before its reply
			const stopBefore = vm.lastStop;
			const noRun = new AbortController();
			const waitSignal = signal ? AbortSignal.any([signal, noRun.signal]) : noRun.signal;
			const stopped = waitForSettledStop(timeoutMs, waitSignal, (stop) => stop !== stopBefore);
			const through = breakpoints === "through";
			const { running, step } = await (mode === "over" ? vm.stepOver(through) : vm.stepOut(through));
			if (!running) {
				noRun.abort();
				if (!step) throw new Error("The machine is running: pause it first");
				// Not on a JSR: a single step
				return json({
					executed: step.executed,
					...(step.stop && describeStop(step.stop)),
					...describeRegisters(vm),
				});
			}

			const stop = await stopped;
			if (stop) return json({ ...describeStop(stop), ...describeRegisters(vm) });

			const why = signal?.aborted ? "cancelled" : "timeout";
			if (pauseOnTimeout) {
				const paused = waitForSettledStop(1000);
				vm.pause();
				await paused;
			}
			return json({
				stopped: `${why} (${pauseOnTimeout ? "paused" : "still running"})`,
				...describeRegisters(vm),
			});
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
			return json(describeRegisters(vm));
		},
	},
	{
		name: "list_disks",
		description:
			"The disk library (images kept in the browser) and what is in the drive. Use a disk from here with " +
			"load_disk rather than asking for the file again. Each disk: `key` (what load_disk takes; the file name, " +
			"or the URL for a URL disk), `name` (display name, may have been renamed), `type` (`physical` = stored " +
			"image, `url` = fetched when loaded), `size` (bytes; 0 for a URL disk not fetched yet), `in_drive: true` for " +
			"the inserted one.",
		inputSchema: { type: "object", properties: {} },
		annotations: { readOnlyHint: true },
		async execute() {
			const { inserted, listDisks } = useDiskDrive();
			const inDrive = inserted.value;
			const disks = (await listDisks()).map((d) => {
				const isInDrive = !!inDrive && String(inDrive.key) === String(d.key);
				return {
					key: String(d.key),
					name: d.name,
					type: d.type,
					// a URL disk's library entry has no size: once fetched, the inserted one has it
					size: isInDrive && !d.size ? inDrive.size : d.size,
					...(d.path && d.path !== String(d.key) && d.path !== d.name && { path: d.path }),
					...(isInDrive && { in_drive: true }),
				};
			});
			return json({ in_drive: inDrive ? describeDisk(inDrive) : null, count: disks.length, disks });
		},
	},
	{
		name: "load_disk",
		description:
			"Insert a disk into the drive: from the library (see list_disks) by `key` or name, or an image file on " +
			"your machine by `path` (" +
			DISK_EXTENSIONS.join(" ") +
			"; read by the vm6502-mcp server: absolute, or relative to its working directory, `~` allowed; max 64 MB), " +
			"which is added to the library under its file name (replacing a library disk with the same file name). " +
			"Like the user loading it: its labels / data formats / notes become the current disk's, and it comes back " +
			"at the next startup. Inserting doesn't restart the machine: `boot: true` then cold-boots (like " +
			"Ctrl-OpenApple-Reset: the ROM scans the slots and boots the disk) and leaves it running; use run_until / " +
			"screen_text to follow the boot. Returns the inserted disk.",
		inputSchema: {
			type: "object",
			properties: {
				disk: { type: "string", description: "Library key or disk name" },
				path: hostFileSchema("Disk image file on the agent's machine, instead of `disk`"),
				boot: { type: "boolean", default: false, description: "Cold-boot after inserting" },
			},
		},
		async execute(input) {
			const vm = await getVm();
			if (!vm.machineConfig.disk) throw new Error(`${vm.machineConfig.name} has no disk drive`);
			if ((input.disk === undefined) === (input.path === undefined))
				throw new Error("disk or path: give one of them");
			const { listDisks, insertFromLibrary, insertFile } = useDiskDrive();

			let disk: InsertedDisk;
			let fromFile: Record<string, unknown> = {};
			if (input.path !== undefined) {
				const file = toHostFile(input.path, "path");
				const lower = file.name.toLowerCase();
				if (!DISK_EXTENSIONS.some((ext) => lower.endsWith(ext)))
					throw new Error(`path: ${file.name} is not a disk image (${DISK_EXTENSIONS.join(", ")})`);
				const replaced = (await listDisks()).some((d) => String(d.key) === file.name);
				disk = await insertFile(vm, file.name, file.bytes.buffer);
				fromFile = { path: file.path, added_to_library: true, ...(replaced && { replaced: true }) };
			} else {
				const found = findLibraryDisk(await listDisks(), toStr(input.disk, "disk").trim());
				disk = await insertFromLibrary(vm, found.key);
			}
			if (input.boot === true) await coldBoot(vm);
			return json({
				result: "inserted",
				disk: describeDisk(disk),
				...fromFile,
				...(input.boot === true && { booted: true, ...describeRegisters(vm) }),
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
		name: "load_binary",
		description:
			"Load a file from your machine into memory (e.g. code you assembled): its bytes are written from " +
			"`address`, like write_memory (above $FFFF selects a bank, Apple II $1xxxx = aux; $D000-$FFFF goes to " +
			"what is mapped there). The file is read by the vm6502-mcp server (`path`: absolute, or relative to its " +
			"working directory, `~` allowed) and must fit in the address's 64K bank. Without `address`, a " +
			"CiderPress-style name gives it: `PROG#060800` (type $06 BIN, load address $0800). `set_pc: true` then " +
			"sets PC to `address` (machine paused only: pause first), ready for step / run_until. Raw bytes: no " +
			"header is stripped. Returns `address`, `end_address`, `length`, `written` and `not_written` (ranges that " +
			"didn't take: I/O $C000-$C0FF, slot ROM space, or bytes the running program changed).",
		inputSchema: {
			type: "object",
			properties: {
				path: hostFileSchema("File on the agent's machine"),
				address: { ...addressSchema, description: "Load address (default: from a `#06AAAA` file name)" },
				set_pc: { type: "boolean", default: false, description: "Set PC to address (paused machine only)" },
			},
			required: ["path"],
		},
		async execute(input) {
			const vm = await getVm();
			if (input.path === undefined) throw new Error("path: required");
			const file = toHostFile(input.path, "path");
			const address =
				input.address !== undefined ? toAddress(input.address, "address") : binLoadAddress(file.name);
			if (address === undefined)
				throw new Error(`address: required (${file.name} has no #06AAAA suffix giving a load address)`);
			if (!file.bytes.length) throw new Error(`path: ${file.name} is empty`);
			const end = address + file.bytes.length - 1;
			if (end >> 16 !== address >> 16)
				throw new Error(
					`path: ${file.name} (${file.bytes.length} bytes) doesn't fit in the bank from ${hexAddr(address)}`,
				);
			const setPc = input.set_pc === true;
			if (setPc && useMachine().isRunning.value)
				throw new Error("set_pc: the machine is running, pause it first");

			const { written, notWritten } = writeAndVerify(vm, address, file.bytes);
			if (setPc) vm.updateRegister("PC", address & 0xffff);
			return json({
				path: file.path,
				address: hexAddr(address),
				end_address: hexAddr(end),
				length: file.bytes.length,
				written,
				...(notWritten.length && { not_written: notWritten }),
				...(setPc && describeRegisters(vm)),
			});
		},
	},
	{
		name: "save_state",
		description:
			"Save the whole machine under `name` (default `default`; an existing state with that name is replaced): " +
			"CPU registers, all memory (main / aux RAM, language card, ROMs), soft switches and the rest of the bus " +
			"(keyboard latch, cycle counter…), the cards (mouse, the disk in the drive). restore_state puts it all back, " +
			"to repeat an experiment from the same point (restore → patch → run → compare). Works running or paused " +
			`(taken between two instructions). States live in the browser tab, at most ${SAVE_STATES_MAX}, and are ` +
			"lost when the page reloads or the machine is rebuilt. Not saved: breakpoints, the instruction trace, " +
			"labels / metadata, live inputs (joystick). Returns `result` (`saved` / `replaced`) and the state: `name`, " +
			"`pc`, `cycles`, `created`, `bytes`, `disk` (the one in the drive).",
		inputSchema: {
			type: "object",
			properties: { name: { type: "string", default: DEFAULT_STATE_NAME } },
		},
		async execute(input) {
			const vm = await getVm();
			const name = toStateName(input.name);
			const existed = (await vm.listMachineStates()).some((st) => st.name === name);
			const disk = useDiskDrive().inserted.value;
			const info = await vm.saveMachineState(name, {
				disk: disk ? { key: String(disk.key), name: disk.name } : null,
			});
			return json({ result: existed ? "replaced" : "saved", state: describeState(info) });
		},
	},
	{
		name: "restore_state",
		description:
			"Put the machine back as it was when save_state saved `name` (default `default`): registers, memory, " +
			"soft switches, cards. The machine is left paused (patch with write_memory, then run_until / step). The " +
			"state is kept: restore it as many times as needed. Breakpoints stay as they are now. If the disk in the " +
			"drive has changed since, the machine gets the saved one back but the toolbar still shows the current one " +
			"(`disk_note`). Returns the state and the registers.",
		inputSchema: {
			type: "object",
			properties: { name: { type: "string", default: DEFAULT_STATE_NAME } },
		},
		async execute(input) {
			const vm = await getVm();
			const name = toStateName(input.name);
			const info = await vm.restoreMachineState(name);
			if (!info) {
				const names = (await vm.listMachineStates()).map((st) => st.name);
				throw new Error(
					`name: no save state '${name}' (${names.length ? `have: ${names.join(", ")}` : "none saved"})`,
				);
			}
			await waitForRunning(false, 1000);
			vm.syncBusState(); // the main thread's copy of the soft switches
			const saved = stateDisk(info);
			const now = useDiskDrive().inserted.value;
			const diskNote =
				(saved?.key ?? null) !== (now ? String(now.key) : null)
					? `the machine has the saved state's disk (${saved?.name ?? "none"}); the toolbar still shows ${now?.name ?? "no disk"}`
					: undefined;
			return json({
				result: "restored",
				state: describeState(info),
				...(diskNote && { disk_note: diskNote }),
				...describeRegisters(vm),
			});
		},
	},
	{
		name: "list_states",
		description: "The save states (oldest first): `name`, `pc`, `cycles`, `created`, `bytes`, `disk`.",
		inputSchema: { type: "object", properties: {} },
		annotations: { readOnlyHint: true },
		async execute() {
			const vm = await getVm();
			const states = await vm.listMachineStates();
			return jsonWithList({ count: states.length, max: SAVE_STATES_MAX }, "states", states.map(describeState));
		},
	},
	{
		name: "delete_state",
		description:
			"Delete the save state `name`, or all of them with `all: true`. Deleting one that doesn't exist is not an " +
			"error: `result` is `not_found`.",
		inputSchema: {
			type: "object",
			properties: {
				name: { type: "string" },
				all: { type: "boolean", description: "Delete every save state; ignores `name`" },
			},
		},
		async execute(input) {
			const vm = await getVm();
			if (input.all === true) {
				const deleted = await vm.deleteMachineStates();
				return json({ result: "deleted", count: deleted.length, deleted });
			}
			if (input.name === undefined) throw new Error("name: required (or `all: true`)");
			const name = toStateName(input.name);
			const deleted = await vm.deleteMachineStates(name);
			return json({ result: deleted.length ? "deleted" : "not_found", name });
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
