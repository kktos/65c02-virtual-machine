<template>
	<button
		@click="toggleWindow"
		class="toolbar-btn group"
		:class="{ 'bg-gray-700 ring-1 ring-cyan-500/50': machineStateWindow?.isOpen }"
		title="Machine State"
	>
		<CircuitBoard class="h-4 w-4 text-cyan-400 group-hover:text-cyan-300" />
	</button>

	<FloatingWindow
		ref="machineStateWindow"
		id="machine_state"
		title="Machine State"
		:options="{
			defaultWidth: 600,
			defaultHeight: 400,
			minWidth: 220,
			minHeight: 150,
			contentScrollable: false,
		}"
	>
		<template #icon>
			<CircuitBoard class="h-4 w-4" />
		</template>
		<!-- Content is unmounted while the window is closed, which also detaches vm.onStateChange -->
		<MachineStateView class="h-full" />
	</FloatingWindow>
</template>

<script lang="ts" setup>
import { CircuitBoard } from "lucide-vue-next";
import { ref } from "vue";
import FloatingWindow from "@/components/FloatingWindow.vue";
import MachineStateView from "./MachineStateView.vue";

const machineStateWindow = ref<InstanceType<typeof FloatingWindow> | null>(null);

const toggleWindow = () => {
	machineStateWindow.value?.toggle();
};
</script>
