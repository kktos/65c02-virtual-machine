<template>
	<div class="panel-card">
		<header class="panel-head">
			<Copy class="h-4 w-4 text-cyan-400" />
			<span>Copy {{ files.length }} file{{ files.length === 1 ? "" : "s" }}</span>
			<button class="ml-auto text-gray-400 hover:text-gray-100" title="Close" @click="panel = null">
				<X class="h-4 w-4" />
			</button>
		</header>

		<p class="font-mono text-gray-300 whitespace-pre-wrap break-all">
			{{
				files
					.slice(0, MAX_NAMES)
					.map((f) => f.name)
					.join(", ")
			}}{{ files.length > MAX_NAMES ? `, +${files.length - MAX_NAMES} more` : "" }}
		</p>

		<label class="panel-row">
			<span class="panel-label">To disk</span>
			<select v-model="targetKey" class="field flex-1 min-w-0" @focus="refreshLibrary">
				<option :value="null" disabled>Pick a disk…</option>
				<option v-for="disk in library" :key="String(disk.key)" :value="String(disk.key)">
					{{ disk.name }}{{ disk.type === "url" ? " (URL disk: read only)" : "" }}
				</option>
			</select>
			<Loader2 v-if="loading" class="h-4 w-4 animate-spin text-cyan-400" />
		</label>

		<label v-if="dirs.length" class="panel-row">
			<span class="panel-label">Directory</span>
			<select v-model="dirId" class="field flex-1 min-w-0 font-mono">
				<option v-for="d in dirs" :key="d.id" :value="d.id">{{ d.label }}</option>
			</select>
		</label>

		<p v-if="targetError" class="text-amber-400">{{ targetError }}</p>

		<ul v-if="results.length" class="space-y-0.5 max-h-40 overflow-auto font-mono">
			<li v-for="(r, i) in results" :key="i" :class="r.error ? 'text-red-400' : 'text-green-400'">
				{{ r.from }} → {{ r.error ?? r.to }}
			</li>
		</ul>
		<p v-if="results.some((r) => r.to) && inDrive" class="flex items-center gap-2 text-amber-300">
			The disk is in the drive: the machine sees the new files once it's inserted again.
			<button class="panel-btn" @click="reinsert">Insert it again</button>
		</p>

		<footer class="flex justify-end gap-2 pt-1">
			<button class="panel-btn" @click="panel = null">Close</button>
			<button
				class="panel-btn panel-btn-primary"
				:disabled="!target?.opened.target || !dirId || !files.length || busy"
				@click="copy"
			>
				Copy
			</button>
		</footer>
	</div>
</template>

<script lang="ts">
/** The disk copied to last: picked again the next time the panel opens */
let lastTargetKey: string | null = null;
</script>

<script lang="ts" setup>
import { Copy, Loader2, X } from "lucide-vue-next";
import { computed, ref, shallowRef, watch } from "vue";
import { useDiskDrive } from "@/composables/useDiskDrive";
import { useDiskEditor } from "@/composables/useDiskEditor";
import { type StoredDisk, useDiskStorage } from "@/composables/useDiskStorage";
import { useMachine } from "@/composables/useMachine";
import type { DiskCopyResult, DiskFileCopy, OpenedDisk } from "@/lib/disk/diskFormat.type";

const MAX_NAMES = 12;

const { analysis, panel, fetchDiskData, openWithFormats, refreshDisk } = useDiskEditor();
const { inserted, listDisks, insertFromLibrary } = useDiskDrive();
const { updateDiskData } = useDiskStorage();
const { vm } = useMachine();

const library = shallowRef<StoredDisk[]>([]);
const targetKey = ref<string | null>(null);
/** The disk copied to: its bytes (written in place, then saved), opened */
const target = shallowRef<{ key: IDBValidKey; bytes: Uint8Array; opened: OpenedDisk } | null>(null);
const targetError = ref<string | null>(null);
const dirId = ref<string | null>(null);
const loading = ref(false);
const busy = ref(false);
const results = ref<DiskCopyResult[]>([]);

const files = computed(() => {
	const p = panel.value;
	if (p?.kind !== "copy") return [];
	return p.ids.flatMap((id) => analysis.value?.exportFile?.(id) ?? []) as DiskFileCopy[];
});

const dirs = computed(() => target.value?.opened.target?.dirs() ?? []);
const inDrive = computed(() => target.value !== null && inserted.value?.key === target.value.key);

const refreshLibrary = async () => {
	if (!vm.value) return;
	library.value = await listDisks(vm.value);
};

/** Reads the target disk; `keepDir`: stays in the directory picked (after a copy) */
const loadTarget = async (key: string | null, keepDir = false) => {
	target.value = null;
	targetError.value = null;
	if (!keepDir) results.value = [];
	const disk = library.value.find((d) => String(d.key) === key);
	if (!disk) return;
	if (disk.type === "url") {
		targetError.value = "A URL disk is fetched each time it's used: nothing to write to.";
		return;
	}
	loading.value = true;
	try {
		const { data } = await fetchDiskData(disk.key);
		if (targetKey.value !== key) return;
		const { disk: opened, error } = openWithFormats(data, disk);
		if (!opened) targetError.value = error;
		else if (!opened.target) targetError.value = opened.readOnlyReason ?? "Files can't be written to this disk";
		else target.value = { key: disk.key, bytes: data, opened };
		const list = opened?.target?.dirs() ?? [];
		if (!keepDir || !list.some((d) => d.id === dirId.value)) dirId.value = list[0]?.id ?? null;
	} catch (e) {
		targetError.value = (e as Error).message;
	} finally {
		loading.value = false;
	}
};

watch(targetKey, (key) => {
	lastTargetKey = key;
	loadTarget(key);
});

const copy = async () => {
	const t = target.value;
	if (!t?.opened.target || !dirId.value) return;
	busy.value = true;
	try {
		results.value = t.opened.target.addFiles(dirId.value, files.value);
		if (results.value.some((r) => r.to)) {
			const { bytes } = t;
			await updateDiskData(
				t.key,
				bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
			);
			await refreshDisk(t.key);
		}
		await loadTarget(String(t.key), true);
	} catch (e) {
		targetError.value = (e as Error).message;
	} finally {
		busy.value = false;
	}
};

const reinsert = async () => {
	if (vm.value && target.value) await insertFromLibrary(vm.value, target.value.key);
};

(async () => {
	await refreshLibrary();
	if (library.value.some((d) => String(d.key) === lastTargetKey)) targetKey.value = lastTargetKey;
})();
</script>
