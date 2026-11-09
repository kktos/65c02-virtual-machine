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
		</PopoverContent>
	</Popover>
</template>

<script setup lang="ts">
import { Check, LayoutDashboard, PanelBottom, PanelLeft } from "lucide-vue-next";
import { computed, ref } from "vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type LayoutMode, useAppLayout } from "@/composables/useAppLayout";

const OPTIONS = [
	{
		mode: "auto",
		label: "Auto",
		icon: LayoutDashboard,
		hint: "Code takes the whole width when the video fits in the top row",
	},
	{ mode: "column", label: "Video full height", icon: PanelLeft, hint: "The video column spans the whole height" },
	{ mode: "top", label: "Code full width", icon: PanelBottom, hint: "Disassembly / memory span the whole width" },
] as const;

const { mode, kind, setMode } = useAppLayout();
const open = ref(false);

const current = computed(() => OPTIONS.find((option) => option.mode === mode.value) ?? OPTIONS[0]);

const pick = (value: LayoutMode) => {
	setMode(value);
	open.value = false;
};
</script>
