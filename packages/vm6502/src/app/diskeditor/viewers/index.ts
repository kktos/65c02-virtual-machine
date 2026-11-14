// The disk editor's viewers: how the bytes of a file / sector / block are shown. A machine's config lists the ones
// that make sense for it (`disk.viewers`: no HGR on a PET); the hex dump is always there.
//
// A viewer is a component taking { bytes, base, skip, raw }: base, where the bytes load (a file's load address,
// the boot code's $0800); skip, data bytes before the code; raw, the bytes are raw sectors / blocks stepped
// through (not a file). `span`: the bytes it wants from the raw sectors / blocks, from the one shown (a picture's
// 8K); without, the sector / block alone.

import { type Component, computed } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import { HGR_SIZE } from "@/lib/disk/hgrImage.utils";
import DiskDisasmView from "./DiskDisasmView.vue";
import DiskHexDump from "./DiskHexDump.vue";
import DiskHgrView from "./DiskHgrView.vue";

export type DiskViewerDef = { id: string; label: string; title: string; component: Component; span?: number };

export const HEX_VIEWER = "hex";

export const DISK_VIEWERS: DiskViewerDef[] = [
	{ id: HEX_VIEWER, label: "Hex", title: "Hex + text dump", component: DiskHexDump },
	{
		id: "hgr",
		label: "HGR",
		title: "As an Apple II HGR picture (hi-res page, 8K)",
		component: DiskHgrView,
		span: HGR_SIZE,
	},
	{ id: "disasm", label: "Disasm", title: "65C02 disassembly, from the load address", component: DiskDisasmView },
];

/** The viewers of a machine, in its config's order: the hex dump first if the config doesn't place it */
export function machineViewers(ids: readonly string[]): DiskViewerDef[] {
	const list = ids.includes(HEX_VIEWER) ? ids : [HEX_VIEWER, ...ids];
	return list.flatMap((id) => DISK_VIEWERS.find((v) => v.id === id) ?? []);
}

/** The machine's viewers, and the one picked (the hex dump if the one picked isn't the machine's) */
export function useMachineViewers() {
	const { viewers, viewer } = useDiskEditor();
	const list = computed(() => machineViewers(viewers.value));
	const current = computed(() => list.value.find((v) => v.id === viewer.value) ?? (list.value[0] as DiskViewerDef));
	return { list, current, viewer };
}

export const useCurrentViewer = () => useMachineViewers().current;
