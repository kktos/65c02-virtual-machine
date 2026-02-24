import type { Command, ParamList } from "@/composables/useCommands";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const setDisasmView: Command = {
	description: "set DisasmViewer address",
	paramDef: ["word"],
	fn: (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const val = params[0] as number;

		const { jumpToAddress, setActiveTab } = useDebuggerNav();

		setActiveTab("disassembly");
		jumpToAddress(val);

		return `DisasmViewer address set to $${toHex(val, 4)}`;
	},
};
