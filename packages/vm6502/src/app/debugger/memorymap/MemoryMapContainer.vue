<template>
	<div ref="root" class="flex h-full gap-4 min-h-0">
		<!-- Map column: ruler + vertical bar + labels -->
		<div class="flex flex-col min-h-0 shrink-0" :class="isCompact ? 'flex-1' : 'w-3/5'">
			<div class="flex items-center justify-between shrink-0 mb-2 h-7">
				<div
					v-if="totalBanks > 1"
					class="flex items-center gap-1 bg-gray-800 rounded border border-gray-700 px-1"
				>
					<button
						@click="prevBank"
						:disabled="currentBank <= 0"
						class="p-0.5 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
						title="Previous bank"
					>
						<ChevronLeft class="w-4 h-4" />
					</button>
					<span class="text-xs font-mono text-gray-200 font-bold w-12 text-center"
						>Bank {{ currentBank }}</span
					>
					<button
						@click="nextBank"
						:disabled="currentBank >= totalBanks - 1"
						class="p-0.5 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
						title="Next bank"
					>
						<ChevronRight class="w-4 h-4" />
					</button>
				</div>
				<span v-else></span>
				<button
					@click="toggleCompact"
					class="p-1 hover:bg-gray-700 rounded text-gray-300"
					:title="isCompact ? 'Show Details' : 'Compact View'"
				>
					<Maximize2 v-if="isCompact" class="w-4 h-4" />
					<Minimize2 v-else class="w-4 h-4" />
				</button>
			</div>

			<!-- The graphical display -->
			<div ref="mapArea" class="relative flex-1 min-h-0 my-2">
				<!-- Address ruler -->
				<div class="absolute inset-y-0 left-0" :style="{ width: `${RULER_W}px` }">
					<div
						v-for="tick in ticks"
						:key="tick.addr"
						class="absolute right-0 flex items-center gap-1 -translate-y-1/2"
						:style="{ top: `${tick.y}px` }"
					>
						<span
							class="text-[10px] font-mono leading-none"
							:class="tick.major ? 'text-gray-400' : 'text-gray-600'"
						>
							{{ tick.label }}
						</span>
						<span class="h-px bg-gray-600" :class="tick.major ? 'w-2' : 'w-1'"></span>
					</div>
				</div>

				<!-- Bar -->
				<div
					class="absolute inset-y-0 bg-gray-900 border border-gray-700 rounded-sm"
					:style="{ left: `${RULER_W}px`, width: `${barWidth}px` }"
				>
					<div
						v-for="tick in ticks"
						:key="tick.addr"
						class="absolute inset-x-0 h-px bg-gray-800"
						:style="{ top: `${tick.y}px` }"
					></div>
					<div
						v-for="region in layout.regions"
						:key="region.name"
						class="absolute rounded-[1px] border border-gray-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] cursor-pointer transition-[filter,box-shadow]"
						:class="hovered === region.name ? 'z-10 brightness-125 ring-1 ring-white' : ''"
						:style="region.style"
						@click="onRegionClick(region)"
						@mouseenter="hovered = region.name"
						@mouseleave="hovered = null"
						:title="tooltip(region)"
					></div>
				</div>

				<!-- Leader lines -->
				<svg
					class="absolute inset-y-0 pointer-events-none overflow-visible"
					:style="{ left: `${RULER_W + barWidth}px`, width: `${LEADER_W}px` }"
					:height="mapHeight"
				>
					<path
						v-for="label in layout.labels"
						:key="label.name"
						:d="`M0 ${label.anchorY} H${LEADER_W / 3} L${(LEADER_W * 2) / 3} ${label.y} H${LEADER_W}`"
						fill="none"
						:stroke="label.color"
						:stroke-width="hovered === label.name ? 2 : 1"
						:stroke-opacity="hovered && hovered !== label.name ? 0.3 : 0.8"
					/>
				</svg>

				<!-- Labels -->
				<div class="absolute inset-y-0 right-0" :style="{ left: `${RULER_W + barWidth + LEADER_W}px` }">
					<div
						v-for="label in layout.labels"
						:key="label.name"
						class="absolute left-0 right-0 flex items-center gap-1 -translate-y-1/2 px-1 rounded cursor-pointer whitespace-nowrap overflow-hidden"
						:class="[
							hovered === label.name ? 'bg-gray-700/80' : '',
							hovered && hovered !== label.name ? 'opacity-40' : '',
						]"
						:style="{ top: `${label.y}px`, height: `${LABEL_H}px` }"
						@click="onRegionClick(label.region)"
						@mouseenter="hovered = label.name"
						@mouseleave="hovered = null"
						:title="tooltip(label.region)"
					>
						<span class="w-2 h-2 rounded-sm shrink-0" :style="{ backgroundColor: label.color }"></span>
						<span class="text-xs font-bold text-gray-200 shrink-0">{{ label.name }}</span>
						<Lock v-if="!label.region.removable" class="w-3 h-3 shrink-0 text-gray-500" />
						<Layers v-if="isMirrored(label.region)" class="w-3 h-3 shrink-0 text-gray-500" />
						<span class="text-[10px] font-mono text-gray-500 pl-2 min-w-0 truncate">{{
							formatRange(label.region)
						}}</span>
					</div>
				</div>
			</div>
		</div>

		<!-- The controls -->
		<div class="flex flex-col min-h-0 flex-1 min-w-0" v-if="!isCompact">
			<div class="flex flex-col space-y-2 min-h-0 flex-1">
				<div class="flex items-center justify-between shrink-0 h-7">
					<h3 class="text-sm font-bold uppercase text-gray-500 tracking-wider">Regions</h3>
					<button
						@click="openAddForm"
						:disabled="isAdding"
						class="flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-cyan-300 hover:bg-gray-700 rounded disabled:opacity-40 disabled:cursor-not-allowed"
						title="Add a region"
					>
						<Plus class="w-3.5 h-3.5" />
						Add
					</button>
				</div>
				<!-- Inline form to add a new region -->
				<form
					v-if="isAdding"
					@submit.prevent="addNewRegion"
					@keydown.esc.stop="closeAddForm"
					class="flex flex-col gap-2 p-2 bg-gray-900/50 rounded border border-cyan-700/50 shrink-0"
				>
					<div class="flex items-center gap-2">
						<input
							id="new-region-color"
							v-model="newRegion.color"
							type="color"
							title="Color"
							class="h-7 w-8 shrink-0 p-0.5 bg-gray-800 border border-gray-600 rounded cursor-pointer"
						/>
						<input
							id="new-region-name"
							ref="nameInput"
							v-model="newRegion.name"
							placeholder="Name"
							autocomplete="off"
							data-1p-ignore
							aria-label="Name"
							class="flex-1 min-w-0 bg-gray-800 text-sm text-gray-200 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
						/>
					</div>
					<div class="flex items-center gap-2">
						<input
							id="new-region-start"
							v-model="newRegion.start"
							placeholder="Start (hex)"
							autocomplete="off"
							data-1p-ignore
							aria-label="Start (hex)"
							class="flex-1 min-w-0 bg-gray-800 text-sm text-gray-200 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-cyan-500 font-mono"
						/>
						<input
							id="new-region-size"
							v-model="newRegion.size"
							placeholder="Size (hex)"
							autocomplete="off"
							data-1p-ignore
							aria-label="Size (hex)"
							class="flex-1 min-w-0 bg-gray-800 text-sm text-gray-200 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-cyan-500 font-mono"
						/>
					</div>
					<p v-if="formError" class="text-xs text-red-400">{{ formError }}</p>
					<div class="flex justify-end gap-2">
						<button
							type="button"
							@click="closeAddForm"
							class="px-3 py-1 text-xs font-bold text-gray-300 hover:bg-gray-700 rounded"
						>
							Cancel
						</button>
						<button
							type="submit"
							class="px-3 py-1 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded"
						>
							Add Region
						</button>
					</div>
				</form>
				<p v-if="removableRegions.length === 0 && !isAdding" class="text-xs text-gray-500 italic">
					No user regions in this bank.
				</p>
				<ul class="space-y-1 overflow-y-auto pr-2 -mr-2 flex-1 min-h-0">
					<li
						v-for="region in removableRegions"
						:key="region.name"
						class="flex items-center justify-between text-sm p-2 rounded cursor-pointer"
						:class="hovered === region.name ? 'bg-gray-700/80' : 'bg-gray-900/50'"
						@click="onRegionClick(region)"
						@mouseenter="hovered = region.name"
						@mouseleave="hovered = null"
					>
						<div class="flex items-center space-x-3 min-w-0">
							<div
								class="w-4 h-4 rounded-sm border border-white/10 shrink-0"
								:style="{ backgroundColor: region.color }"
							></div>
							<span class="font-mono text-gray-200 truncate">{{ region.name }}</span>
							<span class="text-gray-400 font-mono text-xs">{{ formatRange(region) }}</span>
						</div>
						<button
							v-if="region.removable !== false"
							@click.stop="removeRegion(region.name)"
							class="text-red-500 hover:text-red-400 font-bold text-lg leading-none px-1"
						>
							&times;
						</button>
					</li>
				</ul>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { useElementSize, useLocalStorage } from "@vueuse/core";
import { ChevronLeft, ChevronRight, Layers, Lock, Maximize2, Minimize2, Plus } from "lucide-vue-next";
import { computed, inject, nextTick, type Ref, ref } from "vue";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { type MemoryRegion, useMemoryMap } from "@/composables/useMemoryMap";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const ADDR_SPACE = 0x10000;
const RULER_W = 44;
const BAR_MIN_W = 120;
const TRACK_W = 56; // width given to each column of overlapping regions
const LABELS_MIN_W = 180;
const LEADER_W = 32;
const LABEL_H = 18;
const MIN_REGION_H = 3;

const { regions, addRegion, removeRegion, currentBank } = useMemoryMap();
const vm = inject<Ref<VirtualMachine>>("vm");

const emit = defineEmits<{ (e: "resize-by", dWidth: number): void }>();

// Share of the width given to the map column when the side panel is shown (matches `w-3/5`)
const MAP_RATIO = 3 / 5;
const root = ref<HTMLElement | null>(null);
const isCompact = useLocalStorage("memorymap-compact", false);

// Keep the map column the same width: the window grows/shrinks by the side panel's width
const toggleCompact = () => {
	const width = root.value?.clientWidth ?? 0;
	isCompact.value = !isCompact.value;
	emit("resize-by", isCompact.value ? -width * (1 - MAP_RATIO) : width * (1 / MAP_RATIO - 1));
};
const hovered = ref<string | null>(null);
const { memoryViewAddress } = useDebuggerNav();

const mapArea = ref<HTMLElement | null>(null);
const { width: mapWidth, height: mapHeight } = useElementSize(mapArea);

const onRegionClick = (region: MemoryRegion) => {
	const bank = region.bank !== undefined ? region.bank : currentBank.value;
	memoryViewAddress.value = (bank << 16) | region.start;
};

const totalBanks = computed(() => vm?.value?.machineConfig?.memory?.banks ?? 1);
const nextBank = () => {
	if (currentBank.value < totalBanks.value - 1) currentBank.value++;
};
const prevBank = () => {
	if (currentBank.value > 0) currentBank.value--;
};

const isMirrored = (region: MemoryRegion) => region.bank === undefined && totalBanks.value > 1;

const visibleRegions = computed(() =>
	regions.value.filter((r) => r.bank === undefined || r.bank === currentBank.value),
);
const removableRegions = computed(() => visibleRegions.value.filter((region) => region.removable !== false));

const newRegion = ref({
	name: "",
	start: "",
	size: "",
	color: "#a855f7", // purple-500
});

const addrToY = (addr: number) => (addr / ADDR_SPACE) * mapHeight.value;

// Ruler: every $1000, with labels every $2000 (or every $4000 when the map is short)
const ticks = computed(() => {
	const labelEvery = mapHeight.value < 260 ? 0x4000 : 0x2000;
	const result: { addr: number; y: number; label: string; major: boolean }[] = [];
	for (let addr = 0; addr <= ADDR_SPACE; addr += 0x1000) {
		const major = addr % labelEvery === 0;
		const shown = addr === ADDR_SPACE ? 0xffff : addr;
		result.push({
			addr,
			y: addrToY(addr),
			label: major ? `$${shown.toString(16).toUpperCase().padStart(4, "0")}` : "",
			major,
		});
	}
	return result;
});

const layout = computed(() => {
	const height = mapHeight.value;
	const sorted = [...visibleRegions.value].sort((a, b) => a.start - b.start || b.size - a.size);
	const overlaps = (a: MemoryRegion, b: MemoryRegion) => a.start < b.start + b.size && a.start + a.size > b.start;

	// Overlapping regions are spread across side-by-side columns ("tracks") of the bar
	const tracks: MemoryRegion[][] = [];
	const placed = sorted.map((region) => {
		const isIsolated = !sorted.some((other) => other !== region && overlaps(region, other));
		let trackIndex = tracks.findIndex((track) => !track.some((r) => overlaps(r, region)));
		if (trackIndex === -1) trackIndex = tracks.push([]) - 1;
		tracks[trackIndex].push(region);
		return { region, trackIndex, isIsolated };
	});
	const totalTracks = Math.max(1, tracks.length);

	const bars = placed.map(({ region, trackIndex, isIsolated }) => {
		const top = addrToY(region.start);
		const h = Math.max(MIN_REGION_H, addrToY(region.size));
		return {
			...region,
			style: {
				top: `${Math.min(top, height - h)}px`,
				height: `${h}px`,
				left: isIsolated ? "0%" : `${(trackIndex / totalTracks) * 100}%`,
				width: isIsolated ? "100%" : `${100 / totalTracks}%`,
				backgroundColor: region.color,
			},
		};
	});

	// Labels sit beside the bar, at their region's middle, pushed apart so they never overlap
	const gap = sorted.length * LABEL_H > height ? height / Math.max(1, sorted.length) : LABEL_H;
	const labels = sorted.map((region) => {
		const anchorY = Math.min(height, addrToY(region.start + region.size / 2));
		return { name: region.name, color: region.color ?? "#888", region, anchorY, y: anchorY };
	});
	for (let i = 0; i < labels.length; i++) {
		const min = i === 0 ? gap / 2 : labels[i - 1].y + gap;
		labels[i].y = Math.max(labels[i].y, min);
	}
	for (let i = labels.length - 1; i >= 0; i--) {
		const max = i === labels.length - 1 ? height - gap / 2 : labels[i + 1].y - gap;
		labels[i].y = Math.max(gap / 2, Math.min(labels[i].y, max));
	}

	return { regions: bars, labels, totalTracks };
});

// The bar widens with the number of overlapping columns, leaving room for the labels
const barWidth = computed(() => {
	const wanted = Math.max(BAR_MIN_W, layout.value.totalTracks * TRACK_W);
	const available = mapWidth.value - RULER_W - LEADER_W - LABELS_MIN_W;
	return Math.max(BAR_MIN_W, Math.min(wanted, available));
});

const formatRange = (region: MemoryRegion) => {
	const startHex = region.start.toString(16).toUpperCase().padStart(4, "0");
	const endHex = (region.start + region.size - 1).toString(16).toUpperCase().padStart(4, "0");
	return `$${startHex}..$${endHex}`;
};

const tooltip = (region: MemoryRegion) =>
	`${region.name} (${formatRange(region)})${isMirrored(region) ? " (Mirrored)" : ""}`;

const isAdding = ref(false);
const formError = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

const openAddForm = async () => {
	isAdding.value = true;
	formError.value = "";
	await nextTick();
	nameInput.value?.focus();
};

const closeAddForm = () => {
	isAdding.value = false;
	formError.value = "";
	newRegion.value.name = "";
	newRegion.value.start = "";
	newRegion.value.size = "";
};

const validateNewRegion = (name: string, start: number, size: number) => {
	if (!name) return "Name is required.";
	if (Number.isNaN(start) || start < 0 || start > 0xffff) return "Start must be hex $0000-$FFFF.";
	if (Number.isNaN(size) || size <= 0) return "Size must be a positive hex number.";
	if (regions.value.some((r) => r.name === name)) return `"${name}" already exists.`;
	return "";
};

const addNewRegion = () => {
	const name = newRegion.value.name.trim();
	const start = parseInt(newRegion.value.start, 16);
	const size = parseInt(newRegion.value.size, 16);

	formError.value = validateNewRegion(name, start, size);
	if (formError.value) return;

	addRegion({
		name,
		start,
		size: Math.min(size, 0x10000 - start),
		color: newRegion.value.color,
		bank: currentBank.value, // Assign to current bank
	});
	closeAddForm();
};
</script>
