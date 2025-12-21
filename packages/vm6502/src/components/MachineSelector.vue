<template>
  <div class="flex items-center gap-2 p-1 text-sm font-mono text-gray-300">
    <span>Machine:</span>
    <Select :model-value="selectedMachine.name" @update:model-value="onMachineSelect">
      <SelectTrigger class="w-[220px] bg-gray-800 border-gray-600">
        <SelectValue placeholder="Select a machine" />
      </SelectTrigger>
      <SelectContent class="bg-gray-800 text-gray-300 border-gray-600">
        <SelectItem v-for="machine in machines" :key="machine.name" :value="machine.name">
          {{ machine.name }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>

<script setup lang="ts">
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import type { MachineConfig } from '@/machines/machine.interface';

const props = defineProps<{
  machines: MachineConfig[],
  selectedMachine: MachineConfig
}>();

const emit = defineEmits<(e: 'machine-selected', machine: MachineConfig) => void>();

const onMachineSelect = (machineName: string) => {
  const newMachine = props.machines.find(m => m.name === machineName);
  if (newMachine) emit('machine-selected', newMachine);
};
</script>
