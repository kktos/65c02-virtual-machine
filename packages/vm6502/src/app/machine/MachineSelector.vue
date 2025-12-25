<template>
  <div class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg shadow-md border border-gray-700">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <button class="group flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors shrink-0" title="Select Machine">
          <Cpu class="h-5 w-5 text-cyan-400 group-hover:text-cyan-300" />
        </button>
      </PopoverTrigger>
      <PopoverContent class="w-[220px] p-0 bg-gray-800 border-gray-700" align="start">
        <Command class="bg-gray-800 text-gray-100">
          <CommandList>
            <CommandGroup>
              <CommandItem v-for="machine in machines" :key="machine.name" :value="machine.name" @select="selectMachine(machine)" class="text-sm data-[highlighted]:bg-gray-700 data-[highlighted]:text-yellow-300 cursor-pointer text-gray-300">
                <Check :class="['mr-2 h-4 w-4', selectedMachine.name === machine.name ? 'opacity-100' : 'opacity-0']" />
                {{ machine.name }}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    <div class="flex flex-col overflow-hidden min-w-[8rem]">
      <span class="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Machine</span>
      <div class="text-xs font-mono truncate text-gray-300" :title="selectedMachine.name">
        {{ selectedMachine.name }}
      </div>
    </div>
    <button @click="$emit('power-cycle')" class="group flex items-center justify-center w-8 h-8 bg-gray-700 hover:bg-red-900/30 rounded border border-gray-600 transition-colors shrink-0 ml-auto" title="Hard Power Cycle">
      <Power class="h-4 w-4 text-red-400 group-hover:text-red-300" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Check, Cpu, Power } from 'lucide-vue-next';
import { ref } from 'vue';
import {
    Command,
    CommandGroup,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import type { MachineConfig } from '@/types/machine.interface';

const props = defineProps<{
  machines: MachineConfig[],
  selectedMachine: MachineConfig
}>();

const emit = defineEmits<{
  (e: 'machine-selected', machine: MachineConfig): void;
  (e: 'power-cycle'): void;
}>();

const open = ref(false);

const selectMachine = (machine: MachineConfig) => {
  emit('machine-selected', machine);
  open.value = false;
};
</script>
