<template>
	<template v-if="hasImu">
		<button
			@click="toggleWindow"
			class="toolbar-btn group"
			:class="{ 'bg-gray-700 ring-1 ring-cyan-500/50': interruptsWindow?.isOpen }"
			title="Interrupts (IMU)"
		>
			<Zap class="h-4 w-4 text-cyan-400 group-hover:text-cyan-300" />
		</button>

		<FloatingWindow
			ref="interruptsWindow"
			id="interrupts"
			title="Interrupts (IMU)"
			:options="{
				defaultWidth: 560,
				defaultHeight: 380,
				minWidth: 320,
				minHeight: 150,
				contentScrollable: false,
			}"
		>
			<template #icon>
				<Zap class="h-4 w-4" />
			</template>
			<!-- Content is unmounted while the window is closed, which also stops its polling -->
			<InterruptsView class="h-full" />
		</FloatingWindow>
	</template>
</template>

<script lang="ts" setup>
import { Zap } from "lucide-vue-next";
import { inject, type Ref, ref, watch } from "vue";
import FloatingWindow from "@/components/FloatingWindow.vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import InterruptsView from "./InterruptsView.vue";

const vm = inject<Ref<VirtualMachine>>("vm");
const interruptsWindow = ref<InstanceType<typeof FloatingWindow> | null>(null);
// Only for the machines with an IMU
const hasImu = ref(false);

watch(
	() => vm?.value,
	async (newVm) => {
		hasImu.value = false;
		if (!newVm) return;
		await newVm.ready;
		hasImu.value = (await newVm.getInterrupts()) !== null;
	},
	{ immediate: true },
);

const toggleWindow = () => {
	interruptsWindow.value?.toggle();
};
</script>
