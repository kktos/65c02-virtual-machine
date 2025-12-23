<template>
	<div class="p-4 bg-gray-800 rounded-lg shadow-xl">
		<h2 class="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3">
			SmartPort Drive (Slot 5)
		</h2>
		<div class="flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<label class="flex-grow cursor-pointer">
					<span class="sr-only">Choose Disk Image</span>
					<input
						type="file"
						accept=".po,.2mg,.dsk,.hdv"
						@change="handleFileSelect"
						class="block w-full text-xs text-gray-400
							file:mr-2 file:py-1 file:px-2
							file:rounded-full file:border-0
							file:text-xs file:font-semibold
							file:bg-indigo-600 file:text-white
							hover:file:bg-indigo-500
							cursor-pointer focus:outline-none"
					/>
				</label>
			</div>
			<div v-if="fileName" class="text-xs text-gray-300 bg-gray-900 p-2 rounded border border-gray-700">
				<div class="flex justify-between items-center">
					<span class="truncate max-w-[150px]" :title="fileName">{{ fileName }}</span>
					<span class="text-gray-500 font-mono">{{ formatSize(fileSize) }}</span>
				</div>
			</div>
			<div v-else class="text-xs text-gray-500 italic text-center p-1">
				No disk inserted
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { inject, type Ref, ref } from 'vue';
import type { VirtualMachine } from '@/virtualmachine.class';

const vm = inject<Ref<VirtualMachine>>('vm');
const fileName = ref('');
const fileSize = ref(0);

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
	}
};
</script>
