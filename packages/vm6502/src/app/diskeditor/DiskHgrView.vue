<template>
	<div class="flex flex-col items-start gap-2 px-3 py-2 text-xs text-gray-400">
		<div class="flex flex-wrap items-center gap-3">
			<div class="flex rounded border border-gray-700 overflow-hidden">
				<button
					v-for="m in MODES"
					:key="m.id"
					class="px-2 py-0.5 transition-colors"
					:class="hgrMode === m.id ? 'bg-cyan-900/50 text-cyan-200' : 'hover:text-cyan-300 hover:bg-gray-800'"
					:title="m.title"
					@click="hgrMode = m.id"
				>
					{{ m.label }}
				</button>
			</div>
			<label class="flex items-center gap-1" :title="WIDTH_TITLE">
				Width
				<input
					class="field w-12"
					type="number"
					min="1"
					max="40"
					:value="width"
					@change="setWidth(($event.target as HTMLInputElement).value)"
				/>
				bytes
			</label>
			<template v-if="isSprite">
				<label class="flex items-center gap-1" title="Bytes skipped before the first row (hex)">
					Skip $
					<input
						class="field w-12 font-mono"
						:value="toHex(skip, 2)"
						@change="setSkip(($event.target as HTMLInputElement).value)"
					/>
				</label>
				<div class="flex rounded border border-gray-700 overflow-hidden" title="Zoom">
					<button
						v-for="z in ZOOMS"
						:key="z"
						class="px-1.5 py-0.5 transition-colors"
						:class="zoom === z ? 'bg-cyan-900/50 text-cyan-200' : 'hover:text-cyan-300 hover:bg-gray-800'"
						@click="zoom = z"
					>
						×{{ z }}
					</button>
				</div>
				<span class="text-gray-500"
					>{{ sprite?.height.toLocaleString() }} rows of {{ sprite?.width }} dots</span
				>
				<button class="link" title="Back to the screen's 40 bytes" @click="width = SCREEN_COLUMNS">
					screen
				</button>
			</template>
			<span v-if="note" class="text-amber-400/90">{{ note }}</span>
		</div>

		<!-- Packed with $FE runs: unpacked as detected, or as set here -->
		<div v-if="hasMarker && !isSprite" class="flex flex-wrap items-center gap-2">
			<label class="flex items-center gap-1.5 cursor-pointer select-none" :title="RLE_TITLE">
				<input
					type="checkbox"
					:checked="unpacked"
					class="rounded bg-gray-800 border-gray-600 text-cyan-500 focus:ring-cyan-500"
					@change="unpack = ($event.target as HTMLInputElement).checked"
				/>
				Unpack RLE ($FE)
			</label>
			<template v-if="unpacked">
				<select
					class="field"
					:value="variant.order"
					title="The bytes after $FE"
					@change="setVariant({ order: ($event.target as HTMLSelectElement).value as RleOrder })"
				>
					<option value="valueCount">FE value count</option>
					<option value="countValue">FE count value</option>
				</select>
				<select
					class="field"
					:value="variant.layout"
					title="How the unpacked bytes fill the screen"
					@change="setVariant({ layout: ($event.target as HTMLSelectElement).value as RleLayout })"
				>
					<option value="columns">by columns</option>
					<option value="lines">by lines</option>
				</select>
				<input
					class="field w-12"
					type="number"
					min="1"
					max="192"
					:value="variant.lines"
					title="Lines of the picture: a column is this many bytes"
					@change="setVariant({ lines: Number(($event.target as HTMLInputElement).value) })"
				/>
				lines
				<span class="text-gray-500">
					{{ picture?.used.toLocaleString() }} of {{ bytes.length.toLocaleString() }} bytes{{
						override ? "" : detected ? ", detected" : ", not recognized"
					}}
				</span>
			</template>
		</div>

		<canvas
			v-if="isSprite"
			ref="canvas"
			:width="sprite?.width || 1"
			:height="sprite?.height || 1"
			class="hgr-sprite"
			:style="{ width: `${(sprite?.width ?? 0) * zoom}px`, height: `${(sprite?.height ?? 0) * zoom}px` }"
		/>
		<canvas v-else ref="canvas" :width="HGR_WIDTH" :height="HGR_HEIGHT" class="hgr-canvas" />
	</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import {
	HGR_HEIGHT,
	HGR_SIZE,
	HGR_VISIBLE_SIZE,
	HGR_WIDTH,
	type HgrMode,
	renderHgr,
	renderHgrRows,
} from "@/lib/disk/hgrImage";
import {
	detectHgrRle,
	RLE_MARKER,
	type RleLayout,
	type RleOrder,
	type RleVariant,
	unpackHgrRle,
} from "@/lib/disk/hgrRle";
import { toHex } from "@/lib/hex.utils";

/** sticky: the unpack settings stay when the bytes change (raw sectors stepped through), else back to detected */
const props = defineProps<{ bytes: Uint8Array; sticky?: boolean }>();
const { hgrMode } = useDiskEditor();

const MODES: { id: HgrMode; label: string; title: string }[] = [
	{ id: "color", label: "Color", title: "Colors of a color monitor (NTSC artifacts)" },
	{ id: "mono", label: "Mono", title: "Dots of a monochrome monitor" },
];
const RLE_TITLE =
	"Run-length packed: $FE starts a run (value and count), other bytes are copied. " +
	"Unpacked on its own when shorter than a screen and recognized";
const DEFAULT_VARIANT: RleVariant = { order: "valueCount", layout: "columns", lines: 192 };
const WIDTH_TITLE = "Bytes per row: 40 is the screen (its lines interleaved); less, sprites (rows one after the other)";
const SCREEN_COLUMNS = 40;
const ZOOMS = [1, 2, 4, 8];

const canvas = ref<HTMLCanvasElement | null>(null);

/** Unpack: null = as detected (a picture shorter than a screen that looks packed) */
const unpack = ref<boolean | null>(null);
/** The variant set by hand, else the one detected */
const override = shallowRef<RleVariant | null>(null);
/** Bytes per row: the screen's 40, or a sprite's width */
const width = ref(SCREEN_COLUMNS);
const skip = ref(0);
/** A sprite's dots are small: shown 4 times bigger to start with (the screen is shown twice as big) */
const zoom = ref(4);
watch(
	() => props.bytes,
	() => {
		if (props.sticky) return;
		unpack.value = null;
		override.value = null;
		width.value = SCREEN_COLUMNS;
		skip.value = 0;
	},
);

const isSprite = computed(() => width.value !== SCREEN_COLUMNS);
const setWidth = (text: string) => {
	const value = Math.round(Number(text));
	if (Number.isFinite(value)) width.value = Math.min(Math.max(value, 1), SCREEN_COLUMNS);
};
const setSkip = (text: string) => {
	const value = parseInt(text.trim().replace(/^\$/, ""), 16);
	if (!Number.isNaN(value)) skip.value = Math.min(Math.max(value, 0), Math.max(props.bytes.length - 1, 0));
};

/** Sprite rows */
const sprite = computed(() =>
	isSprite.value ? renderHgrRows(props.bytes, width.value, hgrMode.value, skip.value) : null,
);

const hasMarker = computed(() => props.bytes.includes(RLE_MARKER));
const detected = computed(() => (hasMarker.value ? detectHgrRle(props.bytes) : null));
const unpacked = computed(() => unpack.value ?? (detected.value !== null && props.bytes.length < HGR_VISIBLE_SIZE));
const variant = computed(() => override.value ?? detected.value?.variant ?? DEFAULT_VARIANT);

const setVariant = (change: Partial<RleVariant>) => {
	override.value = { ...variant.value, ...change };
};

const picture = computed(() => {
	if (!unpacked.value) return null;
	if (!override.value && detected.value) return detected.value;
	return unpackHgrRle(props.bytes, variant.value);
});

const note = computed(() => {
	if (picture.value || isSprite.value) return null;
	const n = props.bytes.length;
	if (n < HGR_VISIBLE_SIZE)
		return `${n.toLocaleString()} bytes ($${toHex(n, 4)}): less than a screen, the rest is black`;
	if (n > HGR_SIZE) return `The first $2000 bytes of ${n.toLocaleString()}`;
	return null;
});

const draw = async () => {
	await nextTick(); // the canvas sized (or swapped, screen / sprite) first
	const ctx = canvas.value?.getContext("2d");
	if (!ctx) return;
	if (sprite.value) {
		const { rgba, width, height } = sprite.value;
		if (height) ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
		return;
	}
	const page = picture.value?.page ?? props.bytes;
	ctx.putImageData(new ImageData(renderHgr(page, hgrMode.value), HGR_WIDTH, HGR_HEIGHT), 0, 0);
};

onMounted(draw);
watch([picture, sprite, () => props.bytes, hgrMode], draw);
</script>

<style scoped>
@reference "@/style.css";

/* A 280 x 192 picture shown as on the screen: lines doubled (560 x 384) */
.hgr-canvas {
	width: 560px;
	max-width: 100%;
	aspect-ratio: 560 / 384;
	image-rendering: pixelated;
	border: 1px solid var(--color-gray-700);
	background: black;
}
/* Sprite rows: a dot as wide as a line is high, as on the screen */
.hgr-sprite {
	max-width: none;
	image-rendering: pixelated;
	border: 1px solid var(--color-gray-700);
	background: black;
}
.link {
	@apply text-cyan-400 hover:text-cyan-300 hover:underline;
}
.field {
	@apply bg-gray-950 border border-gray-700 rounded px-1 py-0 text-gray-200 focus:border-cyan-500 focus:outline-none;
}
</style>
