<template>
	<div class="p-3 space-y-4 text-xs text-gray-300 overflow-auto h-full">
		<section>
			<h3 class="title">
				{{ volume.title }}
				<button v-if="volume.titleLink?.view" class="link font-mono" @click="view = volume.titleLink.view">
					{{ volume.titleLink.label }}
				</button>
			</h3>
			<dl class="fields">
				<template v-for="field in volume.fields" :key="field.label">
					<dt>{{ field.label }}</dt>
					<dd>
						{{ field.value }}
						<button
							v-for="(link, i) in field.links ?? []"
							:key="i"
							class="link font-mono mr-2"
							:disabled="!link.view"
							@click="link.view && (view = link.view)"
						>
							{{ link.label }}
						</button>
					</dd>
				</template>
			</dl>
		</section>

		<!-- Tracks across, sectors down (as many as the track has) -->
		<section v-if="map?.kind === 'tracks' && tracks">
			<h3 class="title">Sector map <span class="legend">tracks across, sectors down; click to open</span></h3>
			<div class="inline-grid gap-px" :style="{ gridTemplateColumns: `1.5rem repeat(${tracks.count}, 0.75rem)` }">
				<span></span>
				<span v-for="t in trackNumbers" :key="t" class="axis">{{ trackAxis(t) }}</span>
				<template v-for="s in maxSectors" :key="s">
					<span class="axis text-right pr-1">{{ num(s - 1, 1) }}</span>
					<template v-for="t in trackNumbers" :key="t">
						<button
							v-if="s - 1 < tracks.sectors(t)"
							class="cell"
							:class="sectorCellClass(t, s - 1)"
							:title="sectorTitle(t, s - 1)"
							@click="view = { kind: 'sector', track: t, sector: s - 1 }"
						></button>
						<span v-else></span>
					</template>
				</template>
			</div>
			<MapLegend />
		</section>

		<section v-else-if="map?.kind === 'blocks'">
			<h3 class="title">Block map <span class="legend">click to open</span></h3>
			<div
				v-if="map.count <= MAX_MAP"
				class="grid gap-px"
				:style="{ gridTemplateColumns: `repeat(${map.columns}, 0.75rem)` }"
			>
				<button
					v-for="block in map.count"
					:key="block"
					class="cell"
					:class="blockCellClass(block - 1)"
					:title="blockTitle(block - 1)"
					@click="view = { kind: 'block', block: block - 1 }"
				></button>
			</div>
			<p v-else class="text-gray-500">{{ map.count }} blocks: too many to draw.</p>
			<MapLegend />
		</section>
	</div>
</template>

<script lang="ts" setup>
import { computed, defineComponent, h } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import type { OpenedDisk } from "@/lib/disk/diskFormat.type";
import { tsLabel } from "@/lib/disk/diskLayout.utils";
import { toHex } from "@/lib/hex.utils";

const MAX_MAP = 4096;

const props = defineProps<{ disk: OpenedDisk }>();
const { view } = useDiskEditor();

const volume = computed(() => props.disk.volume?.read() ?? { title: "No volume", fields: [], map: null });
const map = computed(() => volume.value.map);
const tracks = computed(() => props.disk.layout.tracks);
const trackNumbers = computed(() =>
	Array.from({ length: tracks.value?.count ?? 0 }, (_, i) => (tracks.value?.first ?? 0) + i),
);
const maxSectors = computed(() => Math.max(0, ...trackNumbers.value.map((t) => tracks.value?.sectors(t) ?? 0)));

const num = (n: number, pad: number) => (tracks.value?.hex ? toHex(n, pad) : String(n));
/** A label every 5 tracks, and on the first one */
const trackAxis = (t: number) => (t % 5 === 0 || t === tracks.value?.first ? num(t, 2) : "");

/** Free / used, and used but not by a file found (or free but in use: a damaged disk) */
const cellClass = (free: boolean, owner: string | undefined) => {
	if (free) return owner ? "bg-red-500" : "bg-gray-700";
	return owner ? "bg-cyan-600" : "bg-amber-600";
};

const sectorFree = (track: number, sector: number) =>
	map.value?.kind === "tracks" ? map.value.free(track, sector) : false;
const sectorCellClass = (track: number, sector: number) =>
	cellClass(sectorFree(track, sector), props.disk.ownerOfSector(track, sector));
const sectorTitle = (track: number, sector: number) =>
	`${tsLabel(props.disk.layout, track, sector)}: ${props.disk.ownerOfSector(track, sector) ?? (sectorFree(track, sector) ? "free" : "used, no file")}`;

const blockFree = (block: number) => (map.value?.kind === "blocks" ? map.value.free(block) : false);
const blockCellClass = (block: number) => cellClass(blockFree(block), props.disk.ownerOfBlock(block));
const blockTitle = (block: number) =>
	`Block ${block} ($${toHex(block, 4)}): ${props.disk.ownerOfBlock(block) ?? (blockFree(block) ? "free" : "used, no file")}`;

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
