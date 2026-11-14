<template>
	<Popover v-if="slots" v-model:open="open">
		<PopoverTrigger as-child>
			<button class="toolbar-btn group text-gray-400" title="Expansion slots">
				<Puzzle class="h-4 w-4 text-amber-400 group-hover:text-amber-300" />
			</button>
		</PopoverTrigger>
		<PopoverContent align="end" class="w-72 p-2 bg-gray-800 border-gray-700 text-gray-100">
			<div class="px-1 mb-1 text-[10px] uppercase text-gray-400 font-bold tracking-wider">Expansion slots</div>
			<div class="flex flex-col gap-1">
				<label
					v-for="slot in slots.count"
					:key="slot"
					class="flex items-center gap-2 px-1 text-xs text-gray-300"
				>
					<span class="w-12 shrink-0 text-gray-400">Slot {{ slot }}</span>
					<select
						v-if="slots.builtin?.[slot]"
						disabled
						class="flex-1 min-w-0 bg-gray-700 text-gray-200 text-xs rounded border border-gray-600 outline-none px-1 py-0.5 disabled:opacity-50"
					>
						<option>{{ slots.builtin[slot] }}</option>
					</select>
					<select
						v-else
						v-model="draft[slot]"
						:disabled="!cardsFor(slot).length"
						class="flex-1 min-w-0 bg-gray-700 text-gray-200 text-xs rounded border border-gray-600 focus:ring-1 focus:ring-cyan-500 outline-none px-1 py-0.5 disabled:opacity-50"
					>
						<option :value="undefined">Empty</option>
						<option v-for="card in cardsFor(slot)" :key="card.id" :value="card.id">{{ card.label }}</option>
					</select>
				</label>
			</div>
			<div class="flex items-center gap-2 mt-2 pt-2 px-1 border-t border-gray-700">
				<button
					class="text-xs text-gray-400 hover:text-yellow-300 disabled:opacity-40 disabled:hover:text-gray-400"
					:disabled="isDefault"
					@click="draft = { ...defaultLayout }"
				>
					Defaults
				</button>
				<span class="flex-1"></span>
				<button
					class="px-2 py-0.5 rounded text-xs bg-red-900/60 text-gray-100 hover:bg-red-800 disabled:opacity-40 disabled:hover:bg-red-900/60"
					:disabled="!changed"
					title="The new cards are there once the machine is powered on again"
					@click="apply"
				>
					Apply &amp; power cycle
				</button>
			</div>
		</PopoverContent>
	</Popover>
</template>

<script lang="ts" setup>
import { Puzzle } from "lucide-vue-next";
import { computed, inject, type Ref, ref, watch } from "vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMachine } from "@/composables/useMachine";
import { setSlotLayout } from "@/composables/useSlots";
import { resolveSlotLayout, sameSlotLayout } from "@/lib/slots.lib";
import type { SlotLayout } from "@/types/machine.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");
const { loadMachine } = useMachine();

const open = ref(false);
const slots = computed(() => (vm?.value?.machineConfig.slots?.count ? vm.value.machineConfig.slots : undefined));
/** What the running machine was built with. */
const current = computed<SlotLayout>(() =>
	slots.value ? (vm?.value?.busOptions.slots ?? resolveSlotLayout(slots.value)) : {},
);
const defaultLayout = computed<SlotLayout>(() => (slots.value ? resolveSlotLayout(slots.value) : {}));

/** The layout being edited ("Empty" leaves an undefined value). */
const draft = ref<Record<number, string | undefined>>({});
watch(open, (isOpen) => {
	if (isOpen) draft.value = { ...current.value };
});

const draftLayout = computed<SlotLayout>(
	() => Object.fromEntries(Object.entries(draft.value).filter(([, id]) => id)) as SlotLayout,
);
const changed = computed(() => !sameSlotLayout(draftLayout.value, current.value));
const isDefault = computed(() => sameSlotLayout(draftLayout.value, defaultLayout.value));

const cardsFor = (slot: number) => slots.value?.cards.filter((c) => !c.slots || c.slots.includes(slot)) ?? [];

const apply = () => {
	const machine = vm?.value?.machineConfig;
	if (!machine) return;
	setSlotLayout(machine, isDefault.value ? undefined : draftLayout.value);
	open.value = false;
	loadMachine();
};
</script>
