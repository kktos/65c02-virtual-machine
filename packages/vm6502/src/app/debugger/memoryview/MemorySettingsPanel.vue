<!--
  MemorySettingsPanel — slide-up settings for one memory view: the machine's memory options
  (bank selection...) and the ASCII input options.
-->
<template>
	<SettingsPanel :is-open="isOpen" title="Settings" :ignore-ref="ignoreRef" @close="$emit('close')">
		<SettingsGroup v-for="group in debugOptions" :key="group.label" :label="group.label">
			<template v-for="row in group.rows">
				<SettingRow
					v-for="opt in row"
					:key="opt.id"
					:label="opt.label"
					:tag="opt.type === 'boolean' ? 'label' : 'div'"
					:class="{ 'opacity-50 pointer-events-none': isDisabled(opt) }"
				>
					<CheckBox
						v-if="opt.type === 'boolean'"
						:model-value="overrides[opt.id] as boolean"
						@update:model-value="setValue(opt.id, $event)"
					/>
					<SegmentControl
						v-else-if="opt.type === 'select' && opt.options"
						:options="opt.options"
						:model-value="overrides[opt.id] as string | number"
						@update:model-value="setValue(opt.id, $event)"
					/>
					<input
						v-else-if="opt.type === 'number'"
						type="number"
						:min="opt.min"
						:max="opt.max"
						:value="overrides[opt.id] as number"
						@input="setValue(opt.id, ($event.target as HTMLInputElement).valueAsNumber)"
						class="w-14 bg-[#181818] border border-[#2a2a2a] rounded-none text-[#4afa8a] text-[10px] font-mono text-right px-1 py-0.5 focus:outline-none focus:border-[#4afa8a] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
					/>
					<DebugColorPicker
						v-else-if="opt.type === 'color' && opt.options"
						:model-value="overrides[opt.id]"
						:options="opt.options"
						@update:model-value="setValue(opt.id, $event)"
					/>
				</SettingRow>
			</template>
		</SettingsGroup>

		<SettingsGroup label="ASCII">
			<SettingRow label="Set high bit (bit 7) on typed chars">
				<CheckBox v-model="highBit" />
			</SettingRow>
		</SettingsGroup>

		<template #footer>
			<button
				class="w-full text-xs uppercase tracking-widest text-[#383838] hover:text-[#ff5f5f] transition-colors text-left"
				@click="$emit('reset')"
			>
				↺ Reset to defaults
			</button>
		</template>
	</SettingsPanel>
</template>

<script lang="ts" setup>
import CheckBox from "@/components/settings/CheckBox.vue";
import SegmentControl from "@/components/settings/SegmentControl.vue";
import SettingRow from "@/components/settings/SettingRow.vue";
import SettingsGroup from "@/components/settings/SettingsGroup.vue";
import SettingsPanel from "@/components/settings/SettingsPanel.vue";
import DebugColorPicker from "@/components/DebugColorPicker.vue";
import type { DebugGroup, DebugOption } from "@/types/machine.interface";

defineProps<{
	isOpen: boolean;
	debugOptions: DebugGroup[];
	ignoreRef?: HTMLElement | null;
}>();

defineEmits<{
	(e: "close"): void;
	(e: "reset"): void;
}>();

const overrides = defineModel<Record<string, unknown>>("overrides", { required: true });
const highBit = defineModel<boolean>("highBit", { required: true });

const setValue = (id: string, value: unknown) => {
	// An emptied number input gives NaN: treat it as "no value"
	const finalValue = typeof value === "number" && Number.isNaN(value) ? undefined : value;
	overrides.value = { ...overrides.value, [id]: finalValue };
};

const isDisabled = (opt: DebugOption) =>
	!!opt.disableIf && overrides.value[opt.disableIf.optionId] === opt.disableIf.value;
</script>
