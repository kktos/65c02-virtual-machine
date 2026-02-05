<template>
	<div class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
		<!-- Library Popover -->
		<Popover v-model:open="isLibraryOpen">
			<PopoverTrigger as-child>
				<button class="group relative flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors shrink-0" title="Disk Library">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400 hover:text-yellow-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
					</svg>
					<span v-if="loggingEnabled" class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_4px_rgba(239,68,68,0.6)]"></span>
				</button>
			</PopoverTrigger>
			<PopoverContent class="bg-gray-900 border-gray-700 text-gray-100 w-[340px] p-0" align="center">
				<div class="p-4 pb-2 border-b border-gray-800">
					<h4 class="font-medium leading-none text-gray-100">Disk Drive Setup</h4>
					<p class="text-xs text-gray-400 mt-1">
						Manage disks and drive settings.
					</p>
				</div>

				<ScrollArea class="h-[300px] p-4">
					<div class="space-y-2">
						<div v-if="savedDisks.length === 0" class="text-center text-gray-500 py-8">
							No disks saved. Upload one to get started.
						</div>

						<div v-for="disk in savedDisks" :key="disk.key.toString()" class="group relative flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700 hover:border-gray-600 transition-colors">
							<div class="overflow-hidden mr-2 flex-1">
								<div class="font-medium truncate text-xs text-gray-200" :title="disk.name">{{ disk.name }}</div>
								<div class="text-[10px] text-gray-500">{{ formatSize(disk.size) }}</div>
							</div>
							<button @click="handleLoadFromLibrary(disk.key)" class="p-1 mr-2 text-green-400 hover:bg-gray-700 hover:text-green-300 rounded transition-colors" title="Load">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
							</button>
							<button @click.stop="handleDelete(disk.key)" class="absolute top-1 right-1 p-0.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					</div>
				</ScrollArea>

				<div class="p-4 border-t border-gray-800 bg-gray-900/50 flex flex-col gap-3">
					<label class="flex items-center justify-center px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 cursor-pointer transition-colors w-full">
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

					<div class="h-px bg-gray-800"></div>

					<div class="flex items-center justify-between">
						<label class="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer select-none">
							<input type="checkbox" v-model="loggingEnabled" class="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900">
							<span>Enable Logging</span>
						</label>
						<button @click="openLogs" class="text-xs text-blue-400 hover:text-blue-300 flex items-center px-2 py-1 hover:bg-gray-800 rounded transition-colors">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
							</svg>
							View Logs
						</button>
					</div>
				</div>
			</PopoverContent>
		</Popover>

		<DiskDriveLogs
			v-model:open="isLogSheetOpen"
			:logging-enabled="loggingEnabled"
			:file-size="fileSize"
		/>

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
import { computed, inject, type Ref, ref, watch } from 'vue';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDiskStorage } from '@/composables/useDiskStorage';
import type { VirtualMachine } from '@/virtualmachine/virtualmachine.class';
import DiskDriveLogs from './DiskDriveLogs.vue';

const ACTIVE_DISK_KEY = "vm6502_active_disk_name";

const vm = inject<Ref<VirtualMachine>>('vm');

const diskConfig = computed(() => vm?.value?.machineConfig?.disk);
const fileName = ref('');
const fileSize = ref(0);
const { saveDisk, loadDisk, getAllDisks, deleteDisk } = useDiskStorage();
const savedDisks = ref<{ key: IDBValidKey; name: string; size: number }[]>([]);
const isLibraryOpen = ref(false);
const isLogSheetOpen = ref(false);

const loggingEnabled = ref(false);

const SLOT = 5;

const formatSize = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
		isLibraryOpen.value = false;
	}
};

const handleDelete = async (key: IDBValidKey) => {
	if (confirm('Are you sure you want to delete this disk?')) {
		await deleteDisk(key);
		await refreshLibrary();
	}
};

const openLogs = () => {
	isLibraryOpen.value = false;
	isLogSheetOpen.value = true;
};

watch(
	() => vm?.value,
	async (newVm) => {
		if (newVm) {
			await newVm.ready;
			await refreshLibrary();

			// Try to load last active disk
			const lastDiskName = localStorage.getItem(ACTIVE_DISK_KEY);
			if (lastDiskName) {
				const saved = await loadDisk(lastDiskName);
				if (saved) await loadDiskToVM(saved.name, saved.data);
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
		}
	},
	{ immediate: true },
);

</script>
