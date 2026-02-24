import type { Command, ParamList } from "@/composables/useCommands";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const setMemView: Command = {
	description: "set MemViewer address",
	paramDef: ["word"],
	fn: (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const val = params[0] as number;

		const { setMemoryViewAddress, setActiveTab } = useDebuggerNav();

		setMemoryViewAddress(val);
		setActiveTab("memory");

		return `MemViewer address set to $${toHex(val, 4)}`;
	},
};
