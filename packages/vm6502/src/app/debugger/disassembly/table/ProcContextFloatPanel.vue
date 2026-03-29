<template>
	<FloatPanel v-if="info && settings.disassembly.showContextBadge" :initial-pos="pos">
		<template #default="{ isDragging }">
			<div
				class="px-2 py-0.5 bg-gray-700/90 border-l-4 text-[0.68rem] shadow-2xl backdrop-blur-md flex items-center gap-2 active:opacity-80"
				:class="{ 'transition-all duration-300': !isDragging }"
				:style="{ borderColor: info.scopeColor }"
				title="Drag to move badge"
			>
				<span :style="{ color: settings.disassembly.syntax.label }" class="font-bold tracking-tight">
					{{ info.name }}
				</span>
			</div>
		</template>
	</FloatPanel>
</template>

<script setup lang="ts">
import { computed, inject, type Ref } from "vue";
import { useSettings } from "@/composables/useSettings";
import { useSymbols } from "@/composables/useSymbols";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import FloatPanel from "./FloatPanel.vue";

const props = defineProps<{
	addr: number;
	pos: {
		right: string;
		top: string;
	};
}>();

const vm = inject<Ref<VirtualMachine>>("vm");
const { settings } = useSettings();
const { getLabelAtOrBefore } = useSymbols();

const getScopeColor = (addr: number) => {
	const scope = vm?.value?.getScope(addr & 0xffff);
	if (!scope) return "";
	const color = settings.disassembly.scopeColors[scope];
	if (!color || color === "#000000" || color === "#00000000") return "";
	return color;
};

const info = computed(() => {
	const name = getLabelAtOrBefore(props.addr);
	if (!name) return null;
	return {
		name,
		scopeColor: getScopeColor(props.addr),
	};
});
</script>
