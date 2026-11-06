<template>
	<div class="flex items-center gap-0.5 min-w-0">
		<Popover v-model:open="open">
			<PopoverTrigger as-child>
				<button
					class="toolbar-btn group bg-gray-700 hover:bg-gray-600"
					:title="`Select Machine (${selectedMachine.name})`"
				>
					<Cpu class="h-4 w-4 text-cyan-400 group-hover:text-cyan-300" />
				</button>
			</PopoverTrigger>
			<PopoverContent class="w-[220px] p-0 bg-gray-800 border-gray-700" align="start">
				<Command class="bg-gray-800 text-gray-100">
					<CommandList>
						<CommandGroup>
							<CommandItem
								v-for="machine in machines"
								:key="machine.name"
								:value="machine.name"
								@select="selectMachine(machine)"
								class="text-sm data-[highlighted]:bg-gray-700 data-[highlighted]:text-yellow-300 cursor-pointer text-gray-300"
							>
								<Check :class="['mr-2 h-4 w-4', selectedMachine.name === machine.name ? 'opacity-100' : 'opacity-0']" />
								{{ machine.name }}
							</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
		<div class="hidden @[26rem]:flex flex-col min-w-0 px-1.5 leading-tight">
			<span class="hidden @[48rem]:block text-[10px] uppercase text-gray-400 font-bold tracking-wider">Machine</span>
			<span class="text-xs font-mono truncate text-gray-300" :title="selectedMachine.name">
				{{ selectedMachine.name }}
			</span>
		</div>
		<button @click="$emit('power-cycle')" class="toolbar-btn group hover:bg-red-900/30" title="Hard Power Cycle">
			<Power class="h-4 w-4 text-red-400 group-hover:text-red-300" />
		</button>
	</div>
</template>

<script setup lang="ts">
import { Check, Cpu, Power } from "lucide-vue-next";
import { ref } from "vue";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { MachineConfig } from "@/types/machine.interface";

const props = defineProps<{
	machines: MachineConfig[];
	selectedMachine: MachineConfig;
}>();

const emit = defineEmits<{
	(e: "machine-selected", machine: MachineConfig): void;
	(e: "power-cycle"): void;
}>();

const open = ref(false);

const selectMachine = (machine: MachineConfig) => {
	emit("machine-selected", machine);
	open.value = false;
};
</script>
