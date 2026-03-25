<template>
	<transition
		enter-active-class="transition ease-out duration-300"
		enter-from-class="transform translate-y-full"
		enter-to-class="transform translate-y-0"
		leave-active-class="transition ease-in duration-200"
		leave-from-class="transform translate-y-0"
		leave-to-class="transform translate-y-full"
	>
		<aside
			v-if="isOpen"
			ref="panelRef"
			class="absolute bottom-0 left-0 right-0 z-20 max-h-[60%] bg-black/60 backdrop-blur-xs flex flex-col bg-[#0e0e0e] border-l border-[#2a2a2a] font-mono text-xs select-none"
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a] shrink-0">
				<div class="tracking-widest uppercase text-xs font-bold flex items-center gap-1">
					<Settings2 class="w-4 h-4" /> Settings
				</div>
				<button @click="$emit('close')" class="hover:text-[#4afa8a] transition-colors">
					<X class="w-4 h-4" />
				</button>
			</div>

			<div class="flex flex-col gap-0 pb-4 overflow-y-auto">
				<SettingsGroup label="Symbol Namespaces">
					<SettingRow v-for="[ns, isActive] in getNamespaceList()" :key="ns" :label="ns">
						<CheckBox :model-value="isActive" @update:model-value="toggleNamespace(ns)" />
					</SettingRow>
				</SettingsGroup>

				<SettingsGroup label="Data Formatting Groups">
					<SettingRow v-for="[group, isActive] in getFormattingGroups()" :key="group" :label="group">
						<CheckBox :model-value="isActive" @update:model-value="toggleFormattingGroup(group)" />
					</SettingRow>
				</SettingsGroup>

				<SettingsGroup label="Display">
					<SettingRow label="Highlight PC row">
						<CheckBox v-model="settings.disassembly.highlightPc" />
					</SettingRow>
					<SettingRow label="Lowercase Opcodes">
						<CheckBox v-model="settings.disassembly.lowercase" />
					</SettingRow>
					<SettingRow label="Branch arrows">
						<CheckBox v-model="branchArrows" />
					</SettingRow>
					<SettingRow label="Address width">
						<SegmentControl :options="[4, 6]" v-model="settings.disassembly.addressWidth" />
					</SettingRow>
				</SettingsGroup>

				<SettingsGroup label="Columns">
					<SettingRow label="Show Byte values">
						<CheckBox v-model="settings.disassembly.showBytes" />
					</SettingRow>
					<SettingRow label="show Info">
						<CheckBox v-model="settings.disassembly.showInfo" />
					</SettingRow>
					<SettingRow label="show Comments">
						<CheckBox v-model="settings.disassembly.showComments" />
					</SettingRow>
					<SettingRow label="show Cycle counts">
						<CheckBox v-model="settings.disassembly.showCycles" />
					</SettingRow>
				</SettingsGroup>

				<!--
				<SettingsGroup label="Symbols">
					<SettingRow label="Label mode">
						<SegmentControl :options="['off', 'sym', 'full']" v-model="labelMode" />
					</SettingRow>

					<SettingRow label="Symbol file">
						<input
							type="text"
							:value="symbolFile"
							placeholder="none"
							class="w-full bg-[#181818] border border-[#2a2a2a] rounded-none text-[#c0c0c0] placeholder-[#383838] px-1.5 py-0.5 text-[10px] font-mono focus:outline-none focus:border-[#4afa8a] focus:text-[#4afa8a] transition-colors"
						/>
					</SettingRow>
				</SettingsGroup> -->

				<SettingsGroup label="Syntax Colors">
					<ColorRow
						v-for="(_color, key) in settings.disassembly.syntax"
						:key="key"
						:label="key"
						v-model="settings.disassembly.syntax[key]"
					/>

					<!-- <ColorRow label="Address" v-model="colorAddress" />
					<ColorRow label="Mnemonic" v-model="colorMnemonic" />
					<ColorRow label="Operand" v-model="colorOperand" />
					<ColorRow label="Comment" v-model="colorComment" />
					<ColorRow label="PC row bg" v-model="colorPcBg" />
					<ColorRow label="Breakpoint" v-model="colorBreakpoint" /> -->
				</SettingsGroup>

				<SettingsGroup label="Scope Colors">
					<ColorRow
						v-for="scope in availableScopes"
						:key="scope"
						:label="scope"
						v-model="settings.disassembly.scopeColors[scope]"
					/>
				</SettingsGroup>

				<SettingsGroup label="A.I.">
					<SettingRow label="Gemini API Key">
						<template #info>
							<div class="flex gap-1" title="Stored in Local Storage">
								<CircleAlert class="w-4 h-4" />
							</div>
						</template>
						<input
							type="password"
							v-model="geminiApiKey"
							placeholder="none"
							class="w-full bg-[#181818] border border-[#2a2a2a] rounded-none text-[#c0c0c0] placeholder-[#383838] px-1.5 py-0.5 text-[10px] font-mono focus:outline-none focus:border-[#4afa8a] focus:text-[#4afa8a] transition-colors"
						/>
					</SettingRow>
					<SettingRow label="Gemini Model">
						<select
							id="geminiModel"
							v-model="geminiUrl"
							class="flex h-7 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-xs shadow-sm transition-colors focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
						>
							<option v-for="model in geminiModels" :key="model.url" :value="model.url">
								{{ model.name }}
							</option>
						</select>
					</SettingRow>
				</SettingsGroup>

				<!--
				<SettingsGroup label="Navigation">
					<SettingRow label="Follow PC">
						<CheckBox v-model="followPc" />
					</SettingRow>

					<SettingRow label="Auto-scroll">
						<CheckBox v-model="autoScroll" />
					</SettingRow>

					<SettingRow label="Lookahead rows">
						<input
							type="number"
							:value="lookahead"
							min="0"
							max="32"
							class="w-10 bg-[#181818] border border-[#2a2a2a] rounded-none text-[#4afa8a] text-[10px] font-mono text-right px-1 py-0.5 focus:outline-none focus:border-[#4afa8a] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
						/>
					</SettingRow>
				</SettingsGroup> -->
			</div>

			<!-- Footer: reset -->
			<div class="mt-auto shrink-0 border-t border-[#2a2a2a] px-3 py-2">
				<button
					class="w-full text-xs uppercase tracking-widest text-[#383838] hover:text-[#ff5f5f] transition-colors text-left"
				>
					↺ Reset to defaults
				</button>
			</div>
		</aside>
	</transition>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import CheckBox from "./CheckBox.vue";
import ColorRow from "./ColorRow.vue";
import SegmentControl from "./SegmentControl.vue";
import SettingsGroup from "./SettingsGroup.vue";
import SettingRow from "./SettingRow.vue";
import { Settings2, X, CircleAlert } from "lucide-vue-next";
import { useSettings } from "@/composables/useSettings";
import { useGemini } from "@/composables/useGemini";
import { onClickOutside } from "@vueuse/core";
import { useFormatting } from "@/composables/useDataFormattings";
import { useSymbols } from "@/composables/useSymbols";

const props = defineProps<{
	isOpen: boolean;
	availableScopes: string[];
	ignoreRef?: HTMLElement | null;
}>();

const emit = defineEmits<{
	(e: "close"): void;
}>();

const { settings } = useSettings();
const { geminiModels } = useGemini();
const { getFormattingGroups, toggleFormattingGroup } = useFormatting();
const { getNamespaceList, toggleNamespace } = useSymbols();

const panelRef = ref<HTMLElement | null>(null);
onClickOutside(panelRef, () => emit("close"));

const geminiApiKey = computed({
	get: () => settings.disassembly.gemini.apiKey,
	set: (val: string) => {
		settings.disassembly.gemini.apiKey = val;
	},
});
const geminiUrl = computed({
	get: () => settings.disassembly.gemini.url,
	set: (val: string) => {
		settings.disassembly.gemini.url = val;
	},
});

const branchArrows = ref(true);
// const colorComment = ref("#4afa8a");
// const colorPcBg = ref("#4afa8a");
// const colorBreakpoint = ref("#4afa8a");
// const rowDensity = ref("S");
// const labelMode = ref("off");
// const symbolFile = ref("none");
// const followPc = ref(true);
// const autoScroll = ref(true);
// const lookahead = ref(0);
</script>
