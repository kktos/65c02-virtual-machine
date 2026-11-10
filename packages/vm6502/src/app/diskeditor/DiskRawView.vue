<template>
	<div class="flex flex-col min-h-0 h-full outline-none" tabindex="0" @keydown="onKeydown">
		<!-- Navigation: track / sector or block -->
		<div class="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-gray-800 text-xs">
			<div class="flex rounded border border-gray-700 overflow-hidden">
				<button
					v-if="image.hasTracks"
					class="seg"
					:class="{ 'seg-on': view.kind === 'sector' }"
					@click="toSectors"
					title="DOS 3.3 sectors: 35 tracks x 16 sectors x 256 bytes"
				>
					T/S
				</button>
				<button
					class="seg"
					:class="{ 'seg-on': view.kind === 'block' }"
					@click="toBlocks"
					title="ProDOS blocks: 512 bytes"
				>
					Block
				</button>
			</div>

			<template v-if="view.kind === 'sector'">
				<button class="nav-btn" @click="step(-SECTORS_PER_TRACK)" title="Previous track">
					<ChevronsLeft class="h-3.5 w-3.5" />
				</button>
				<button class="nav-btn" @click="step(-1)" title="Previous sector (Page Up)">
					<ChevronLeft class="h-3.5 w-3.5" />
				</button>
				<label class="flex items-center gap-1 text-gray-400"
					>T
					<input
						class="num-input"
						:value="toHex(view.track)"
						@change="setTs(($event.target as HTMLInputElement).value, null)"
					/>
				</label>
				<label class="flex items-center gap-1 text-gray-400"
					>S
					<input
						class="num-input"
						:value="toHex(view.sector, 1)"
						@change="setTs(null, ($event.target as HTMLInputElement).value)"
					/>
				</label>
				<button class="nav-btn" @click="step(1)" title="Next sector (Page Down)">
					<ChevronRight class="h-3.5 w-3.5" />
				</button>
				<button class="nav-btn" @click="step(SECTORS_PER_TRACK)" title="Next track">
					<ChevronsRight class="h-3.5 w-3.5" />
				</button>
			</template>
			<template v-else-if="view.kind === 'block'">
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
				<span class="text-gray-500">/ {{ image.blockCount - 1 }}</span>
				<button class="nav-btn" @click="step(1)" title="Next block (Page Down)">
					<ChevronRight class="h-3.5 w-3.5" />
				</button>
			</template>
			<DiskViewerSwitch class="ml-auto" />
		</div>

		<!-- Where it is, what it belongs to -->
		<div class="px-2 py-1 text-[11px] text-gray-400 border-b border-gray-800 flex flex-wrap gap-x-4">
			<span>Image offset <span class="text-gray-200 font-mono">${{ toHex(offset, 5) }}</span></span>
			<span v-if="view.kind === 'sector'">
				Block
				<button class="link" @click="view = { kind: 'block', block: sectorBlock.block }">
					{{ sectorBlock.block }}</button
				>, {{ sectorBlock.half ? "second" : "first" }} half
			</span>
			<span v-else-if="view.kind === 'block' && image.hasTracks">
				Sectors
				<template v-for="(ts, i) in blockSectors" :key="i">
					<button class="link font-mono" @click="view = { kind: 'sector', ...ts }">
						T{{ toHex(ts.track) }} S{{ toHex(ts.sector, 1) }}</button
					><span v-if="i === 0">, </span>
				</template>
			</span>
			<span v-if="hasFileSystem">
				Holds <span class="text-cyan-300">{{ owner ?? "nothing (free / unused)" }}</span>
			</span>
		</div>

		<div class="flex-1 min-h-0 overflow-auto py-1">
			<template v-if="viewer === 'hgr'">
				<p class="px-3 text-[11px] text-gray-500">
					8K from here: {{ view.kind === "sector" ? "32 sectors (2 tracks)" : "16 blocks" }}, Page Up / Down
					to move it
				</p>
				<DiskHgrView :bytes="pictureBytes" />
			</template>
			<DiskHexDump v-else :bytes="bytes" :label-width="view.kind === 'sector' ? 2 : 3" />
		</div>
	</div>
</template>

<script lang="ts" setup>
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-vue-next";
import { computed } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import { BLOCK_SIZE, type DiskImage, SECTOR_SIZE, SECTORS_PER_TRACK, TRACKS } from "@/lib/disk/diskImage";
import { HGR_SIZE } from "@/lib/disk/hgrImage";
import { toHex } from "@/lib/hex.utils";
import DiskHexDump from "./DiskHexDump.vue";
import DiskHgrView from "./DiskHgrView.vue";
import DiskViewerSwitch from "./DiskViewerSwitch.vue";

const props = defineProps<{ image: DiskImage; hasFileSystem: boolean }>();
const { view, viewer, ownerOfSector, ownerOfBlock } = useDiskEditor();

const sectorCount = TRACKS * SECTORS_PER_TRACK;

const bytes = computed(() => {
	const v = view.value;
	if (v.kind === "sector") return props.image.readSector(v.track, v.sector);
	if (v.kind === "block") return props.image.readBlock(v.block);
	return new Uint8Array();
});

/** The HGR viewer: 8K from the sector / block shown, in track / sector or block order (up to the disk's end) */
const pictureBytes = computed(() => {
	const v = view.value;
	const out = new Uint8Array(HGR_SIZE);
	if (v.kind === "sector") {
		const first = v.track * SECTORS_PER_TRACK + v.sector;
		const count = Math.min(HGR_SIZE / SECTOR_SIZE, sectorCount - first);
		for (let i = 0; i < count; i++) {
			const index = first + i;
			const sector = props.image.readSector(Math.floor(index / SECTORS_PER_TRACK), index % SECTORS_PER_TRACK);
			out.set(sector, i * SECTOR_SIZE);
		}
		return out.subarray(0, count * SECTOR_SIZE);
	}
	if (v.kind === "block") {
		const count = Math.min(HGR_SIZE / BLOCK_SIZE, props.image.blockCount - v.block);
		for (let i = 0; i < count; i++) out.set(props.image.readBlock(v.block + i), i * BLOCK_SIZE);
		return out.subarray(0, count * BLOCK_SIZE);
	}
	return out.subarray(0, 0);
});

const offset = computed(() => {
	const v = view.value;
	if (v.kind === "sector") return props.image.sectorOffset(v.track, v.sector);
	if (v.kind === "block") {
		if (props.image.order === "prodos" || !props.image.hasTracks) return v.block * BLOCK_SIZE;
		const [first] = props.image.blockSectors(v.block);
		return props.image.sectorOffset(first.track, first.sector);
	}
	return 0;
});

const sectorBlock = computed(() => {
	const v = view.value;
	return v.kind === "sector" ? props.image.sectorBlock(v.track, v.sector) : { block: 0, half: 0 };
});
const blockSectors = computed(() => {
	const v = view.value;
	return v.kind === "block" ? props.image.blockSectors(v.block) : [];
});

const owner = computed(() => {
	const v = view.value;
	if (v.kind === "sector") return ownerOfSector(v.track, v.sector);
	if (v.kind === "block") return ownerOfBlock(v.block);
	return undefined;
});

const wrap = (n: number, count: number) => ((n % count) + count) % count;

const step = (delta: number) => {
	const v = view.value;
	if (v.kind === "sector") {
		const index = wrap(v.track * SECTORS_PER_TRACK + v.sector + delta, sectorCount);
		view.value = {
			kind: "sector",
			track: Math.floor(index / SECTORS_PER_TRACK),
			sector: index % SECTORS_PER_TRACK,
		};
	} else if (v.kind === "block") view.value = { kind: "block", block: wrap(v.block + delta, props.image.blockCount) };
};

const parseNum = (text: string, hexByDefault: boolean) => {
	const t = text.trim();
	if (t.startsWith("$")) return parseInt(t.slice(1), 16);
	return hexByDefault ? parseInt(t, 16) : parseInt(t, 10);
};

const setTs = (track: string | null, sector: string | null) => {
	const v = view.value;
	if (v.kind !== "sector") return;
	const t = track === null ? v.track : parseNum(track, true);
	const s = sector === null ? v.sector : parseNum(sector, true);
	if (Number.isNaN(t) || Number.isNaN(s)) return;
	view.value = {
		kind: "sector",
		track: Math.min(Math.max(t, 0), TRACKS - 1),
		sector: Math.min(Math.max(s, 0), SECTORS_PER_TRACK - 1),
	};
};

const setBlock = (text: string) => {
	const block = parseNum(text, false);
	if (Number.isNaN(block)) return;
	view.value = { kind: "block", block: Math.min(Math.max(block, 0), props.image.blockCount - 1) };
};

const toSectors = () => {
	const v = view.value;
	view.value = v.kind === "block" ? { kind: "sector", ...props.image.blockSectors(v.block)[0] } : v;
};

const toBlocks = () => {
	const v = view.value;
	view.value = v.kind === "sector" ? { kind: "block", block: sectorBlock.value.block } : v;
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
