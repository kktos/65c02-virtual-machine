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

						<div v-for="disk in savedDisks" :key="disk.key.toString()" class="group relative flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700 hover:border-blue-800/50 transition-colors">
							<div class="overflow-hidden mr-2 flex-1 flex items-center gap-3">
								<div class="shrink-0">
									<Link v-if="disk.type === 'url'" class="h-6 w-6 text-cyan-400" />
									<Save v-else class="h-6 w-6 text-cyan-400" />
								</div>
								<div class="flex-1 overflow-hidden">
									<div class="font-medium truncate text-sm text-gray-200" :title="disk.name">{{ disk.name }}</div>
									<div v-if="disk.type === 'url'" class="text-[10px] text-gray-500 truncate" :title="disk.url">{{ disk.url }}</div>
									<div v-else class="text-[10px] text-gray-500">{{ formatSize(disk.size) }}</div>
								</div>
							</div>
							<button @click="handleLoadFromLibrary(disk.key)" class="p-1 mr-2 text-green-400 hover:bg-gray-700 hover:text-green-300 rounded transition-colors" title="Load">
								<CirclePlay class="h-5 w-5"/>
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
					<div class="flex gap-2">
						<input
							v-model="urlInput"
							@input="urlError = null"
							type="text"
							placeholder="https://example.com/disk.dsk"
							class="flex-1 bg-gray-800 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 placeholder-gray-500"
							@keydown.enter="handleUrlLoad"
						/>
						<button
							@click="handleUrlLoad"
							:disabled="!urlInput || isLoading"
							class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-cyan-400 rounded border border-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
							title="Load from URL"
						>
							<svg v-if="isLoading" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							<svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
							</svg>
						</button>
					</div>
					<div v-if="urlError" class="text-red-400 text-[10px] px-1">{{ urlError }}</div>

					<div class="h-px bg-gray-800"></div>

					<label class="flex items-center justify-center px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 cursor-pointer transition-colors w-full">
						<span class="mr-2">Upload New Disk</span>
						<input
							type="file"
							accept=".po,.2mg,.dsk,.hdv"
							@change="handleFileSelect"
							class="hidden"
						/>
						<Upload class="h-6 w-6 text-cyan-400" />
					</label>

					<div class="h-px bg-gray-800"></div>

					<div class="flex items-center justify-between">
						<label class="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer select-none">
							<input type="checkbox" v-model="loggingEnabled" class="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900">
							<span>Enable Logging</span>
						</label>
						<button @click="openLogs" class="text-xs text-blue-400 hover:text-blue-300 flex items-center px-2 py-1 hover:bg-gray-800 rounded transition-colors">
							<FileText class="h-4 w-4 mr-1.5"/>
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
import { CirclePlay, FileText, Link, Save, Upload } from "lucide-vue-next";
import { computed, inject, type Ref, ref, watch } from 'vue';

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type DiskInfo, useDiskStorage } from '@/composables/useDiskStorage';
import type { VirtualMachine } from '@/virtualmachine/virtualmachine.class';
import DiskDriveLogs from './DiskDriveLogs.vue';

const ACTIVE_DISK_KEY = "vm6502_active_disk_name";
const ACTIVE_DISK_URL_KEY = "vm6502_active_disk_url";

const vm = inject<Ref<VirtualMachine>>('vm');

const diskConfig = computed(() => vm?.value?.machineConfig?.disk);
const fileName = ref('');
const fileSize = ref(0);
const { saveDisk, saveUrlDisk, loadDisk, getAllDisks, deleteDisk } = useDiskStorage();
const savedDisks = ref<DiskInfo[]>([]);
const isLibraryOpen = ref(false);
const isLogSheetOpen = ref(false);

const urlInput = ref('');
const isLoading = ref(false);
const urlError = ref<string | null>(null);
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
};

const loadFromUrl = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to load disk: ${response.statusText}`);

	const buffer = await response.arrayBuffer();
	let name = url.split('/').pop() as string;

	console.log("name", name);
	console.log("buffer", buffer);

	if (!name || name.trim() === '') throw new Error('Invalid disk name');

	name = name.split('?')[0] as string;


	await loadDiskToVM(name, buffer);

	// Try to fetch symbols
	try {
		const parts = url.split('.');
		let symUrl = `${url}.sym`;
		if (parts.length > 1) {
			parts.pop();
			symUrl = `${parts.join('.')}.sym`;
		}

		const symRes = await fetch(symUrl);
		if (symRes.ok) {
			const symText = await symRes.text();
			try {
				const symData = JSON.parse(symText);
				vm?.value?.addSymbols(symData);
				console.log(`Loaded symbols from ${symUrl}`);
			} catch {
				console.warn(`Failed to parse symbols from ${symUrl} as JSON.`);
			}
		}
	} catch (e) {
		console.warn('Symbol fetch failed', e);
	}
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
		localStorage.setItem(ACTIVE_DISK_KEY, file.name);
		localStorage.removeItem(ACTIVE_DISK_URL_KEY);

		// Reset input
		input.value = '';
	}
};

const handleUrlLoad = async () => {
	if (!urlInput.value) return;
	isLoading.value = true;
	urlError.value = null;

	try {
		const url = urlInput.value;
		// Load first to verify it works
		await loadFromUrl(url);

		// If successful, save to library
		let name = url.split('/').pop()?.split('?')[0] || url;
		if (name.trim() === '') name = url;

		await saveUrlDisk(url, name, url);
		await refreshLibrary();

		localStorage.setItem(ACTIVE_DISK_URL_KEY, url);
		localStorage.removeItem(ACTIVE_DISK_KEY);
		urlInput.value = '';
		isLibraryOpen.value = false;
	} catch (e) {
		console.error(e);
		urlError.value = (e as Error).message || 'Failed to load from URL';
	} finally {
		isLoading.value = false;
	}
};

const handleLoadFromLibrary = async (key: IDBValidKey) => {
	const disk = await loadDisk(key);
	if (disk) {
		if (disk.type === 'url') {
			isLoading.value = true;
			try {
				await loadFromUrl(disk.url);
				localStorage.setItem(ACTIVE_DISK_URL_KEY, disk.url);
				localStorage.removeItem(ACTIVE_DISK_KEY);
				isLibraryOpen.value = false;
			} catch (e) {
				console.error(e);
				alert('Failed to load from URL. Check console for details.');
			} finally {
				isLoading.value = false;
			}
		} else { // physical disk
			await loadDiskToVM(disk.name, disk.data);
			localStorage.setItem(ACTIVE_DISK_KEY, disk.name);
			localStorage.removeItem(ACTIVE_DISK_URL_KEY);
			isLibraryOpen.value = false;
		}
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

			const lastUrl = localStorage.getItem(ACTIVE_DISK_URL_KEY);
			if (lastUrl) {
				isLoading.value = true;
				try {
					await loadFromUrl(lastUrl);
				} catch (e) {
					console.error("Failed to load last URL:", e);
				} finally {
					isLoading.value = false;
				}
			} else {
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
		}
	},
	{ immediate: true },
);

</script>
