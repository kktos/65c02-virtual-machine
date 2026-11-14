<template>
	<div class="panel-card">
		<header class="panel-head">
			<FilePlus2 class="h-4 w-4 text-cyan-400" />
			<span>New disk</span>
			<button class="ml-auto text-gray-400 hover:text-gray-100" title="Close" @click="panel = null">
				<X class="h-4 w-4" />
			</button>
		</header>

		<p v-if="!kinds.length" class="text-gray-400">
			The {{ machine?.name ?? "machine" }}'s disk formats don't make blank disks.
		</p>
		<template v-else>
			<label class="panel-row">
				<span class="panel-label">Kind</span>
				<select v-model="kindValue" class="field flex-1 min-w-0">
					<option v-for="k in kinds" :key="k.value" :value="k.value">{{ k.kind.label }}</option>
				</select>
			</label>
			<label class="panel-row">
				<span class="panel-label">Volume</span>
				<input v-model="volume" class="field flex-1 min-w-0 font-mono" spellcheck="false" />
				<span v-if="volumeName !== volume" class="text-gray-500 font-mono" title="As the file system takes it">
					→ {{ volumeName }}
				</span>
			</label>
			<label class="panel-row">
				<span class="panel-label">File</span>
				<input
					v-model="fileName"
					class="field flex-1 min-w-0 font-mono"
					spellcheck="false"
					title="Its name in the library: the extension says what it is"
					@input="fileEdited = true"
				/>
			</label>
			<label class="panel-row">
				<span class="panel-label">Boot blocks</span>
				<select v-model="bootKey" class="field flex-1 min-w-0">
					<option :value="null">None: the disk doesn't boot</option>
					<option v-for="disk in library" :key="String(disk.key)" :value="String(disk.key)">
						from {{ disk.name }}
					</option>
				</select>
			</label>
			<p class="text-gray-500">
				Booting takes a ProDOS disk's boot blocks, then its PRODOS file and a .SYSTEM program copied to the new
				disk.
			</p>
		</template>

		<p v-if="error" class="text-red-400">{{ error }}</p>

		<footer class="flex justify-end gap-2 pt-1">
			<button class="panel-btn" @click="panel = null">Cancel</button>
			<button class="panel-btn panel-btn-primary" :disabled="!selectedKind || busy" @click="create">
				Create
			</button>
		</footer>
	</div>
</template>

<script lang="ts" setup>
import { FilePlus2, X } from "lucide-vue-next";
import { computed, ref, shallowRef, watch } from "vue";
import { useDiskDrive } from "@/composables/useDiskDrive";
import { useDiskEditor } from "@/composables/useDiskEditor";
import { type StoredDisk, useDiskStorage } from "@/composables/useDiskStorage";
import { useMachine } from "@/composables/useMachine";

const { machine, panel, machineFormats, fetchDiskData, openDisk } = useDiskEditor();
const { listDisks } = useDiskDrive();
const { saveDisk, getAllDisks } = useDiskStorage();
const { vm } = useMachine();

const kinds = computed(() =>
	machineFormats().flatMap((format) =>
		(format.newDisks ?? []).map((kind) => ({ format, kind, value: `${format.id}:${kind.id}` })),
	),
);
const kindValue = ref<string | null>(kinds.value[0]?.value ?? null);
const selectedKind = computed(() => kinds.value.find((k) => k.value === kindValue.value) ?? null);

const volume = ref("UNTITLED");
const volumeName = computed(() => selectedKind.value?.format.volumeName?.(volume.value) ?? volume.value);
const fileName = ref("");
const fileEdited = ref(false);
const bootKey = ref<string | null>(null);
const library = shallowRef<StoredDisk[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);

watch(
	[volumeName, selectedKind],
	() => {
		if (!fileEdited.value)
			fileName.value = `${volumeName.value.toLowerCase()}${selectedKind.value?.kind.extension ?? ""}`;
	},
	{ immediate: true },
);

const create = async () => {
	const k = selectedKind.value;
	if (!k?.format.create) return;
	error.value = null;
	let name = fileName.value.trim();
	if (!name) {
		error.value = "A file name, for the library";
		return;
	}
	// The extension says what the image is: the kind's, unless the format takes the one given
	if (!k.format.extensions.some((ext) => name.toLowerCase().endsWith(ext))) name += k.kind.extension;
	busy.value = true;
	try {
		if ((await getAllDisks()).some((d) => String(d.key) === name)) {
			error.value = `${name} is already in the library`;
			return;
		}
		const bootDisk = library.value.find((d) => String(d.key) === bootKey.value);
		const boot = bootDisk ? { file: (await fetchDiskData(bootDisk.key)).data, name: bootDisk.path } : undefined;
		const data = k.format.create(k.kind.id, volume.value, boot);
		await saveDisk(name, name, name, data.buffer as ArrayBuffer);
		panel.value = null;
		await openDisk(name, false);
	} catch (e) {
		error.value = (e as Error).message;
	} finally {
		busy.value = false;
	}
};

(async () => {
	if (vm.value) library.value = await listDisks(vm.value);
})();
</script>
