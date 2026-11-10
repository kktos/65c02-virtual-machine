<template>
	<div v-if="file" class="flex flex-col h-full min-h-0 text-xs text-gray-300">
		<div class="px-3 py-2 border-b border-gray-800 space-y-1.5">
			<div class="flex items-baseline gap-2">
				<span class="font-mono text-sm text-gray-100 whitespace-pre">{{ file.name }}</span>
				<span class="text-gray-400">{{ file.typeLabel }}</span>
				<span v-if="file.locked" class="text-amber-400">locked</span>
				<span v-if="file.deleted" class="text-red-400">deleted</span>
			</div>
			<div class="flex flex-wrap gap-x-4 gap-y-0.5 text-gray-400">
				<span v-for="[label, value] in file.fields" :key="label" class="whitespace-nowrap">
					{{ label }} <span class="text-gray-200 font-mono">{{ value }}</span>
				</span>
			</div>
			<p v-if="file.error" class="text-red-400">{{ file.error }}</p>

			<!-- Its sectors / blocks: click one to see it in the disk -->
			<div v-for="group in file.groups" :key="group.label" class="flex flex-wrap items-baseline gap-1">
				<span class="text-gray-500 mr-1">{{ group.label }}</span>
				<button
					v-for="(item, i) in group.items.slice(0, MAX_CHIPS)"
					:key="i"
					class="chip"
					:class="[group.cls, item.view ? '' : 'opacity-40 cursor-default']"
					:disabled="!item.view"
					@click="item.view && (view = item.view)"
				>
					{{ item.label }}
				</button>
				<span v-if="group.items.length > MAX_CHIPS" class="text-gray-500">
					+{{ group.items.length - MAX_CHIPS }} more
				</span>
			</div>
		</div>

		<div class="flex items-center gap-3 px-3 py-1 border-b border-gray-800 text-gray-400">
			<span>{{ shown.bytes.length.toLocaleString() }} bytes</span>
			<label v-if="file.loaded" class="flex items-center gap-1.5 cursor-pointer select-none">
				<input
					type="checkbox"
					v-model="asLoaded"
					class="rounded bg-gray-800 border-gray-600 text-cyan-500 focus:ring-cyan-500"
				/>
				As loaded at ${{ toHex(file.loaded.address, 4) }}
			</label>
		</div>
		<div class="flex-1 min-h-0 overflow-auto py-1">
			<DiskHexDump :bytes="shown.bytes" :base="shown.base" :label-width="shown.base ? 4 : 0" />
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { type DiskEditorView, useDiskEditor } from "@/composables/useDiskEditor";
import type { TrackSector } from "@/lib/disk/diskImage";
import { DOS33_TYPE_NAMES, readFile as readDosFile } from "@/lib/disk/dos33";
import { fileTypeName, readFile as readProdosFile, STORAGE_TYPES } from "@/lib/disk/prodos";
import { toHex } from "@/lib/hex.utils";
import DiskHexDump from "./DiskHexDump.vue";

type Group = { label: string; cls: string; items: { label: string; view: DiskEditorView | null }[] };

const MAX_CHIPS = 512;

const { analysis, view } = useDiskEditor();
const asLoaded = ref(true);

const ts = (t: TrackSector | null) =>
	t
		? { label: `T${toHex(t.track)} S${toHex(t.sector, 1)}`, view: { kind: "sector" as const, ...t } }
		: { label: "hole", view: null };
const blk = (b: number) =>
	b ? { label: String(b), view: { kind: "block" as const, block: b } } : { label: "sparse", view: null };

const file = computed(() => {
	const v = view.value;
	const disk = analysis.value;
	if (!disk) return null;

	if (v.kind === "dosFile" && disk.dos33) {
		const f = disk.dos33.files[v.index];
		if (!f) return null;
		const c = readDosFile(disk.image, f);
		const fields: [string, string][] = [
			["Catalog", `T${toHex(f.entry.track)} S${toHex(f.entry.sector, 1)} #${f.entry.index}`],
			["Sectors", String(f.sectorCount)],
		];
		if (c.address !== undefined) fields.push(["Address", `$${toHex(c.address, 4)}`]);
		if (c.length !== undefined) fields.push(["Length", `$${toHex(c.length, 4)} (${c.length})`]);
		const isBinary = f.type.toUpperCase() === "B" && c.address !== undefined && c.length !== undefined;
		return {
			name: f.name,
			typeLabel: `${f.type} · ${DOS33_TYPE_NAMES[f.type] ?? `$${toHex(f.typeByte)}`}`,
			locked: f.locked,
			deleted: f.deleted,
			fields,
			error: c.error,
			data: c.data,
			// B: 4 bytes of address and length, then the bytes loaded there
			loaded: isBinary ? { address: c.address!, bytes: c.data.subarray(4, 4 + c.length!) } : null,
			groups: [
				{ label: "T/S list", cls: "chip-index", items: c.tsListSectors.map(ts) },
				{ label: "Data", cls: "chip-data", items: c.dataSectors.map(ts) },
			] as Group[],
		};
	}

	if (v.kind === "prodosFile") {
		const e = v.entry;
		const c = readProdosFile(disk.image, e);
		const fields: [string, string][] = [
			["Aux", `$${toHex(e.auxType, 4)}`],
			["EOF", `$${toHex(e.eof, 4)} (${e.eof})`],
			["Blocks", String(e.blocksUsed)],
			["Key", String(e.keyPointer)],
			["Access", `$${toHex(e.access)}`],
			["Created", e.created ?? "-"],
			["Modified", e.modified ?? "-"],
		];
		const groups: Group[] = [
			{ label: "Index", cls: "chip-index", items: c.indexBlocks.map(blk) },
			{ label: "Data", cls: "chip-data", items: c.dataBlocks.map(blk) },
		];
		if (c.resourceBlocks)
			groups.push({ label: "Resource fork", cls: "chip-index", items: c.resourceBlocks.map(blk) });
		// BIN and SYS: the aux type is the load address
		const loadAddress = e.fileType === 0x06 ? e.auxType : e.fileType === 0xff ? 0x2000 : null;
		return {
			name: v.path,
			typeLabel: `${fileTypeName(e.fileType)} · ${STORAGE_TYPES[e.storageType] ?? e.storageType}`,
			locked: (e.access & 0xc2) !== 0xc2,
			deleted: false,
			fields,
			error: c.error,
			data: c.data,
			loaded: loadAddress !== null ? { address: loadAddress, bytes: c.data } : null,
			groups: groups.filter((g) => g.items.length),
		};
	}
	return null;
});

const shown = computed(() => {
	const f = file.value;
	if (f?.loaded && asLoaded.value) return { bytes: f.loaded.bytes, base: f.loaded.address };
	return { bytes: f?.data ?? new Uint8Array(), base: 0 };
});
</script>

<style scoped>
@reference "@/style.css";

.chip {
	@apply px-1 rounded font-mono text-[10px] leading-4 transition-colors;
}
.chip-index {
	@apply bg-amber-900/40 text-amber-300 hover:bg-amber-800/60;
}
.chip-data {
	@apply bg-cyan-900/40 text-cyan-300 hover:bg-cyan-800/60;
}
</style>
