<template>
	<FloatPanel v-if="show" v-model:show="show" :initial-pos="pos" closable :title="'XRefs: ' + label">
		<template #default>
			<div
				class="bg-black/80 border border-gray-600 shadow-2xl min-w-[200px] max-h-[350px] flex flex-col overflow-hidden"
			>
				<div class="overflow-y-auto p-0.5 font-mono text-[0.68rem]">
					<div v-if="references.length === 0" class="p-4 text-gray-500 italic text-center">
						No references found.
					</div>
					<div
						v-for="ref in references"
						:key="ref.address"
						class="px-2 py-1.5 hover:bg-blue-600/30 cursor-pointer text-indigo-300 flex justify-between items-center group transition-colors border-b border-gray-700/50 last:border-0"
						@click="handleJump(ref.address)"
						:title="`Jump to $${ref.address.toString(16).toUpperCase()}`"
					>
						<span class="font-bold">{{ formatAddress(ref.address) }}</span>
						<span class="text-white text-[0.6rem] uppercase">
							{{ ref.instruction }}
						</span>
					</div>
				</div>
			</div>
		</template>
	</FloatPanel>
</template>

<script setup lang="ts">
import { computed, inject, type Ref } from "vue";
import FloatPanel from "./FloatPanel.vue";
import { useDebuggerNav } from "@/composables/useDebuggerNav";
import { useCrossReferences } from "@/composables/useCrossReferences";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { useAddressHistory } from "@/composables/useAddressHistory";
import { formatAddress } from "@/lib/hex.utils";

const vm = inject<Ref<VirtualMachine>>("vm");

const props = defineProps<{
	addr: number;
	label: string;
	pos: { right: string; top: string };
}>();

const show = defineModel<boolean>("show", { default: false });

const { findReferences } = useCrossReferences();
const { setActiveTab } = useDebuggerNav();
const { jumpToAddress } = useAddressHistory("disassembly");

const references = computed(() => (vm ? findReferences(vm.value, props.addr) || [] : []));

const handleJump = (address: number) => {
	jumpToAddress(address);
	setActiveTab("disassembly");
};
</script>
