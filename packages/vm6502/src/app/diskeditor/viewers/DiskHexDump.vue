<template>
	<div class="font-mono text-xs leading-5 select-text">
		<div v-for="line in lines" :key="line.offset" class="flex gap-3 px-2 hover:bg-gray-800/60 whitespace-pre">
			<span class="text-gray-500 tabular-nums">{{ line.label }}</span>
			<!-- 16 bytes, an extra space after the 8th; fixed width so a short last line keeps the ASCII aligned -->
			<span class="tabular-nums inline-block w-[48ch]">
				<span
					v-for="(b, i) in line.bytes"
					:key="i"
					:class="[
						b === 0 ? 'text-gray-600' : 'text-gray-200',
						i === 7 ? 'mr-[2ch]' : i < 15 ? 'mr-[1ch]' : '',
					]"
					:title="byteTitle(line.offset + i, b)"
					>{{ toHex(b) }}</span
				>
			</span>
			<span class="border-l border-gray-700 pl-3">
				<span v-for="(b, i) in line.bytes" :key="i" :class="charClass(b)">{{ textChar(b) }}</span>
			</span>
		</div>
		<button
			v-if="shown < bytes.length"
			class="mx-2 my-1 px-2 py-0.5 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-gray-800 rounded"
			@click="shown += MORE"
		>
			Show more ({{ (bytes.length - shown).toLocaleString() }} bytes left)
		</button>
	</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import { petsciiChar } from "@/lib/disk/formats/cbm/d64";
import { appleChar } from "@/lib/disk/formats/apple2/diskImage";
import { toHex } from "@/lib/hex.utils";

/** A viewer (`viewers.ts`). raw: offsets in the sector / block, whatever its base (the boot code's $0800) */
const props = withDefaults(defineProps<{ bytes: Uint8Array; base?: number; skip?: number; raw?: boolean }>(), {
	base: 0,
	skip: 0,
	raw: false,
});
const { analysis } = useDiskEditor();
const base = computed(() => (props.raw ? 0 : props.base));
const petscii = computed(() => analysis.value?.charset === "petscii");

/** Big files render a part at a time */
const FIRST = 4096;
const MORE = 16384;
const shown = ref(FIRST);
watch(
	() => props.bytes,
	() => {
		shown.value = FIRST;
	},
);

/** Offsets in a sector / block as short as they go; addresses (bytes loaded somewhere) on 4 digits at least */
const width = computed(() => Math.max(base.value ? 4 : 2, (base.value + props.bytes.length - 1).toString(16).length));

const lines = computed(() => {
	const out: { offset: number; label: string; bytes: number[] }[] = [];
	const end = Math.min(props.bytes.length, shown.value);
	for (let i = 0; i < end; i += 16)
		out.push({
			offset: i,
			label: toHex(base.value + i, width.value),
			bytes: Array.from(props.bytes.subarray(i, Math.min(i + 16, props.bytes.length))),
		});
	return out;
});

const byteTitle = (offset: number, b: number) => `$${toHex(base.value + offset, width.value)}: $${toHex(b)} (${b})`;

const textChar = (b: number) => (petscii.value ? petsciiChar(b) : appleChar(b));

/**
 * Apple: high-bit ASCII is the normal text, low-bit printable characters (inverse / flash) stand out.
 * PETSCII: what reads as text, the rest (controls, graphics) dimmed.
 */
const charClass = (b: number) => {
	if (petscii.value) return petsciiChar(b) === "." && b !== 0x2e ? "text-gray-600" : "text-green-300";
	const c = b & 0x7f;
	if (c < 0x20 || c === 0x7f) return "text-gray-600";
	return b & 0x80 ? "text-green-300" : "text-amber-300/80";
};
</script>
