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
			<span v-if="note" class="text-amber-400/90">{{ note }}</span>
		</div>
		<canvas ref="canvas" :width="HGR_WIDTH" :height="HGR_HEIGHT" class="hgr-canvas" />
	</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from "vue";
import { useDiskEditor } from "@/composables/useDiskEditor";
import { HGR_HEIGHT, HGR_SIZE, HGR_VISIBLE_SIZE, HGR_WIDTH, type HgrMode, renderHgr } from "@/lib/disk/hgrImage";
import { toHex } from "@/lib/hex.utils";

const props = defineProps<{ bytes: Uint8Array }>();
const { hgrMode } = useDiskEditor();

const MODES: { id: HgrMode; label: string; title: string }[] = [
	{ id: "color", label: "Color", title: "Colors of a color monitor (NTSC artifacts)" },
	{ id: "mono", label: "Mono", title: "Dots of a monochrome monitor" },
];

const canvas = ref<HTMLCanvasElement | null>(null);

const note = computed(() => {
	const n = props.bytes.length;
	if (n < HGR_VISIBLE_SIZE)
		return `${n.toLocaleString()} bytes ($${toHex(n, 4)}): less than a screen, the rest is black`;
	if (n > HGR_SIZE) return `The first $2000 bytes of ${n.toLocaleString()}`;
	return null;
});

const draw = () => {
	const ctx = canvas.value?.getContext("2d");
	if (!ctx) return;
	ctx.putImageData(new ImageData(renderHgr(props.bytes, hgrMode.value), HGR_WIDTH, HGR_HEIGHT), 0, 0);
};

onMounted(draw);
watch([() => props.bytes, hgrMode], draw);
</script>

<style scoped>
/* A 280 x 192 picture shown as on the screen: lines doubled (560 x 384) */
.hgr-canvas {
	width: 560px;
	max-width: 100%;
	aspect-ratio: 560 / 384;
	image-rendering: pixelated;
	border: 1px solid var(--color-gray-700);
	background: black;
}
</style>
