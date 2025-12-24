<template>
	<div class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
		<label class="cursor-pointer group relative flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors shrink-0">
			<span class="sr-only">Insert Disk</span>
			<input
				type="file"
				accept=".po,.2mg,.dsk,.hdv"
				@change="handleFileSelect"
				class="hidden"
			/>
			<!-- Floppy Disk Icon -->
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-cyan-400 group-hover:text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
			</svg>
		</label>

		<div class="flex flex-col overflow-hidden min-w-[8rem]">
			<span class="text-[10px] uppercase text-gray-400 font-bold tracking-wider">SmartPort (S5)</span>
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
import { inject, type Ref, ref, watch } from 'vue';
import { useDiskStorage } from '@/composables/useDiskStorage';
import type { VirtualMachine } from '@/virtualmachine.class';

const vm = inject<Ref<VirtualMachine>>('vm');
const fileName = ref('');
const fileSize = ref(0);
const { saveDisk, loadDisk } = useDiskStorage();
const SLOT = 5;

const formatSize = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} KB`;
};

const handleFileSelect = async (event: Event) => {
	const input = event.target as HTMLInputElement;
	if (input.files && input.files.length > 0) {
		const file = input.files[0] as File;
		const buffer = await file.arrayBuffer();
		const data = new Uint8Array(buffer);
		fileName.value = file.name;
		fileSize.value = file.size;
		vm?.value?.insertDisk(data, { slot: 5, name: file.name });
		await saveDisk(SLOT, file.name, buffer);
	}
};

watch(() => vm?.value, async (newVm) => {
	if (newVm) {
		await newVm.ready;
		const saved = await loadDisk(SLOT);
		if (saved) {
			fileName.value = saved.name;
			fileSize.value = saved.size;
			newVm.insertDisk(new Uint8Array(saved.data), { slot: SLOT, name: saved.name });
		}
	}
}, { immediate: true });
</script>
