import { useLogWindows } from "@/composables/useLogWindows";
import type { Command } from "@/composables/useCommands";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useSymbols } from "@/composables/useSymbols";
import {
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "@/virtualmachine/cpu/shared-memory";
import { toHex } from "@/lib/hex.utils";

const evaluateArg = (arg: string, vm: VirtualMachine): string => {
	// Check for registers
	switch (arg.toUpperCase()) {
		case "A":
			return toHex(vm.sharedRegisters.getUint8(REG_A_OFFSET));
		case "X":
			return toHex(vm.sharedRegisters.getUint8(REG_X_OFFSET));
		case "Y":
			return toHex(vm.sharedRegisters.getUint8(REG_Y_OFFSET));
		case "SP":
			return toHex(vm.sharedRegisters.getUint8(REG_SP_OFFSET));
		case "PC":
			return toHex(vm.sharedRegisters.getUint8(REG_PC_OFFSET), 4);
		case "FLAGS":
		case "P": {
			const p = vm.sharedRegisters.getUint8(REG_STATUS_OFFSET);
			const flags = [
				p & 0x80 ? "N" : "n",
				p & 0x40 ? "V" : "v",
				p & 0x20 ? "1" : "0", // unused
				p & 0x10 ? "B" : "b",
				p & 0x08 ? "D" : "d",
				p & 0x04 ? "I" : "i",
				p & 0x02 ? "Z" : "z",
				p & 0x01 ? "C" : "c",
			].join("");
			return `${flags} ($${toHex(p)})`;
		}
	}

	// Check for memory access mem[<address>]
	const memMatch = arg.match(/^mem\[(.+)\]$/i);
	if (memMatch) {
		const addrStr = memMatch[1] as string;
		let address: number;
		if (addrStr.toUpperCase() === "PC") {
			address = vm.sharedRegisters.getUint8(REG_PC_OFFSET);
		} else {
			const { getAddressForLabel } = useSymbols();
			const isHex = addrStr.startsWith("$");
			if (isHex) {
				const cleanStr = addrStr.slice(1);
				if (!/^[0-9A-Fa-f]+$/.test(cleanStr)) return `<invalid hex: ${addrStr}>`;
				address = parseInt(cleanStr, 16);
			} else if (/^\d+$/.test(addrStr)) {
				address = parseInt(addrStr, 10);
			} else {
				const value = getAddressForLabel(addrStr);
				if (value === undefined) return `<unknown label: ${addrStr}>`;
				address = value;
			}
		}

		if (Number.isNaN(address) || address < 0 || address > 0xffff) return `<invalid address: ${address}>`;

		const value = vm.read(address);
		return `$${toHex(value)}`;
	}

	// It's a string literal (or a number we pass through)
	return arg;
};

const parseAndEval = (text: string, vm: VirtualMachine): string => {
	const matches = text.match(/(?:"[^"]*"|[^,]+)/g);
	if (!matches) return text; // Not a comma-separated list, trace as is.

	const evaluatedArgs = matches.map((arg) => {
		const currentArg = arg.trim();
		if (currentArg.startsWith('"') && currentArg.endsWith('"')) {
			return currentArg.substring(1, currentArg.length - 1);
		}
		return evaluateArg(currentArg, vm);
	});

	return evaluatedArgs.join(" ");
};

export const logCmd: Command = {
	description:
		"Interact with log windows. Usage: log <name> [open|close|clear] | <args...>. Args can be strings, numbers, registers (A,X,Y,SP,PC,FLAGS), or memory (mem[addr]).",
	paramDef: ["string", "rest?"],
	fn: (vm, _progress, params) => {
		const { open, close, trace, clear } = useLogWindows();
		const name = params[0] as string;
		const rest = params[1] as string | undefined;

		if (!name) throw new Error("Log window name is required.");

		if (!rest) {
			open(name);
			return `Log window '${name}' is active.`;
		}

		const subcommand = rest.split(/\s+/)[0]?.toLowerCase();

		if (subcommand === "open") {
			open(name);
			return `Log window '${name}' opened.`;
		}
		if (subcommand === "close") {
			close(name);
			return `Log window '${name}' closed.`;
		}
		if (subcommand === "clear") {
			clear(name);
			return `Log window '${name}' cleared.`;
		}

		// If no subcommand matched, treat the whole 'rest' as text to trace.
		const textToTrace = parseAndEval(rest, vm);
		trace(name, textToTrace);
		return ""; // No success message for every trace to avoid spam
	},
};
