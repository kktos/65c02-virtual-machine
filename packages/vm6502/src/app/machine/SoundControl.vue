<template>
	<button @click="toggleSound" class="toolbar-btn group" :title="isEnabled ? 'Mute Sound' : 'Enable Sound'">
		<Volume2 v-if="isEnabled" class="h-4 w-4 text-green-400 group-hover:text-green-300" />
		<VolumeX v-else class="h-4 w-4 text-red-400 group-hover:text-red-300" />
	</button>
</template>

<script lang="ts" setup>
import { Volume2, VolumeX } from "lucide-vue-next";
import { inject, onMounted, type Ref, ref, watch } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");
const isEnabled = ref(true);
const STORAGE_KEY = "vm6502_sound_enabled";

const toggleSound = () => {
	isEnabled.value = !isEnabled.value;
	localStorage.setItem(STORAGE_KEY, String(isEnabled.value));
	applySoundState();
};

const applySoundState = () => {
	if (vm?.value) {
		vm.value.mute(isEnabled.value);
	}
};

onMounted(() => {
	const saved = localStorage.getItem(STORAGE_KEY);
	if (saved !== null) isEnabled.value = saved === "true";
});

watch(
	() => vm?.value,
	(newVm) => {
		if (newVm) newVm.ready.then(applySoundState);
	},
	{ immediate: true },
);
</script>
