import { useAddressHistory } from "@/composables/useAddressHistory";
import { isParamListItemRange } from "@/composables/useCommands";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { disassembleRange, formatDisassemblyAsText } from "@/lib/disassembler";
import { formatAddress } from "@/lib/hex.utils";
import type { Command, CommandContext, ParamListItemIdentifier } from "@/types/command";

const { setActiveTab } = useDebuggerNav();
const { jumpToAddress } = useAddressHistory("disassembly");

export const setDisasmView: Command = {
	description: "Set disasm <address>, or disasm a <range> to console",
	paramDef: ["range|address", "name?"],
	group: "Viewers",
	fn: async ({ vm, params }: CommandContext) => {
		const val = params[0];

		if (typeof val === "number") {
			setActiveTab("disassembly");
			jumpToAddress(val);
			return `DisasmViewer address set to ${formatAddress(val)}`;
		}

		if (isParamListItemRange(val)) {
			const { start, end } = val;
			const readByte = (address: number, debug = true) => (debug ? vm.readDebug(address) : vm.read(address)) ?? 0;

			const wantLowercase = params[1] as ParamListItemIdentifier;

			const lines = disassembleRange({
				readByte,
				scope: vm.getScope(start),
				fromAddress: start,
				toAddress: end,
				//registers,
				lowercase: "lowercase".startsWith(wantLowercase?.text.toLowerCase()),
			});
			const source = formatDisassemblyAsText(lines);
			return source;
		}

		throw new Error("Invalid parameter type for disassembly command.");
	},
};
