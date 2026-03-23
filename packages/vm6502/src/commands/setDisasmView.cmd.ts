import { useAddressHistory } from "@/composables/useAddressHistory";
import { defineCommand, isParamListItemRange } from "@/composables/useCommands";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { disassembleRange, formatDisassemblyAsText } from "@/lib/disassembler";
import { formatAddress } from "@/lib/hex.utils";

const { setActiveTab } = useDebuggerNav();
const { jumpToAddress } = useAddressHistory("disassembly");

export const setDisasmView = defineCommand({
	description: "Set DisasmViewer to show<\u200baddress> or disasm a <\u200brange> to console",
	paramDef: ["range|address", "name?"],
	options: [{ name: "lowercase" }, { name: "test", value: { kind: "number", default: 0 } }] as const,
	group: "Viewers",
	fn: async ({ vm, params, opts }) => {
		const val = params[0];

		if (typeof val === "number") {
			setActiveTab("disassembly");
			jumpToAddress(val);
			return `DisasmViewer address set to ${formatAddress(val)}`;
		}

		if (!isParamListItemRange(val)) throw new Error("Invalid parameter type for disassembly command.");

		const { start, end } = val;
		const readByte = (address: number, debug = true) => (debug ? vm.readDebug(address) : vm.read(address)) ?? 0;

		const lines = disassembleRange({
			readByte,
			scope: vm.getScope(start),
			fromAddress: start,
			toAddress: end,
			lowercase: opts.lowercase,
		});
		const source = formatDisassemblyAsText(lines);
		return source;
	},
});
