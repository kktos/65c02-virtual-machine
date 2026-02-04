<template>
	<Sheet v-model:open="isLibraryOpen">
		<SheetTrigger as-child>
			<Button
				variant="ghost"
				size="icon"
				class="h-[30px] w-[30px] text-gray-400 hover:text-yellow-300 hover:bg-gray-700"
				title="Load Binary to Memory"
				@click="refreshLibrary"
			>
				<FileDown class="h-4 w-4" />
			</Button>
		</SheetTrigger>
		<SheetContent side="right" class="bg-gray-900 border-gray-700 text-gray-100 w-[400px] flex flex-col h-full overflow-hidden">
			<SheetHeader class="shrink-0">
				<SheetTitle class="text-gray-100">Binary Library</SheetTitle>
				<SheetDescription class="text-gray-400">
					Load a binary file into memory at address ${{ address.toString(16).toUpperCase().padStart(4, '0') }}.
				</SheetDescription>
			</SheetHeader>

			<ScrollArea class="mt-6 flex-1 min-h-0 pr-4">
				<div class="space-y-4">
					<div v-if="savedBinaries.length === 0" class="text-center text-gray-500 py-8">
						No binaries saved. Upload one to get started.
					</div>

					<div v-for="bin in savedBinaries" :key="bin.key.toString()" class="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700">
						<template v-if="editingKey === bin.key">
							<div class="flex-1 mr-2">
								<input
									:ref="(el) => { if(el) editInput = el as HTMLInputElement }"
									v-model="editingName"
									class="w-full bg-gray-900 text-gray-100 text-sm px-2 py-1 rounded border border-gray-600 focus:border-cyan-500 outline-none"
									@keydown.enter="saveRename"
									@keydown.esc="cancelEditing"
								/>
							</div>
							<div class="flex space-x-2 shrink-0">
								<button @click="saveRename" class="p-1.5 text-green-400 hover:bg-gray-700 rounded" title="Save">
									<Check class="h-5 w-5" />
								</button>
								<button @click="cancelEditing" class="p-1.5 text-red-400 hover:bg-gray-700 rounded" title="Cancel">
									<X class="h-5 w-5" />
								</button>
							</div>
						</template>
						<template v-else>
							<div class="overflow-hidden mr-3">
								<div class="font-medium truncate text-sm text-gray-200" :title="bin.name">{{ bin.name }}</div>
								<div class="text-xs text-gray-500">{{ formatSize(bin.size) }}</div>
							</div>
							<div class="flex space-x-2 shrink-0">
								<button @click="handleLoadBinary(bin.key)" class="p-1.5 text-green-400 hover:bg-gray-700 rounded" title="Load to Memory">
									<FileDown class="h-5 w-5" />
								</button>
								<button @click="startEditing(bin)" class="p-1.5 text-blue-400 hover:bg-gray-700 rounded" title="Rename">
									<Pencil class="h-5 w-5" />
								</button>
								<button @click="handleDeleteBinary(bin.key)" class="p-1.5 text-red-400 hover:bg-gray-700 rounded" title="Delete">
									<X class="h-5 w-5" />
								</button>
							</div>
						</template>
					</div>
				</div>
			</ScrollArea>

			<div class="mt-6 pt-6 border-t border-gray-800 shrink-0">
				<label class="flex items-center justify-center px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 cursor-pointer transition-colors">
					<span class="mr-2">Upload New Binary</span>
					<input type="file" @change="handleFileUpload" class="hidden" />
					<FileDown class="h-5 w-5 text-cyan-400" />
				</label>
			</div>
		</SheetContent>
	</Sheet>
</template>

<script lang="ts" setup>
import { Check, FileDown, Pencil, X } from "lucide-vue-next";
import { inject, nextTick, type Ref, ref } from "vue";
import { Button } from "@/components/ui/button";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useBinaryStorage } from "@/composables/useBinaryStorage";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const props = defineProps<{
    address: number;
    debugOverrides: Record<string, unknown>;
}>();

const vm = inject<Ref<VirtualMachine>>("vm");

const { saveBinary, loadBinary, getAllBinaries, deleteBinary } = useBinaryStorage();
const isLibraryOpen = ref(false);
const savedBinaries = ref<{ key: IDBValidKey; name: string; size: number }[]>([]);

const editingKey = ref<IDBValidKey | null>(null);
const editingName = ref("");
const editInput = ref<HTMLInputElement | null>(null);

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// biome-ignore lint/suspicious/noAssignInExpressions: <compact>
const refreshLibrary = async () => savedBinaries.value = await getAllBinaries();

const handleFileUpload = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
        const file = input.files[0] as File;
        await saveBinary(file.name, file.name, await file.arrayBuffer());
        await refreshLibrary();
        input.value = '';
    }
};

const handleLoadBinary = async (key: IDBValidKey) => {
    const bin = await loadBinary(key);
    if (bin && vm?.value) {
        const data = new Uint8Array(bin.data);
        for (let i = 0; i < data.length; i++) vm.value.writeDebug(props.address + i, data[i]!, props.debugOverrides || {});
        isLibraryOpen.value = false;
    }
};

const startEditing = (bin: { key: IDBValidKey; name: string }) => {
    editingKey.value = bin.key;
    editingName.value = bin.name;
    nextTick(() => {
        editInput.value?.focus();
        editInput.value?.select();
    });
};

const cancelEditing = () => {
    editingKey.value = null;
    editingName.value = "";
};

const saveRename = async () => {
    if (!editingKey.value || !editingName.value) return;
    const oldKey = editingKey.value;
    const newName = editingName.value;

    const original = savedBinaries.value.find(b => b.key === oldKey);
    if (original && newName !== original.name) {
        const fullData = await loadBinary(oldKey);
        if (fullData) {
            await saveBinary(newName, newName, fullData.data);
            await deleteBinary(oldKey);
            await refreshLibrary();
        }
    }
    cancelEditing();
};

const handleDeleteBinary = async (key: IDBValidKey) => {
    if (confirm('Delete this binary from library?')) {
        await deleteBinary(key);
        await refreshLibrary();
    }
};
</script>
