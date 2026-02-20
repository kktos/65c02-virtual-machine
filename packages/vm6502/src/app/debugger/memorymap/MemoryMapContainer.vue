<template>
	<div class="flex flex-col h-full space-y-6">
		<div class="flex gap-4 shrink-0">
			<!-- Bank Controls -->
			<div
				v-if="totalBanks > 1"
				class="flex flex-col items-center justify-between bg-gray-800 rounded p-1 border border-gray-700 w-10 shrink-0 h-24 self-end"
			>
				<button
					@click="nextBank"
					:disabled="currentBank >= totalBanks - 1"
					class="p-1 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
				>
					<ChevronUp class="w-4 h-4" />
				</button>
				<span class="text-sm font-mono text-gray-200 font-bold">{{ currentBank }}</span>
				<button
					@click="prevBank"
					:disabled="currentBank <= 0"
					class="p-1 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
				>
					<ChevronDown class="w-4 h-4" />
				</button>
			</div>

			<div class="flex-1 flex flex-col gap-2">
				<div class="flex justify-end">
					<button
						@click="isCompact = !isCompact"
						class="p-1 hover:bg-gray-700 rounded text-gray-300"
						:title="isCompact ? 'Show Details' : 'Compact View'"
					>
						<Maximize2 v-if="isCompact" class="w-4 h-4" />
						<Minimize2 v-else class="w-4 h-4" />
					</button>
				</div>
				<!-- The graphical display -->
				<div class="relative w-full h-24 bg-gray-900 rounded-md p-1 border border-gray-700">
					<div
						v-for="region in processedRegions"
						:key="region.name"
						class="absolute rounded-sm text-white flex items-center justify-center overflow-hidden border border-black/10 shadow-sm transition-all hover:z-10 hover:brightness-110 cursor-pointer"
						:style="region.style"
						@click="onRegionClick(region)"
						:title="`${region.name} ($${region.start.toString(16).toUpperCase()} - $${(region.start + region.size - 1).toString(16).toUpperCase()})${region.bank === undefined && totalBanks > 1 ? ' (Mirrored)' : ''}`"
					>
						<Layers v-if="region.bank === undefined && totalBanks > 1" class="w-3 h-3 absolute top-0.5 right-0.5 text-white/70" />
						<Lock v-if="!region.removable" class="w-3 h-3 absolute top-0.5 left-0.5 text-white/70" />
						<span class="text-xs text-white font-bold text-center mix-blend-difference whitespace-nowrap px-2">
							{{ region.name }}
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- The controls -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-8 min-h-0 flex-1" v-if="!isCompact">
			<div class="flex flex-col space-y-2 min-h-0">
				<h3 class="text-sm font-bold uppercase text-gray-500 tracking-wider shrink-0">Regions</h3>
				<ul class="space-y-1 overflow-y-auto pr-2 -mr-2 flex-1">
					<li v-for="region in removableRegions" :key="region.name" class="flex items-center justify-between text-sm p-2 bg-gray-900/50 rounded">
						<div class="flex items-center space-x-3">
							<div class="w-4 h-4 rounded-sm border border-white/10" :style="{ backgroundColor: region.color }"></div>
							<span class="font-mono text-gray-200">{{ region.name }}</span>
							<span class="text-gray-400">{{ formatRange(region) }}</span>
						</div>
						<button
							v-if="region.removable !== false"
							@click="removeRegion(region.name)"
							class="text-red-500 hover:text-red-400 font-bold text-lg leading-none px-1"
						>
							&times;
						</button>
					</li>
				</ul>
			</div>
			<!-- Form to add new region -->
			<div class="flex flex-col space-y-2">
				<h3 class="text-sm font-bold uppercase text-gray-500 tracking-wider">Add New Region</h3>
				<form @submit.prevent="addNewRegion" class="flex flex-col gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
					<div class="flex items-center gap-3">
						<label for="new-region-name" class="text-sm text-gray-400 w-16">Name</label>
						<input
							id="new-region-name"
							v-model="newRegion.name"
							placeholder="e.g. VRAM"
							class="flex-1 bg-gray-800 text-sm text-gray-200 border border-gray-600 rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500"
						/>
					</div>
					<div class="flex items-center gap-3">
						<label for="new-region-start" class="text-sm text-gray-400 w-16">Start</label>
						<input
							id="new-region-start"
							v-model="newRegion.start"
							placeholder="Hex, e.g. 400"
							class="flex-1 bg-gray-800 text-sm text-gray-200 border border-gray-600 rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500 font-mono"
						/>
					</div>
					<div class="flex items-center gap-3">
						<label for="new-region-size" class="text-sm text-gray-400 w-16">Size</label>
						<input
							id="new-region-size"
							v-model="newRegion.size"
							placeholder="Hex, e.g. 400"
							class="flex-1 bg-gray-800 text-sm text-gray-200 border border-gray-600 rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500 font-mono"
						/>
					</div>
					<div class="flex items-center gap-3">
						<label for="new-region-color" class="text-sm text-gray-400 w-16">Color</label>
						<input
							id="new-region-color"
							v-model="newRegion.color"
							type="color"
							class="h-8 w-12 p-0.5 bg-gray-800 border border-gray-600 rounded cursor-pointer"
						/>
					</div>
					<button type="submit" class="mt-2 px-4 py-2 text-sm font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-md w-full">
						Add Region
					</button>
				</form>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { ChevronDown, ChevronUp, Layers, Lock, Maximize2, Minimize2 } from "lucide-vue-next";
import { computed, inject, type Ref, ref } from "vue";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { type MemoryRegion, useMemoryMap } from "@/composables/useMemoryMap";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const { regions, addRegion, removeRegion, currentBank } = useMemoryMap();
const vm = inject<Ref<VirtualMachine>>("vm");

const isCompact = ref(false);
const { memoryViewAddress } = useDebuggerNav();

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

const visibleRegions = computed(() => regions.value.filter((r) => r.bank === undefined || r.bank === currentBank.value));
const removableRegions = computed(() => visibleRegions.value.filter((region) => region.removable !== false));

const newRegion = ref({
	name: "",
	start: "",
	size: "",
	color: "#a855f7", // purple-500
});

const processedRegions = computed(() => {
	// Sort by start address
	const sorted = [...visibleRegions.value].sort((a, b) => a.start - b.start || b.size - a.size);

	const tracks: MemoryRegion[][] = [];
	const regionTracks: { region: MemoryRegion; trackIndex: number; isIsolated: boolean }[] = [];

	for (const region of sorted) {
		// Check global overlap to determine isolation
		const isIsolated = !sorted.some((other) => {
			if (other === region) return false;
			const rEnd = region.start + region.size;
			const oEnd = other.start + other.size;
			return region.start < oEnd && rEnd > other.start;
		});

		let trackIndex = 0;
		while (true) {
			if (!tracks[trackIndex]) {
				tracks[trackIndex] = [];
				break;
			}
			// Check overlap within track for placement
			const overlap = tracks[trackIndex].some((r) => {
				const rEnd = r.start + r.size;
				const regionEnd = region.start + region.size;
				return region.start < rEnd && regionEnd > r.start;
			});

			if (!overlap) {
				break;
			}
			trackIndex++;
		}
		tracks[trackIndex].push(region);
		regionTracks.push({ region, trackIndex, isIsolated });
	}

	const totalTracks = Math.max(1, tracks.length);

	return regionTracks.map(({ region, trackIndex, isIsolated }) => {
		return {
			...region,
			style: {
				left: `${(region.start / 0x10000) * 100}%`,
				width: `${Math.max(0.1, (region.size / 0x10000) * 100)}%`,
				height: isIsolated ? "100%" : `${100 / totalTracks}%`,
				top: isIsolated ? "0%" : `${(trackIndex / totalTracks) * 100}%`,
				backgroundColor: region.color,
			},
		};
	});
});

const formatRange = (region: MemoryRegion) => {
	const startHex = region.start.toString(16).toUpperCase().padStart(4, "0");
	const endHex = (region.start + region.size - 1).toString(16).toUpperCase().padStart(4, "0");
	return `$${startHex}..$${endHex}`;
};

const addNewRegion = () => {
	const start = parseInt(newRegion.value.start, 16);
	const size = parseInt(newRegion.value.size, 16);

	if (!newRegion.value.name || Number.isNaN(start) || Number.isNaN(size) || size <= 0) {
		alert("Invalid region data. Please provide a name, and positive start/size in hex.");
		return;
	}

	addRegion({
		name: newRegion.value.name,
		start,
		size,
		color: newRegion.value.color,
		bank: currentBank.value, // Assign to current bank
	});

	// Reset form
	newRegion.value.name = "";
	newRegion.value.start = "";
	newRegion.value.size = "";
};
</script>
