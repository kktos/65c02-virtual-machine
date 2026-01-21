<template>
	<div v-if="diskConfig?.enabled" class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
		<!-- Library Sheet -->
		<Sheet v-model:open="isSheetOpen">
			<SheetTrigger as-child>
				<button class="group flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors shrink-0" title="Disk Library">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400 hover:text-yellow-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
					</svg>

				</button>
			</SheetTrigger>
			<SheetContent side="right" class="bg-gray-900 border-gray-700 text-gray-100 w-[400px] flex flex-col h-full overflow-hidden">
				<SheetHeader class="shrink-0">
					<SheetTitle class="text-gray-100">Disk Library</SheetTitle>
					<SheetDescription class="text-gray-400">
						Select a disk to insert into the SmartPort drive.
					</SheetDescription>
				</SheetHeader>

				<ScrollArea class="mt-6 flex-1 min-h-0 pr-4">
					<div class="space-y-4">
						<div v-if="savedDisks.length === 0" class="text-center text-gray-500 py-8">
							No disks saved. Upload one to get started.
						</div>

						<div v-for="disk in savedDisks" :key="disk.key.toString()" class="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700">
							<div class="overflow-hidden mr-3">
								<div class="font-medium truncate text-sm text-gray-200" :title="disk.name">{{ disk.name }}</div>
								<div class="text-xs text-gray-500">{{ formatSize(disk.size) }}</div>
							</div>
							<div class="flex space-x-2 shrink-0">
								<button @click="handleLoadFromLibrary(disk.key)" class="p-1.5 text-green-400 hover:bg-gray-700 rounded" title="Load">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
								</button>
								<button @click="handleDelete(disk.key)" class="p-1.5 text-red-400 hover:bg-gray-700 rounded" title="Delete">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								</button>
							</div>
						</div>
					</div>
				</ScrollArea>

				<div class="mt-6 pt-6 border-t border-gray-800 shrink-0">
					<label class="flex items-center justify-center px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 cursor-pointer transition-colors">
						<span class="mr-2">Upload New Disk</span>
						<input
							type="file"
							accept=".po,.2mg,.dsk,.hdv"
							@change="handleFileSelect"
							class="hidden"
						/>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-cyan-400 group-hover:text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
						</svg>
					</label>
				</div>
			</SheetContent>
		</Sheet>

		<!-- Logs Sheet -->
		<Sheet v-model:open="isLogSheetOpen">
			<SheetTrigger as-child>
				<button class="group flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors shrink-0" title="SmartPort Logs">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400 hover:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
				</button>
			</SheetTrigger>
			<SheetContent side="right" class="bg-gray-900 border-gray-700 text-gray-100 w-[400px] flex flex-col h-full overflow-hidden">
				<SheetHeader class="shrink-0">
					<SheetTitle class="text-gray-100">SmartPort Logs</SheetTitle>
					<SheetDescription class="text-gray-400">
						Monitor disk read operations.
					</SheetDescription>
				</SheetHeader>

				<div class="mt-4 flex items-center justify-between shrink-0">
					<label class="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
						<input type="checkbox" v-model="loggingEnabled" class="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900">
						<span>Enable Logging</span>
					</label>
					<button @click="logs = []" class="text-xs text-red-400 hover:text-red-300">Clear</button>
				</div>

				<ScrollArea class="mt-4 flex-1 min-h-0 bg-black rounded border border-gray-800 p-2 font-mono text-xs">
					<div v-if="logs.length === 0" class="text-gray-600 italic text-center py-4">
						No logs yet...
					</div>
					<div v-for="(log, i) in logs" :key="i" class="mb-1">
						<span class="text-green-500">[{{ log.type }}]</span>
						<span class="text-gray-400"> Blk:</span>
						<span class="text-yellow-500">{{ log.block }}</span>
						<span class="text-gray-400"> Addr:</span>
						<span class="text-cyan-500">${{ log.address.toString(16).padStart(4, '0') }}</span>
					</div>
				</ScrollArea>

				<div class="mt-4 border-t border-gray-800 pt-4 shrink-0">
					<div class="flex justify-between items-center mb-2 px-1">
						<h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sector Map</h3>
						<span class="text-[10px] text-gray-500 font-mono">{{ uniqueBlocks }} / {{ totalBlocks }} blocks</span>
					</div>
					<div class="bg-black rounded border border-gray-800 p-1">
						<canvas ref="mapCanvas" class="w-full h-auto block" style="image-rendering: pixelated;"></canvas>
					</div>
				</div>
			</SheetContent>
		</Sheet>

		<div class="flex flex-col overflow-hidden min-w-[8rem]">
			<span class="text-[10px] uppercase text-gray-400 font-bold tracking-wider">{{ diskConfig?.name || 'Disk' }}</span>
			<div
				class="text-xs font-mono truncate text-gray-300 cursor-help"
				:title="fileName ? `Size: ${formatSize(fileSize)}` : 'No disk inserted'"
			>
				{{ fileName || 'Empty' }}
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, inject, nextTick, type Ref, ref, watch } from 'vue';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet';
import { useDiskStorage } from '@/composables/useDiskStorage';
import type { VirtualMachine } from '@/virtualmachine/virtualmachine.class';

const vm = inject<Ref<VirtualMachine>>('vm');
const diskConfig = computed(() => vm?.value?.machineConfig?.disk);
const fileName = ref('');
const fileSize = ref(0);
const { saveDisk, loadDisk, getAllDisks, deleteDisk } = useDiskStorage();
const savedDisks = ref<{ key: IDBValidKey; name: string; size: number }[]>([]);
const isSheetOpen = ref(false);
const isLogSheetOpen = ref(false);

const logs = ref<{ type: string; block: number; address: number }[]>([]);
const loggingEnabled = ref(false);
const mapCanvas = ref<HTMLCanvasElement | null>(null);

const ACTIVE_DISK_KEY = 'vm6502_active_disk_name';
const SLOT = 5;

const formatSize = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const totalBlocks = computed(() => Math.ceil(fileSize.value / 512));
const uniqueBlocks = computed(() => new Set(logs.value.map((l) => l.block)).size);

const drawMap = () => {
	const canvas = mapCanvas.value;
	if (!canvas) return;

	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const size = fileSize.value;
	if (size <= 0) {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		return;
	}

	const total = Math.ceil(size / 512);

	// Auto-scale grid based on disk size
	let cols = 256;
	let blockSize = 1;

	if (total <= 3200) {
		// Floppy size (<= 1.6MB)
		cols = 40;
		blockSize = 8;
	} else {
		// Hard Drive size
		cols = 256;
		blockSize = 1;
	}

	canvas.width = cols * blockSize;
	const rows = Math.ceil(total / cols);
	canvas.height = rows * blockSize;

	ctx.fillStyle = '#1f2937'; // gray-800 (unread)
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = '#34d399'; // emerald-400 (read)
	const unique = new Set(logs.value.map((l) => l.block));
	const gap = blockSize > 2 ? 1 : 0;

	unique.forEach((block) => {
		const r = Math.floor(block / cols);
		const c = block % cols;
		ctx.fillRect(c * blockSize, r * blockSize, blockSize - gap, blockSize - gap);
	});
};

const refreshLibrary = async () => {
	savedDisks.value = await getAllDisks();
};

const loadDiskToVM = async (name: string, data: ArrayBuffer) => {
	fileName.value = name;
	fileSize.value = data.byteLength;
	vm?.value?.insertDisk(new Uint8Array(data), { slot: SLOT, name });
	localStorage.setItem(ACTIVE_DISK_KEY, name);
};

const handleFileSelect = async (event: Event) => {
	const input = event.target as HTMLInputElement;
	if (input.files && input.files.length > 0) {
		const file = input.files[0] as File;
		const buffer = await file.arrayBuffer();

		// Save to Library
		await saveDisk(file.name, file.name, buffer);
		await refreshLibrary();

		// Load to VM
		await loadDiskToVM(file.name, buffer);

		// Reset input
		input.value = '';
	}
};

const handleLoadFromLibrary = async (key: IDBValidKey) => {
	const disk = await loadDisk(key);
	if (disk) {
		await loadDiskToVM(disk.name, disk.data);
		isSheetOpen.value = false;
	}
};

const handleDelete = async (key: IDBValidKey) => {
	if (confirm('Are you sure you want to delete this disk?')) {
		await deleteDisk(key);
		await refreshLibrary();
	}
};

watch(loggingEnabled, (enabled) => {
	vm?.value?.setDebugOverrides("bus",{ slot:5, smartPortLogging: enabled });
});

watch([logs, fileSize, isLogSheetOpen], () => {
	if (isLogSheetOpen.value) {
		nextTick(drawMap);
	}
}, { deep: true });

watch(() => vm?.value, async (newVm) => {
	if (newVm) {
		await newVm.ready;
		await refreshLibrary();

		// Try to load last active disk
		const lastDiskName = localStorage.getItem(ACTIVE_DISK_KEY);
		if (lastDiskName) {
			const saved = await loadDisk(lastDiskName);
			if (saved) {
				await loadDiskToVM(saved.name, saved.data);
			}
		} else {
			// Fallback to legacy slot 5 if exists
			const legacy = await loadDisk(5);
			if (legacy) {
				await loadDiskToVM(legacy.name, legacy.data);
				// Migrate to new system
				await saveDisk(legacy.name, legacy.name, legacy.data);
				localStorage.setItem(ACTIVE_DISK_KEY, legacy.name);
			}
		}

		newVm.onSmartPortLog = (log) => {
			if (loggingEnabled.value) logs.value.push(log);
			console.log(log);
		};
	}
}, { immediate: true });
</script>
