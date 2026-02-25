import type { Command, ParamList } from "@/composables/useCommands";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useMemView } from "@/composables/useMemView";
import { toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const setMemView: Command = {
	description: "set MemViewer address. Params: <address> [viewerId]",
	paramDef: ["long", "byte?"],
	fn: (_vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const address = params[0] as number;
		let viewerIdx = params[1] as number | 0;

		const { viewers, updateViewerAddress, addViewer, activeViewerId } = useMemView();
		const { setActiveTab } = useDebuggerNav();

		if (viewerIdx) {
			if (viewers.value.length < viewerIdx) {
				addViewer(viewers.value.length + 1, address);
				viewerIdx = viewers.value.length;
			}
		} else viewerIdx = viewers.value.findIndex((v) => v.id === activeViewerId.value);

		updateViewerAddress(viewerIdx - 1, address);
		setActiveTab("memory");

		if (viewerIdx) return `MemViewer ${viewerIdx} address set to $${toHex(address, 4)}`;

		return `Active MemViewer address set to $${toHex(address, 4)}`;
	},
};
