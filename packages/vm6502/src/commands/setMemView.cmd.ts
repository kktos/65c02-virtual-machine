import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useMemView } from "@/composables/useMemView";
import { formatAddress, toHex } from "@/lib/hex.utils";
import type { Command, CommandContext } from "@/types/command";

export const setMemView: Command = {
	description: "set MemViewer [index number] <address>",
	paramDef: ["address", "byte?"],
	group: "Viewers",
	fn: ({ params }: CommandContext) => {
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

		return `Active MemViewer address set to ${formatAddress(address)}`;
	},
};

export const setMemViewFn = setMemView.fn;
