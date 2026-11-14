<template>
	<div class="flex flex-col min-h-0 h-full outline-none" tabindex="0" @keydown="onKeydown">
		<!-- Navigation: track / sector or block -->
		<div class="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-gray-800 text-xs">
			<div v-if="tracks && blocks" class="flex rounded border border-gray-700 overflow-hidden">
				<button
					class="seg"
					:class="{ 'seg-on': view.kind === 'sector' }"
					@click="toSectors"
					:title="tracks.title"
				>
					T/S
				</button>
				<button
					class="seg"
					:class="{ 'seg-on': view.kind === 'block' }"
					@click="toBlocks"
					:title="blocks.title"
				>
					Block
				</button>
			</div>

			<template v-if="view.kind === 'sector' && tracks">
				<button class="nav-btn" @click="stepTrack(-1)" title="Previous track">
					<ChevronsLeft class="h-3.5 w-3.5" />
				</button>
				<button class="nav-btn" @click="step(-1)" title="Previous sector (Page Up)">
					<ChevronLeft class="h-3.5 w-3.5" />
				</button>
				<label class="flex items-center gap-1 text-gray-400"
					>T
					<input
						class="num-input"
						:value="num(view.track, 2)"
						:title="numTitle"
						@change="setTs(($event.target as HTMLInputElement).value, null)"
					/>
				</label>
				<label class="flex items-center gap-1 text-gray-400"
					>S
					<input
						class="num-input"
						:value="num(view.sector, 1)"
						:title="numTitle"
						@change="setTs(null, ($event.target as HTMLInputElement).value)"
					/>
				</label>
				<button class="nav-btn" @click="step(1)" title="Next sector (Page Down)">
					<ChevronRight class="h-3.5 w-3.5" />
				</button>
				<button class="nav-btn" @click="stepTrack(1)" title="Next track">
					<ChevronsRight class="h-3.5 w-3.5" />
				</button>
			</template>
			<template v-else-if="view.kind === 'block' && blocks">
				<button class="nav-btn" @click="step(-1)" title="Previous block (Page Up)">
					<ChevronLeft class="h-3.5 w-3.5" />
				</button>
				<label class="flex items-center gap-1 text-gray-400"
					>Block
					<input
						class="num-input w-14!"
						:value="String(view.block)"
						@change="setBlock(($event.target as HTMLInputElement).value)"
						title="Decimal, or hex with $"
					/>
				</label>
				<span class="text-gray-500">/ {{ blocks.count - 1 }}</span>
				<button class="nav-btn" @click="step(1)" title="Next block (Page Down)">
					<ChevronRight class="h-3.5 w-3.5" />
				</button>
			</template>
			<DiskViewerSwitch class="ml-auto" />
		</div>

		<!-- Where it is, what it belongs to -->
		<div class="px-2 py-1 text-[11px] text-gray-400 border-b border-gray-800 flex flex-wrap gap-x-4">
			<span>Image offset <span class="text-gray-200 font-mono">${{ toHex(offset, 5) }}</span></span>
			<span v-if="sectorBlock">
				Block
				<button class="link" @click="view = { kind: 'block', block: sectorBlock.block }">
					{{ sectorBlock.block }}</button
				>, {{ sectorBlock.half ? "second" : "first" }} half
			</span>
			<span v-else-if="blockSectors.length">
				Sectors
				<template v-for="(ts, i) in blockSectors" :key="i">
					<button class="link font-mono" @click="view = { kind: 'sector', ...ts }">
						{{ tsLabel(disk.layout, ts.track, ts.sector) }}</button
					><span v-if="i < blockSectors.length - 1">, </span>
				</template>
			</span>
			<span v-if="disk.root">
				Holds <span class="text-cyan-300">{{ owner ?? "nothing (free / unused)" }}</span>
			</span>
		</div>

		<div class="flex-1 min-h-0 overflow-auto py-1">
			<p v-if="current.span" class="px-3 text-[11px] text-gray-500">
				{{ spanLabel }} from here: {{ units }} {{ view.kind === "sector" ? "sectors" : "blocks" }}, Page Up /
				Down to move it
			</p>
			<component
				:is="current.component"
				:bytes="shownBytes"
				:base="boot?.base ?? 0"
				:skip="boot?.skip ?? 0"
				raw
			/>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-vue-next";
import { computed } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import type { OpenedDisk } from "@/lib/disk/diskFormat.type";
import { sectorIndex, tsLabel } from "@/lib/disk/diskLayout.utils";
import { toHex } from "@/lib/hex.utils";
import DiskViewerSwitch from "./DiskViewerSwitch.vue";
import { useCurrentViewer } from "./viewers";

const props = defineProps<{ disk: OpenedDisk }>();
const { view, ownerOfSector, ownerOfBlock } = useDiskEditor();
const current = useCurrentViewer();

const tracks = computed(() => props.disk.layout.tracks);
const blocks = computed(() => props.disk.layout.blocks);
const sectors = computed(() => sectorIndex(props.disk.layout));

const num = (n: number, pad: number) => (tracks.value?.hex ? toHex(n, pad) : String(n));
const numTitle = computed(() => (tracks.value?.hex ? "Hex" : "Decimal, or hex with $"));

const SECTOR_SIZE = 256;

const readSector = (index: number) => {
	const { track, sector } = sectors.value.fromIndex(index);
	return props.disk.layout.readSector(track, sector);
};

/**
 * What the viewer is given: the sector / block shown, or `span` bytes from it for a viewer that wants more
 * (a picture: 8K), in track / sector or block order, up to the disk's end
 */
const shown = computed(() => {
	const v = view.value;
	const layout = props.disk.layout;
	const span = current.value.span ?? 0;
	if (v.kind === "sector" && tracks.value) {
		const first = sectors.value.toIndex(v.track, v.sector);
		const count = Math.max(1, Math.min(Math.ceil(span / SECTOR_SIZE), sectors.value.count - first));
		if (!span) return { bytes: layout.readSector(v.track, v.sector), count };
		const out = new Uint8Array(count * SECTOR_SIZE);
		for (let i = 0; i < count; i++) out.set(readSector(first + i), i * SECTOR_SIZE);
		return { bytes: out, count };
	}
	if (v.kind === "block" && blocks.value) {
		const size = blocks.value.size;
		const count = Math.max(1, Math.min(Math.ceil(span / size), blocks.value.count - v.block));
		if (!span) return { bytes: layout.readBlock(v.block), count };
		const out = new Uint8Array(count * size);
		for (let i = 0; i < count; i++) out.set(layout.readBlock(v.block + i), i * size);
		return { bytes: out, count };
	}
	return { bytes: new Uint8Array(), count: 0 };
});
const shownBytes = computed(() => shown.value.bytes);
const units = computed(() => shown.value.count);
const spanLabel = computed(() => {
	const span = current.value.span ?? 0;
	return span % 1024 === 0 ? `${span / 1024}K` : `${span} bytes`;
});

/** A boot sector / block: its code's load address, the data bytes before it */
const boot = computed(() => props.disk.bootCode?.(view.value) ?? null);

const offset = computed(() => {
	const v = view.value;
	if (v.kind === "sector") return props.disk.layout.sectorOffset(v.track, v.sector);
	if (v.kind === "block") return props.disk.layout.blockOffset(v.block);
	return 0;
});

const sectorBlock = computed(() => {
	const v = view.value;
	return v.kind === "sector" ? (props.disk.layout.sectorBlock?.(v.track, v.sector) ?? null) : null;
});
const blockSectors = computed(() => {
	const v = view.value;
	return v.kind === "block" ? (props.disk.layout.blockSectors?.(v.block) ?? []) : [];
});

const owner = computed(() => {
	const v = view.value;
	if (v.kind === "sector") return ownerOfSector(v.track, v.sector);
	if (v.kind === "block") return ownerOfBlock(v.block);
	return undefined;
});

const wrap = (n: number, count: number) => ((n % count) + count) % count;
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

const step = (delta: number) => {
	const v = view.value;
	if (v.kind === "sector" && sectors.value.count) {
		const index = wrap(sectors.value.toIndex(v.track, v.sector) + delta, sectors.value.count);
		view.value = { kind: "sector", ...sectors.value.fromIndex(index) };
	} else if (v.kind === "block" && blocks.value)
		view.value = { kind: "block", block: wrap(v.block + delta, blocks.value.count) };
};

/** The same sector of the next / previous track (its last one if the track has fewer) */
const stepTrack = (delta: number) => {
	const v = view.value;
	const t = tracks.value;
	if (v.kind !== "sector" || !t) return;
	const track = t.first + wrap(v.track - t.first + delta, t.count);
	view.value = { kind: "sector", track, sector: Math.min(v.sector, t.sectors(track) - 1) };
};

const parseNum = (text: string, hexByDefault: boolean) => {
	const s = text.trim();
	if (s.startsWith("$")) return parseInt(s.slice(1), 16);
	return hexByDefault ? parseInt(s, 16) : parseInt(s, 10);
};

const setTs = (track: string | null, sector: string | null) => {
	const v = view.value;
	const t = tracks.value;
	if (v.kind !== "sector" || !t) return;
	const tn = track === null ? v.track : parseNum(track, t.hex);
	const sn = sector === null ? v.sector : parseNum(sector, t.hex);
	if (Number.isNaN(tn) || Number.isNaN(sn)) return;
	const newTrack = clamp(tn, t.first, t.first + t.count - 1);
	view.value = { kind: "sector", track: newTrack, sector: clamp(sn, 0, t.sectors(newTrack) - 1) };
};

const setBlock = (text: string) => {
	const block = parseNum(text, false);
	if (Number.isNaN(block) || !blocks.value) return;
	view.value = { kind: "block", block: clamp(block, 0, blocks.value.count - 1) };
};

const toSectors = () => {
	const v = view.value;
	const first = v.kind === "block" ? props.disk.layout.blockSectors?.(v.block)[0] : undefined;
	if (first) view.value = { kind: "sector", ...first };
};

const toBlocks = () => {
	if (sectorBlock.value) view.value = { kind: "block", block: sectorBlock.value.block };
};

const onKeydown = (e: KeyboardEvent) => {
	if ((e.target as HTMLElement).tagName === "INPUT") return;
	if (e.key === "PageDown") step(1);
	else if (e.key === "PageUp") step(-1);
	else return;
	e.preventDefault();
};
</script>

<style scoped>
@reference "@/style.css";

.seg {
	@apply px-2 py-0.5 text-gray-400 hover:text-cyan-300 hover:bg-gray-800 transition-colors;
}
.seg-on {
	@apply bg-cyan-900/50 text-cyan-200;
}
.nav-btn {
	@apply p-1 rounded text-gray-400 hover:text-cyan-300 hover:bg-gray-800 transition-colors;
}
.num-input {
	@apply w-9 bg-gray-950 border border-gray-700 rounded px-1 py-0 font-mono text-gray-200 focus:border-cyan-500 focus:outline-none;
}
.link {
	@apply text-cyan-400 hover:text-cyan-300 hover:underline;
}
</style>
