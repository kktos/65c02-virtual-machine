<template>
	<div class="grid grid-cols-[auto_1fr_auto] justify-between items-center mb-2 shrink-0 gap-4">
		<AddressNavigator name="disassembly" @goto="(addr) => $emit('gotoAddress', addr)" />

		<div class="flex space-x-2 mx-4" ref="toolbarRef">
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
		</div>

		<div class="flex space-x-2">
			<button
				ref="settingsBtnRef"
				@click="$emit('toggle-settings')"
				class="p-1 rounded text-gray-400 transition-colors hover:text-cyan-300 hover:bg-gray-700"
				title="Disassembly Options"
				:class="{ 'text-cyan-300 bg-gray-700': isSettingsOpen }"
			>
				<Settings2 class="h-4 w-4" />
			</button>

			<button
				@click="$emit('toggle-maximize')"
				:title="isMaximized ? 'Minimize View' : 'Maximize View'"
				class="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
			>
				<component :is="isMaximized ? Minimize : Maximize" class="w-4 h-4" />
			</button>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import AddressNavigator from "@/app/debugger/AddressNavigator.vue";
import { useFloatingWindows } from "@/composables/useFloatingWindows";
import { Binary, Lock, LockOpen, Maximize, Minimize, Settings2, Tags } from "lucide-vue-next";

const props = defineProps<{
	isFollowingPc: boolean;
	hasDisassembly: boolean;
	availableScopes: string[];
	isMaximized: Boolean;
	hasSelection: boolean;
	isSettingsOpen?: boolean;
}>();

const emit = defineEmits<{
	(e: "syncToPc"): void;
	(e: "gotoAddress", address: number): void;
	(e: "toggle-maximize"): void;
	(e: "toggle-settings"): void;
}>();

const { open: openWindow } = useFloatingWindows();

const settingsBtnRef = ref<HTMLElement | null>(null);
defineExpose({ settingsBtnRef });
</script>
