<template>
	<div class="flex items-center gap-1 shrink-0 bg-gray-800 border-b border-gray-700">
		<AddressNavigator name="disassembly" @goto="(addr) => $emit('gotoAddress', addr)" />

		<div class="flex items-center">
			<button
				@click="$emit('syncToPc')"
				:class="[
					'p-1 rounded transition-colors',
					isFollowingPc
						? 'text-cyan-400 bg-cyan-400/10'
						: 'text-gray-500 hover:text-gray-300 hover:bg-gray-700',
				]"
				title="Sync with PC"
			>
				<div class="text-xs flex">
					<LockOpen class="h-4 w-4" v-if="!isFollowingPc" /><Lock v-if="isFollowingPc" class="h-4 w-4" />PC
				</div>
			</button>
			<button
				@click="openWindow('symbol_manager')"
				title="Symbol Manager"
				class="p-1 rounded text-gray-500 transition-colors hover:text-gray-300 hover:bg-gray-700"
			>
				<Tags class="h-4 w-4" />
			</button>
			<button
				@click="openWindow('formatting_manager')"
				title="Formatting Manager"
				class="p-1 rounded text-gray-500 transition-colors hover:text-gray-300 hover:bg-gray-700"
			>
				<Binary class="h-4 w-4" />
			</button>
			<button
				ref="settingsBtnRef"
				@click="$emit('toggle-settings')"
				class="p-1 rounded text-gray-400 transition-colors hover:text-cyan-300 hover:bg-gray-700"
				title="Disassembly Options"
				:class="{ 'text-cyan-300 bg-gray-700': isSettingsOpen }"
			>
				<Settings2 class="h-4 w-4" />
			</button>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import AddressNavigator from "@/app/debugger/AddressNavigator.vue";
import { useFloatingWindows } from "@/composables/useFloatingWindows";
import { Binary, Lock, LockOpen, Settings2, Tags } from "lucide-vue-next";

const props = defineProps<{
	isFollowingPc: boolean;
	hasDisassembly: boolean;
	availableScopes: string[];
	hasSelection: boolean;
	isSettingsOpen?: boolean;
}>();

const emit = defineEmits<{
	(e: "syncToPc"): void;
	(e: "gotoAddress", address: number): void;
	(e: "toggle-settings"): void;
}>();

const { open: openWindow } = useFloatingWindows();

const settingsBtnRef = ref<HTMLElement | null>(null);
defineExpose({ settingsBtnRef });
</script>
