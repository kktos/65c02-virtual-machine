import { useAddressHistory } from "@/composables/useAddressHistory";
import { defineCommand } from "@/composables/useCommands";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { formatAddress } from "@/lib/hex.utils";

const { setActiveTab } = useDebuggerNav();
const { jumpToAddress } = useAddressHistory("disassembly");

export const disasmViewCmd = defineCommand({
	description: "Set DisasmViewer to start at <\u200baddress>",
	paramDef: ["range|address"],
	group: "Viewers",
	fn: async ({ params }) => {
		const val = params[0] as number;
		setActiveTab("disassembly");
		jumpToAddress(val);
		return `DisasmViewer address set to ${formatAddress(val)}`;
	},
});
