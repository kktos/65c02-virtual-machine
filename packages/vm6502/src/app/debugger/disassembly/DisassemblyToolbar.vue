<template>
	<div class="flex justify-between items-center mb-2 shrink-0 gap-4">
		<AddressNavigator @goto="(addr) => $emit('gotoAddress', addr)" />

		<div class="flex items-center space-x-2 mx-4">
			<button
				@click="$emit('syncToPc')"
				:class="[
					'p-1 rounded transition-colors',
					isFollowingPc ? 'text-cyan-400 bg-cyan-400/10' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700',
				]"
				title="Sync with PC"
			>
				<Paperclip class="h-4 w-4" />
			</button>
			<button
				@click="$emit('openSymbolManager')"
				title="Symbol Manager"
				class="p-1 rounded text-gray-500 transition-colors hover:text-gray-300 hover:bg-gray-700"
			>
				<Tags class="h-4 w-4" />
			</button>
			<button
				@click="$emit('openFormattingManager')"
				title="Formatting Manager"
				class="p-1 rounded text-gray-500 transition-colors hover:text-gray-300 hover:bg-gray-700"
			>
				<Binary class="h-4 w-4" />
			</button>
		</div>

		<div class="flex items-center space-x-2">
			<button
				@click="$emit('explain')"
				:disabled="isLoading || !hasDisassembly"
				class="text-xs px-3 py-1 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition duration-150 shadow-md flex items-center disabled:opacity-50"
			>
				{{ isLoading ? "Analyzing..." : "✨" }}
			</button>

			<Popover>
				<PopoverTrigger as-child>
					<Button variant="ghost" size="icon" class="h-6 w-6 text-gray-400 hover:text-cyan-300" title="Disassembly Options">
						<Settings2 class="h-4 w-4" />
					</Button>
				</PopoverTrigger>
				<PopoverContent class="w-100 bg-gray-800 border-gray-700 text-gray-200">
					<div class="grid gap-4">
						<span class="text-sm font-bold text-gray-200 capitalize">Disasm Settings</span>
						<div class="grid gap-2 -mb-2">
							<div class="flex items-center space-x-2">
								<Checkbox id="showCycles" v-model="settings.disassembly.showCycles" />
								<label for="showCycles" class="text-xs font-medium leading-none cursor-pointer select-none"> Show Cycles </label>
							</div>
						</div>
						<div class="border-t border-gray-700 -mx-4 my-1"></div>
						<div class="grid grid-cols-2 gap-4">
							<div>
								<div class="text-sm font-bold text-gray-200 capitalize mb-4">Memory Scopes</div>
								<div class="grid gap-2 max-h-48 overflow-y-auto pr-2">
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
							<div>
								<div class="text-sm font-bold text-gray-200 capitalize mb-4">Symbol Namespaces</div>
								<div class="grid gap-2 max-h-48 overflow-y-auto pr-2">
									<div v-for="[ns, isActive] in getNamespaceList()" :key="ns" class="flex items-center space-x-2">
										<Checkbox :id="`ns-${ns}`" :model-value="isActive" @update:model-value="toggleNamespace(ns)" />
										<label :for="`ns-${ns}`" class="text-xs font-medium leading-none cursor-pointer select-none truncate" :title="ns">{{
											ns
										}}</label>
									</div>
								</div>
							</div>
							<div>
								<div class="text-sm font-bold text-gray-200 capitalize mb-4">Formatting Groups</div>
								<div class="grid gap-2 max-h-48 overflow-y-auto pr-2">
									<div v-for="[group, isActive] in getFormattingGroups()" :key="group" class="flex items-center space-x-2">
										<Checkbox :id="`fmt-${group}`" :model-value="isActive" @update:model-value="toggleFormattingGroup(group)" />
										<label
											:for="`fmt-${group}`"
											class="text-xs font-medium leading-none cursor-pointer select-none truncate"
											:title="group"
											>{{ group }}</label
										>
									</div>
								</div>
							</div>
						</div>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { Binary, Paperclip, Settings2, Tags } from "lucide-vue-next";
import AddressNavigator from "@/app/debugger/AddressNavigator.vue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFormatting } from "@/composables/useFormatting";
import { useSettings } from "@/composables/useSettings";
import { useSymbols } from "@/composables/useSymbols";

const props = defineProps<{
	isFollowingPc: boolean;
	isLoading: boolean;
	hasDisassembly: boolean;
	availableScopes: string[];
}>();

const emit = defineEmits<{
	(e: "syncToPc"): void;
	(e: "explain"): void;
	(e: "gotoAddress", address: number): void;
	(e: "openSymbolManager"): void;
	(e: "openFormattingManager"): void;
}>();

const { getNamespaceList, toggleNamespace } = useSymbols();
const { getFormattingGroups, toggleFormattingGroup } = useFormatting();
const { settings } = useSettings();
</script>
