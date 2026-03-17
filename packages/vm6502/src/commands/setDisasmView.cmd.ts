import { useAddressHistory } from "@/composables/useAddressHistory";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useMachine } from "@/composables/useMachine";
import { disassembleRange, formatDisassemblyAsText } from "@/lib/disassembler";
import { formatAddress } from "@/lib/hex.utils";
import type { Command, CommandContext } from "@/types/command";

const { setActiveTab } = useDebuggerNav();
const { jumpToAddress } = useAddressHistory("disassembly");

export const setDisasmView: Command = {
	description: "Set disasm <address>, or disasm a <range> to console",
	paramDef: ["range|address"],
	group: "Viewers",
	fn: async ({ vm, params }: CommandContext) => {
		const val = params[0];

		if (typeof val === "number") {
			setActiveTab("disassembly");
			jumpToAddress(val);
			return `DisasmViewer address set to $${formatAddress(val)}`;
		}

		if (typeof val === "object" && val !== null && "start" in val) {
			const { start, end } = val as { start: number; end: number };

			const readByte = (address: number, debug = true) => (debug ? vm.readDebug(address) : vm.read(address)) ?? 0;
			const { registers } = useMachine();
			const lines = disassembleRange(readByte, vm.getScope(start), start, end, registers);
			const source = formatDisassemblyAsText(lines);

			// print("text", source);
			// return `Disassembly for range [${formatAddress(start)} - ${formatAddress(end)}]`;
			return source;
		}

		throw new Error("Invalid parameter type for disassembly command.");
	},
};
