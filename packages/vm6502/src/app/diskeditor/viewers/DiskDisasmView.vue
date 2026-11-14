<template>
	<div class="flex flex-col text-xs text-gray-400">
		<div class="flex flex-wrap items-center gap-3 px-3 py-1.5">
			<label class="flex items-center gap-1" title="The address the bytes are loaded at (hex)">
				Org $
				<input
					class="field w-14 font-mono"
					:value="toHex(org, 4)"
					@change="setOrg(($event.target as HTMLInputElement).value)"
				/>
			</label>
			<label
				class="flex items-center gap-1.5 cursor-pointer select-none"
				title="Labels of the system and the symbols"
			>
				<input
					type="checkbox"
					v-model="disasmLabels"
					class="rounded bg-gray-800 border-gray-600 text-cyan-500 focus:ring-cyan-500"
				/>
				Labels
			</label>
			<Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin text-cyan-400" />
			<span v-else class="text-gray-500">{{ lines.length.toLocaleString() }} lines</span>
		</div>

		<div ref="listRef" class="font-mono text-xs leading-5 select-text">
			<template v-for="line in visible" :key="line.addr">
				<div v-if="line.label" class="px-2 pt-1 text-amber-300">{{ line.label }}:</div>
				<div
					class="flex gap-3 px-2 whitespace-pre hover:bg-gray-800/60"
					:class="{ 'bg-cyan-900/60': flashed === line.addr }"
					:data-addr="line.addr"
				>
					<span class="text-gray-500 tabular-nums">{{ toHex(line.addr, 4) }}</span>
					<span class="w-[9ch] shrink-0 text-gray-500">{{ line.bytes }}</span>
					<span class="w-[4ch] shrink-0" :class="opcClass(line)">{{ line.opc }}</span>
					<button
						v-if="line.target !== undefined"
						class="text-cyan-400 hover:text-cyan-300 hover:underline"
						:title="`Go to $${toHex(line.target, 4)}`"
						@click="goTo(line.target)"
					>
						{{ line.opr }}
					</button>
					<span v-else :class="line.opc === '.DB' ? 'text-gray-500' : 'text-gray-200'">{{ line.opr }}</span>
				</div>
			</template>
		</div>
		<button
			v-if="shown < lines.length"
			class="self-start mx-2 my-1 px-2 py-0.5 text-cyan-400 hover:text-cyan-300 hover:bg-gray-800 rounded"
			@click="shown += MORE"
		>
			Show more ({{ (lines.length - shown).toLocaleString() }} lines left)
		</button>
	</div>
</template>

<script lang="ts" setup>
import { Loader2 } from "lucide-vue-next";
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import { type DiskDisasmLine, disassembleBytes } from "@/lib/disk/disasmBytes.utils";
import { toHex } from "@/lib/hex.utils";

/**
 * A viewer (`viewers.ts`). base: where the bytes load (a file's load address), the org to start with; skip: data
 * bytes before the code; raw: nothing to a disassembly
 */
const props = withDefaults(defineProps<{ bytes: Uint8Array; base?: number; skip?: number; raw?: boolean }>(), {
	base: 0,
	skip: 0,
	raw: false,
});
const { disasmLabels } = useDiskEditor();

/** Big files render a part at a time */
const FIRST = 1500;
const MORE = 5000;

const org = ref(props.base);
const shown = ref(FIRST);
const lines = shallowRef<DiskDisasmLine[]>([]);
const busy = ref(false);
const flashed = ref<number | null>(null);
const listRef = ref<HTMLElement | null>(null);

watch([() => props.bytes, () => props.base], () => {
	org.value = props.base;
	shown.value = FIRST;
});

let run = 0;
watch(
	[() => props.bytes, org, disasmLabels],
	async () => {
		const id = ++run;
		busy.value = true;
		const result = await disassembleBytes(props.bytes, org.value, {
			labels: disasmLabels.value,
			start: org.value + props.skip,
		});
		if (id !== run) return;
		lines.value = result;
		busy.value = false;
	},
	{ immediate: true },
);

const visible = computed(() => lines.value.slice(0, shown.value));

const setOrg = (text: string) => {
	const value = parseInt(text.trim().replace(/^\$/, ""), 16);
	if (!Number.isNaN(value)) org.value = Math.min(Math.max(value, 0), 0xffff);
};

const opcClass = (line: DiskDisasmLine) => {
	if (line.opc === "???") return "text-red-400/80";
	if (line.opc === ".DB") return "text-gray-500";
	return "text-cyan-300";
};

/** Scrolls to the line at `address` (shown if it wasn't yet), and flashes it */
const goTo = async (address: number) => {
	const index = lines.value.findIndex((l) => l.addr === address);
	if (index < 0) return;
	if (index >= shown.value) shown.value = index + FIRST;
	await nextTick();
	listRef.value?.querySelector(`[data-addr="${address}"]`)?.scrollIntoView({ block: "center" });
	flashed.value = address;
	setTimeout(() => {
		if (flashed.value === address) flashed.value = null;
	}, 1200);
};
</script>

<style scoped>
@reference "@/style.css";

.field {
	@apply bg-gray-950 border border-gray-700 rounded px-1 py-0 text-gray-200 focus:border-cyan-500 focus:outline-none;
}
</style>
