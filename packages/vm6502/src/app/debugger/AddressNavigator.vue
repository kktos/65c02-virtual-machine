<template>
	<div
		class="flex items-center flex-1 h-8 bg-gray-900 rounded-md border border-gray-700 shadow-sm focus-within:ring-1 focus-within:ring-cyan-500 focus-within:border-cyan-500 transition-all"
	>
		<!-- Navigation Buttons -->
		<div class="flex items-center gap-0.5 px-1 border-r border-gray-700 bg-gray-800/30 h-full rounded-l-md">
			<Button
				@click="navigateBack()"
				:disabled="!canNavigateBack"
				variant="ghost"
				size="icon"
				class="h-6 w-6 text-gray-400 hover:text-cyan-300 hover:bg-gray-700/50 disabled:opacity-30"
				title="Go back"
			>
				<ArrowLeft class="w-3.5 h-3.5" />
			</Button>
			<Button
				@click="navigateForward()"
				:disabled="!canNavigateForward"
				variant="ghost"
				size="icon"
				class="h-6 w-6 text-gray-400 hover:text-cyan-300 hover:bg-gray-700/50 disabled:opacity-30"
				title="Go forward"
			>
				<ArrowRight class="w-3.5 h-3.5" />
			</Button>

			<!-- History Dropdown -->
			<Popover v-model:open="isHistoryOpen">
				<PopoverTrigger as-child>
					<Button
						variant="ghost"
						size="icon"
						class="h-6 w-6 text-gray-400 hover:text-cyan-300 hover:bg-gray-700/50 disabled:opacity-30"
						title="Jump History"
						:disabled="jumpHistory.length === 0"
					>
						<History class="w-3.5 h-3.5" />
					</Button>
				</PopoverTrigger>
				<PopoverContent class="w-56 p-0 bg-gray-800 border-gray-700 max-h-80 overflow-y-auto" align="start">
					<div class="p-2 border-b border-gray-700">
						<button
							@click="handleClearHistory"
							class="w-full flex justify-end gap-2 text-xs text-gray-300 hover:text-red-400 transition-colors rounded-sm px-2 py-1 -m-1"
							title="Clear History"
						>
							<Trash2 class="w-3.5 h-3.5" />
						</button>
					</div>
					<div v-if="jumpHistory.length > 0" class="flex flex-col py-1">
						<button
							v-for="(addr, index) in jumpHistory"
							:key="index"
							@click="handleHistoryJump(index)"
							class="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-700 w-full text-left transition-colors"
							:class="index === historyIndex ? 'bg-cyan-900/30 text-cyan-300' : 'text-gray-300'"
						>
							<div class="w-3 flex justify-center shrink-0">
								<span v-if="index === historyIndex" class="text-[10px]">●</span>
							</div>
							<span class="font-mono text-gray-400">$</span>
							<span class="font-mono font-medium">{{ addr.toString(16).toUpperCase().padStart(4, "0") }}</span>
							<span class="text-gray-500 truncate ml-auto max-w-[80px]">{{ getLabelForAddress(addr) }}</span>
						</button>
					</div>
					<div v-else class="text-center text-xs text-gray-500 py-4">History is empty.</div>
				</PopoverContent>
			</Popover>
		</div>

		<!-- Address Input -->
		<div class="flex-1 flex items-center relative h-full">
			<div class="ml-2 pointer-events-none text-gray-500">
				<SearchIcon class="w-3.5 h-3.5" />
			</div>
			<input
				v-model="inputValue"
				@keydown.enter="handleGoto"
				@keydown.down.prevent="selectNextSuggestion"
				@keydown.up.prevent="selectPrevSuggestion"
				@keydown.esc="closeSuggestions"
				@input="handleInput"
				@focus="handleInput"
				@blur="handleBlur"
				type="text"
				class="w-full h-full bg-transparent text-gray-200 text-xs font-mono px-3 focus:outline-none placeholder:text-gray-600"
				placeholder="addr or symbol"
				title="Enter address (hex) or symbol"
				autocomplete="off"
			/>

			<!-- Suggestions Dropdown -->
			<div
				v-if="showSuggestions && suggestions.length"
				class="absolute top-full left-0 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto"
			>
				<button
					v-for="(suggestion, index) in suggestions"
					:key="suggestion.label + suggestion.address"
					@mousedown.prevent="selectSuggestion(suggestion)"
					class="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 flex gap-1 justify-between items-center group transition-colors"
					:class="index === selectedSuggestionIndex ? 'bg-gray-700 text-cyan-300' : 'text-gray-300'"
				>
					<span class="font-mono truncate">{{ suggestion.label }}</span>
					<div class="flex justify-end items-baseline gap-2 min-w-0 flex-1">
						<span
							v-if="suggestion.scope"
							class="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-gray-700/50 border border-gray-600/50 shrink-0"
							>{{ suggestion.scope }}</span
						>
						<span class="text-gray-500 text-[10px] font-mono shrink-0 group-hover:text-gray-400"
							>${{ suggestion.address.toString(16).toUpperCase().padStart(4, "0") }}</span
						>
					</div>
				</button>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { ArrowLeft, ArrowRight, History, SearchIcon, Trash2 } from "lucide-vue-next";
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useSymbols } from "@/composables/useSymbols";

const emit = defineEmits<(e: "goto", address: number) => void>();

const { getAddressForLabel, getLabelForAddress, findSymbols } = useSymbols();
const inputValue = ref("");
const isHistoryOpen = ref(false);
const suggestions = ref<{ label: string; address: number; scope?: string }[]>([]);
const showSuggestions = ref(false);
const selectedSuggestionIndex = ref(-1);

const { historyIndex, jumpHistory, addJumpHistory, navigateHistory, jumpToHistoryIndex, clearHistory } = useDebuggerNav();

const canNavigateBack = computed(() => historyIndex.value > 0);
const canNavigateForward = computed(() => historyIndex.value < jumpHistory.value.length - 1);
const navigateBack = () => navigateHistory("back");
const navigateForward = () => navigateHistory("forward");

const handleHistoryJump = (index: number) => {
	jumpToHistoryIndex(index);
	isHistoryOpen.value = false;
};

const handleClearHistory = () => {
	clearHistory();
	isHistoryOpen.value = false;
};

const handleInput = () => {
	if (!inputValue.value.trim()) {
		suggestions.value = [];
		showSuggestions.value = false;
		return;
	}
	suggestions.value = findSymbols(inputValue.value);
	showSuggestions.value = suggestions.value.length > 0;
	selectedSuggestionIndex.value = -1;
};

const closeSuggestions = () => {
	showSuggestions.value = false;
	selectedSuggestionIndex.value = -1;
};

const handleBlur = () => {
	setTimeout(() => {
		closeSuggestions();
	}, 150);
};

const selectNextSuggestion = () => {
	if (!showSuggestions.value || suggestions.value.length === 0) return;
	selectedSuggestionIndex.value = (selectedSuggestionIndex.value + 1) % suggestions.value.length;
};

const selectPrevSuggestion = () => {
	if (!showSuggestions.value || suggestions.value.length === 0) return;
	if (selectedSuggestionIndex.value === -1) selectedSuggestionIndex.value = suggestions.value.length - 1;
	else selectedSuggestionIndex.value = (selectedSuggestionIndex.value - 1 + suggestions.value.length) % suggestions.value.length;
};

const selectSuggestion = (suggestion: { label: string; address: number }) => {
	inputValue.value = suggestion.label;
	addJumpHistory(suggestion.address);
	emit("goto", suggestion.address);
	closeSuggestions();
};

const handleGoto = () => {
	if (showSuggestions.value && selectedSuggestionIndex.value !== -1) {
		selectSuggestion(suggestions.value[selectedSuggestionIndex.value]);
		return;
	}

	const val = inputValue.value.trim();
	if (!val) return;

	let addr = getAddressForLabel(val);
	if (addr === undefined) {
		const hexVal = val.replace(/^\$/, "").replace(/^0x/i, "");
		addr = parseInt(hexVal, 16);
	}

	if (!Number.isNaN(addr)) {
		addJumpHistory(addr);
		emit("goto", addr);
		inputValue.value = "";
		closeSuggestions();
	}
};
</script>
