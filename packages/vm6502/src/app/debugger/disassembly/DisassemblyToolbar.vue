<template>
	<div class="flex justify-between items-center mb-2 shrink-0 gap-4">
		<!-- History Navigation -->
		<ButtonGroup>
			<Button @click="navigateBack" :disabled="!canNavigateBack" size="sm" class="px-2 hover:bg-gray-600 disabled:opacity-50" title="Go back in jump history">
				<ArrowLeft class="w-4 h-4" />
			</Button>
			<Button @click="navigateForward" :disabled="!canNavigateForward" size="sm" class="px-2 hover:bg-gray-600 disabled:opacity-50" title="Go forward in jump history">
				<ArrowRight class="w-4 h-4" />
			</Button>
		</ButtonGroup>

		<div class="flex items-center space-x-2 mx-4">
			<div class="relative group">
				<span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-mono">$</span>
				<input
					v-model="gotoAddressInput"
					@keydown.enter="onGotoAddress"
					type="text"
					class="w-35 bg-gray-900 text-gray-200 text-xs font-mono rounded px-2 pl-4 py-1 border border-gray-700 focus:border-cyan-500 focus:outline-none transition-all focus:w-40"
					placeholder="addr or symbol"
					title="Enter address (hex) or symbol"
				/>
			</div>
			<button
				@click="$emit('syncToPc')"
				:class="['p-1 rounded transition-colors', isFollowingPc ? 'text-cyan-400 bg-cyan-400/10' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700']"
				title="Sync with PC"
			>
				<Paperclip class="h-4 w-4"/>
			</button>
		</div>

		<div class="flex items-center space-x-2">
			<button
				@click="$emit('explain')"
				:disabled="isLoading || !hasDisassembly"
				class="text-xs px-3 py-1 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition duration-150 shadow-md flex items-center disabled:opacity-50"
			>
				{{ isLoading ? 'Analyzing...' : '✨' }}
			</button>

			<Popover>
				<PopoverTrigger as-child>
					<Button variant="ghost" size="icon" class="h-6 w-6 text-gray-400 hover:text-cyan-300" title="Disassembly Options">
						<Settings2 class="h-4 w-4" />
					</Button>
				</PopoverTrigger>
				<PopoverContent class="w-60 bg-gray-800 border-gray-700 text-gray-200">
					<div class="grid gap-4">
						<span class="text-sm font-bold text-gray-200 capitalize">Disasm Settings</span>
						<div class="grid gap-2 -mb-2">
							<div class="flex items-center space-x-2">
								<Checkbox id="showCycles" v-model="settings.disassembly.showCycles" />
								<label for="showCycles" class="text-xs font-medium leading-none cursor-pointer select-none"> Show Cycles </label>
							</div>
						</div>
						<div class="border-t border-gray-700 -mx-4 my-1"></div>
						<div class="grid gap-2 max-h-48 overflow-y-auto pr-2 -mr-3">
							<div v-for="scope in availableScopes" :key="scope" class="flex gap-2 items-center">
								<input
									type="color"
									:id="`scope-color-${scope}`"
									v-model="settings.disassembly.scopeColors[scope]"
									class="w-5 h-5 p-0 border-none rounded bg-transparent cursor-pointer"
								/>
								<label :for="`scope-color-${scope}`" class="text-xs font-medium">{{ scope }}</label>
							</div>
						</div>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { ArrowLeft, ArrowRight, Paperclip, Settings2 } from "lucide-vue-next";
import { computed, ref } from "vue";
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useSettings } from "@/composables/useSettings";
import { useSymbols } from "@/composables/useSymbols";

	const props = defineProps<{
		isFollowingPc: boolean;
		isLoading: boolean;
		hasDisassembly: boolean;
		availableScopes: string[];
	}>();

	const emit = defineEmits<{
		(e: 'syncToPc'): void;
		(e: 'explain'): void;
		(e: 'gotoAddress', address: number): void;
	}>();

	const { getAddressForSymbol } = useSymbols();
	const { historyIndex, jumpHistory, navigateHistory } = useDebuggerNav();
	const { settings } = useSettings();
	const gotoAddressInput = ref("");

	const canNavigateBack = computed(() => historyIndex.value > 0);
	const canNavigateForward = computed(() => historyIndex.value < jumpHistory.value.length - 1);
	const navigateBack = () => navigateHistory('back');
	const navigateForward = () => navigateHistory('forward');

	const onGotoAddress = () => {
		const val = gotoAddressInput.value.trim();
		if (!val) return;

		let addr= getAddressForSymbol(val);
		if(addr === undefined) {
			const hexVal = val.replace(/^\$/, '').replace(/^0x/i, '');
			addr = parseInt(hexVal, 16);
		}
		if (!Number.isNaN(addr)) {
			emit('gotoAddress', addr);
			gotoAddressInput.value = "";
		}
	};
</script>
