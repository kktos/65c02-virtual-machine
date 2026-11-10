<template>
	<div class="p-3 space-y-4 text-xs text-gray-300 overflow-auto h-full">
		<!-- DOS 3.3: the VTOC and its free sector map -->
		<template v-if="vtoc">
			<section>
				<h3 class="title">
					VTOC
					<button class="link font-mono" @click="view = { kind: 'sector', track: 0x11, sector: 0 }">
						T11 S0
					</button>
				</h3>
				<dl class="fields">
					<dt>Catalog</dt>
					<dd>
						<button class="link font-mono" @click="view = { kind: 'sector', ...vtoc.catalog }">
							T{{ toHex(vtoc.catalog.track) }} S{{ toHex(vtoc.catalog.sector, 1) }}
						</button>
					</dd>
					<dt>DOS release</dt>
					<dd>{{ vtoc.dosVersion }}</dd>
					<dt>Volume</dt>
					<dd>{{ vtoc.volume }} (${{ toHex(vtoc.volume) }})</dd>
					<dt>T/S pairs a list</dt>
					<dd>{{ vtoc.maxTsPairs }}</dd>
					<dt>Last track allocated</dt>
					<dd>${{ toHex(vtoc.lastTrackAllocated) }} ({{ vtoc.direction > 0 ? "+1" : vtoc.direction }})</dd>
					<dt>Geometry</dt>
					<dd>
						{{ vtoc.tracks }} tracks x {{ vtoc.sectorsPerTrack }} sectors x {{ vtoc.bytesPerSector }} bytes
					</dd>
					<dt>Free</dt>
					<dd>{{ vtoc.freeSectors }} sectors ({{ ((vtoc.freeSectors * 256) / 1024).toFixed(1) }} KB)</dd>
				</dl>
			</section>
			<section>
				<h3 class="title">Sector map <span class="legend">tracks across, sectors down; click to open</span></h3>
				<div class="inline-grid gap-px" :style="{ gridTemplateColumns: `1.5rem repeat(${TRACKS}, 0.75rem)` }">
					<span></span>
					<span v-for="t in TRACKS" :key="t" class="axis">{{ (t - 1) % 5 === 0 ? toHex(t - 1) : "" }}</span>
					<template v-for="s in SECTORS_PER_TRACK" :key="s">
						<span class="axis text-right pr-1">{{ toHex(s - 1, 1) }}</span>
						<button
							v-for="t in TRACKS"
							:key="t"
							class="cell"
							:class="sectorCellClass(t - 1, s - 1)"
							:title="sectorTitle(t - 1, s - 1)"
							@click="view = { kind: 'sector', track: t - 1, sector: s - 1 }"
						></button>
					</template>
				</div>
				<MapLegend />
			</section>
		</template>

		<!-- ProDOS: the volume header and its bitmap -->
		<template v-else-if="volume">
			<section>
				<h3 class="title">
					Volume /{{ volume.name }}
					<button class="link font-mono" @click="view = { kind: 'block', block: volume.keyBlock }">
						block {{ volume.keyBlock }}
					</button>
				</h3>
				<dl class="fields">
					<dt>Created</dt>
					<dd>{{ volume.created ?? "-" }}</dd>
					<dt>Files</dt>
					<dd>{{ volume.fileCount }} in the volume directory</dd>
					<dt>Blocks</dt>
					<dd>{{ volume.totalBlocks }} ({{ ((volume.totalBlocks ?? 0) / 2).toFixed(0) }} KB)</dd>
					<dt>Bitmap</dt>
					<dd>
						<button
							v-for="b in bitmap?.blocks ?? []"
							:key="b"
							class="link mr-2"
							@click="view = { kind: 'block', block: b }"
						>
							block {{ b }}
						</button>
					</dd>
					<dt>Free</dt>
					<dd v-if="bitmap">{{ bitmap.freeBlocks }} blocks ({{ (bitmap.freeBlocks / 2).toFixed(1) }} KB)</dd>
					<dd v-else>no bitmap</dd>
				</dl>
			</section>
			<section v-if="bitmap">
				<h3 class="title">Block map <span class="legend">click to open</span></h3>
				<div
					v-if="bitmap.free.length <= MAX_MAP"
					class="grid gap-px"
					:style="{ gridTemplateColumns: `repeat(${columns}, 0.75rem)` }"
				>
					<button
						v-for="(free, block) in bitmap.free"
						:key="block"
						class="cell"
						:class="blockCellClass(block, free)"
						:title="blockTitle(block, free)"
						@click="view = { kind: 'block', block }"
					></button>
				</div>
				<p v-else class="text-gray-500">{{ bitmap.free.length }} blocks: too many to draw.</p>
				<MapLegend />
			</section>
		</template>
	</div>
</template>

<script lang="ts" setup>
import { computed, defineComponent, h } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import { SECTORS_PER_TRACK, TRACKS } from "@/lib/disk/diskImage";
import { readBitmap } from "@/lib/disk/prodos";
import { toHex } from "@/lib/hex.utils";

const MAX_MAP = 4096;

const { analysis, view, ownerOfSector, ownerOfBlock } = useDiskEditor();

const vtoc = computed(() => analysis.value?.dos33?.vtoc);
const volume = computed(() => analysis.value?.prodos);
const bitmap = computed(() => (analysis.value && volume.value ? readBitmap(analysis.value.image, volume.value) : null));
/** A 5.25" floppy: a row a track (8 blocks) is too narrow, 2 tracks a row */
const columns = computed(() => ((bitmap.value?.free.length ?? 0) <= 280 ? 16 : 32));

/** Free / used, and used but not by a file found (or free but in use: a damaged disk) */
const cellClass = (free: boolean, owner: string | undefined) => {
	if (free) return owner ? "bg-red-500" : "bg-gray-700";
	return owner ? "bg-cyan-600" : "bg-amber-600";
};

const sectorCellClass = (track: number, sector: number) =>
	cellClass(vtoc.value?.free[track]?.[sector] ?? false, ownerOfSector(track, sector));
const sectorTitle = (track: number, sector: number) =>
	`T${toHex(track)} S${toHex(sector, 1)}: ${ownerOfSector(track, sector) ?? (vtoc.value?.free[track]?.[sector] ? "free" : "used, no file")}`;

const blockCellClass = (block: number, free: boolean) => cellClass(free, ownerOfBlock(block));
const blockTitle = (block: number, free: boolean) =>
	`Block ${block} ($${toHex(block, 4)}): ${ownerOfBlock(block) ?? (free ? "free" : "used, no file")}`;

const MapLegend = defineComponent(() => () => {
	const item = (cls: string, text: string) =>
		h("span", { class: "flex items-center gap-1" }, [
			h("span", { class: `inline-block w-2.5 h-2.5 ${cls}` }),
			text,
		]);
	return h("div", { class: "flex flex-wrap gap-3 mt-2 text-[10px] text-gray-400" }, [
		item("bg-cyan-600", "a file / system"),
		item("bg-gray-700", "free"),
		item("bg-amber-600", "used, no file (boot, custom data...)"),
		item("bg-red-500", "free, yet a file uses it"),
	]);
});
</script>

<style scoped>
@reference "@/style.css";

.title {
	@apply flex items-baseline gap-2 text-[11px] uppercase font-bold tracking-wider text-gray-400 mb-2;
}
.legend {
	@apply normal-case font-normal tracking-normal text-gray-500;
}
.fields {
	@apply grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1;
}
.fields dt {
	@apply text-gray-500;
}
.cell {
	@apply h-3 w-3 rounded-[1px] hover:ring-1 hover:ring-white;
}
.axis {
	@apply text-[9px] leading-3 text-gray-500 font-mono;
}
.link {
	@apply text-cyan-400 hover:text-cyan-300 hover:underline normal-case font-normal tracking-normal;
}
</style>
