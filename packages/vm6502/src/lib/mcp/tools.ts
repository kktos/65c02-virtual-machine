// The single registry of tools exposed to agents.
// Transports (the WebSocket bridge to the vm6502-mcp server, WebMCP) only adapt these definitions:
// a tool is written once here, with its JSON Schema, and is available everywhere.

import { watch } from "vue";
import { useMachine } from "@/composables/useMachine";
import { useCommands } from "@/composables/useCommands";
import { useBreakpoints } from "@/composables/useBreakpoints";
import { parseAddress } from "@/lib/parse.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
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

// Apple II text screen: 24 rows of 40 bytes, interleaved in 8 groups of 3 rows.
// 80-col mode interleaves aux (even columns) and main (odd columns) at the same addresses.
// Aux memory is bank 1 for debug reads ($1xxxx).
const AUX_BANK = 0x10000;
const decodeAppleChar = (c: number) => {
	let v = c & 0x7f;
	if (c < 0x80) v = c & 0x3f; // inverse ($00-$3F) and flashing ($40-$7F)
	if (v < 0x20) v += 0x40; // @ A-Z [ \ ] ^ _
	return v === 0x7f ? " " : String.fromCharCode(v);
};
const appleTextScreen = (vm: VirtualMachine, page: number, cols: number) => {
	const pageBase = page === 2 ? 0x800 : 0x400;
	const lines: string[] = [];
	for (let row = 0; row < 24; row++) {
		const base = pageBase + (row & 7) * 0x80 + (row >> 3) * 0x28;
		const main = vm.readDebugRange(base, 40);
		const aux = cols === 80 ? vm.readDebugRange(AUX_BANK + base, 40) : undefined;
		let line = "";
		for (let col = 0; col < 40; col++) {
			if (aux) line += decodeAppleChar(aux[col] ?? 0xa0);
			line += decodeAppleChar(main[col] ?? 0xa0);
		}
		lines.push(line.trimEnd());
	}
	return lines;
};

// ─── Tools ────────────────────────────────────────────────────────────────────

export const MCP_TOOLS: McpTool[] = [
	{
		name: "exec_command",
		description:
			"Run a line in the emulator's debugger console and return its output. " +
			"The full command language is available (`help` lists commands, `help <name>` details one): " +
			"disassembly, hexdump, labels, comments, breakpoints, hooks, routines, search, xref, etc. " +
			"Note: `run` returns immediately; use run_until to wait for the machine to stop.",
		inputSchema: {
			type: "object",
			properties: { command: { type: "string", description: "Command line, e.g. `help`, `d $300 20`" } },
			required: ["command"],
		},
		async execute(input) {
			const vm = await getVm();
			const { executeCommand, success, error, isLoading } = useCommands();
			if (isLoading.value) throw new Error("The console is busy with another command");
			const ok = await executeCommand(toStr(input.command, "command"), vm);
			if (!ok) throw new Error(error.value || "Command failed");
			return success.value.map((o) => o.content).join("\n") || "(no output)";
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
			return hexdump(address, vm.readDebugRange(address, length));
		},
	},
	{
		name: "get_registers",
		description: "CPU registers, flags (uppercase = set) and whether the machine is running.",
		inputSchema: { type: "object", properties: {} },
		annotations: { readOnlyHint: true },
		async execute() {
			return json(readRegisters(await getVm()));
		},
	},
	{
		name: "screen_text",
		description:
			"Apple II text screen as plain text (24 lines). Reads video memory directly, " +
			"regardless of the current display mode. Inverse/flashing chars are shown as normal chars.",
		inputSchema: {
			type: "object",
			properties: {
				page: { type: "integer", enum: [1, 2], default: 1 },
				cols: { type: "integer", enum: [40, 80], default: 40 },
			},
		},
		annotations: { readOnlyHint: true },
		async execute(input) {
			const vm = await getVm();
			if (!vm.machineConfig.name.startsWith("Apple"))
				throw new Error(`No text screen decoder for ${vm.machineConfig.name}`);
			const page = toInt(input.page, "page", 1, 1, 2);
			const cols = toInt(input.cols, "cols", 40, 40, 80) === 80 ? 80 : 40;
			return appleTextScreen(vm, page, cols).join("\n");
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
			"On timeout the machine is paused (unless pause_on_timeout is false). Returns why it stopped and the registers.",
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

			try {
				if (!isRunning.value) {
					vm.play();
					// Stopped again before we saw it running (e.g. breakpoint right at PC)
					if (!(await waitForRunning(true, 1000, signal)))
						return json({ stopped: "immediately", ...readRegisters(vm) });
				}
				if (await waitForRunning(false, timeoutMs, signal)) {
					const pc = vm.sharedRegisters.getUint16(REG_PC_OFFSET, true);
					const reason = address !== undefined && pc === address ? "reached address" : "stopped";
					return json({ stopped: reason, ...readRegisters(vm) });
				}
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
];

export const getToolDescriptors = (): McpToolDescriptor[] =>
	MCP_TOOLS.map(({ execute: _execute, ...descriptor }) => descriptor);

export const findTool = (name: string) => MCP_TOOLS.find((t) => t.name === name);
