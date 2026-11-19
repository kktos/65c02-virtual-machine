<template>
	<Popover v-model:open="open">
		<PopoverTrigger as-child>
			<button class="toolbar-btn" :title="`Layout: ${current.label}`">
				<component :is="current.icon" class="h-4 w-4" />
			</button>
		</PopoverTrigger>
		<PopoverContent class="w-64 p-1 bg-gray-800 border-gray-700 text-gray-100" align="end" :side-offset="8">
			<button
				v-for="option in OPTIONS"
				:key="option.mode"
				class="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-700"
				:class="mode === option.mode ? 'text-cyan-300' : 'text-gray-300'"
				@click="pick(option.mode)"
			>
				<component :is="option.icon" class="mt-0.5 h-4 w-4 shrink-0" />
				<span class="flex flex-col gap-0.5">
					<span class="font-medium">
						{{ option.label }}
						<span v-if="option.mode === 'auto' && mode === 'auto'" class="font-normal text-gray-400">
							({{ kind === "top" ? "code full width" : "video full height" }})
						</span>
					</span>
					<span class="text-[11px] text-gray-400">{{ option.hint }}</span>
				</span>
				<Check v-if="mode === option.mode" class="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0" />
			</button>

			<div v-if="mode === 'floating'" class="mt-1 flex flex-col gap-1.5 border-t border-gray-700 px-2 pb-1 pt-2">
				<label class="flex items-center gap-2 text-xs text-gray-300">
					<span class="shrink-0">Opacity</span>
					<input
						type="range"
						class="min-w-0 flex-1 accent-cyan-500"
						:min="MIN_PANEL_OPACITY * 100"
						max="100"
						step="5"
						:value="Math.round(opacity * 100)"
						title="The floating panels' opacity"
						@input="setOpacity(Number(($event.target as HTMLInputElement).value) / 100)"
					/>
					<span class="w-8 text-right tabular-nums text-gray-400">{{ Math.round(opacity * 100) }}%</span>
				</label>
				<button
					class="flex items-center gap-2 rounded px-1 py-1 text-left text-xs text-gray-300 hover:bg-gray-700"
					@click="resetPanels"
				>
					<RotateCcw class="h-3.5 w-3.5" />
					Reset the panels (all open, back in place)
				</button>
			</div>
		</PopoverContent>
	</Popover>
</template>

<script setup lang="ts">
import { Check, LayoutDashboard, PanelBottom, PanelLeft, PictureInPicture2, RotateCcw } from "lucide-vue-next";
import { computed, ref } from "vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type LayoutMode, MIN_PANEL_OPACITY, useAppLayout } from "@/composables/useAppLayout";

const OPTIONS = [
	{
		mode: "auto",
		label: "Auto",
		icon: LayoutDashboard,
		hint: "Code takes the whole width when the video fits in the top row",
	},
	{ mode: "column", label: "Video full height", icon: PanelLeft, hint: "The video column spans the whole height" },
	{ mode: "top", label: "Code full width", icon: PanelBottom, hint: "Disassembly / memory span the whole width" },
	{
		mode: "floating",
		label: "Floating panels",
		icon: PictureInPicture2,
		hint: "The video fills the window, the debugger panels float over it",
	},
] as const;

const { mode, kind, opacity, setMode, setOpacity, resetPanels } = useAppLayout();
const open = ref(false);

const current = computed(() => OPTIONS.find((option) => option.mode === mode.value) ?? OPTIONS[0]);

const pick = (value: LayoutMode) => {
	setMode(value);
	open.value = false;
};
</script>
