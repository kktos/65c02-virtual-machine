<template>
	<div class="p-1 bg-gray-800 rounded-lg shadow-xl flex flex-col h-full overflow-hidden text-xs">
		<div v-if="!state" class="p-3 text-gray-500">This machine has no interrupt controller.</div>
		<div v-else class="overflow-y-auto overflow-x-auto min-h-0 pr-1 flex flex-col gap-1">
			<!-- Control -->
			<div
				class="bg-gray-900/50 p-2 rounded border border-gray-700/50 flex flex-wrap items-center gap-x-4 gap-y-1"
			>
				<div v-for="led in leds" :key="led.label" class="flex items-center gap-2" :title="led.title">
					<span :class="['w-3 h-3 rounded-full transition-colors', ledClass(led.on)]"></span>
					<span class="text-gray-400 select-none">{{ led.label }}</span>
				</div>
				<div class="flex items-center gap-2" title="CURRENT: the in-service ID whose handler runs">
					<span class="text-gray-400 select-none">Current</span>
					<span class="font-mono text-yellow-300">{{ state.current === 0xff ? "—" : state.current }}</span>
				</div>
				<div class="flex items-center gap-2" title="INDEX: the register DATA LO / HI refer to">
					<span class="text-gray-400 select-none">Index</span>
					<span class="font-mono text-yellow-300">${{ toHex(state.index, 2) }}</span>
				</div>
			</div>

			<!-- IDs -->
			<table class="w-full font-mono bg-gray-900/50 rounded border border-gray-700/50">
				<thead class="text-gray-500 text-[0.65rem] uppercase text-left">
					<tr>
						<th class="py-1 px-2">ID</th>
						<th class="py-1 pr-2 font-sans">Source</th>
						<th class="py-1 pr-2" title="Priority: 0 highest">Prio</th>
						<th class="py-1 pr-2" title="— : none, the IRQ goes through $FFFE/F">Handler</th>
						<th class="py-1 pr-2">Bank</th>
						<th v-for="col in FLAG_COLUMNS" :key="col.key" class="py-1 pr-2 text-center" :title="col.title">
							{{ col.label }}
						</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="line in state.lines"
						:key="line.id"
						class="hover:bg-gray-800 text-gray-300"
						:class="{ 'bg-cyan-900/30': line.id === state.current }"
					>
						<td class="py-0.5 px-2 text-yellow-300">{{ line.id }}</td>
						<td
							class="py-0.5 pr-2 font-sans truncate max-w-[14rem]"
							:class="state.sources[line.id] ? '' : 'text-gray-600'"
						>
							{{ state.sources[line.id] ?? "—" }}
						</td>
						<td class="py-0.5 pr-2">{{ line.prio }}</td>
						<td
							v-if="line.handler"
							class="py-0.5 pr-2 text-yellow-500 cursor-pointer hover:text-yellow-300 hover:underline"
							title="Jump to disassembly"
							@click="requestJump(line.handler)"
						>
							${{ toHex(line.handler, 4) }}
						</td>
						<td v-else class="py-0.5 pr-2 text-gray-600">—</td>
						<td class="py-0.5 pr-2">{{ line.bank ? `$${toHex(line.bank, 2)}` : "" }}</td>
						<td v-for="col in FLAG_COLUMNS" :key="col.key" class="py-0.5 pr-2">
							<span
								:class="[
									'block mx-auto w-2.5 h-2.5 rounded-full',
									bitClass(state[col.key], line.id, col.color),
								]"
							></span>
						</td>
					</tr>
				</tbody>
			</table>

			<!-- Frames -->
			<div class="bg-gray-900/50 p-2 rounded border border-gray-700/50">
				<h3 class="font-bold text-gray-300 mb-1 text-[0.65rem] uppercase">Vectored IRQs in progress</h3>
				<div v-if="!state.frames.length" class="text-gray-600">None</div>
				<div v-else class="font-mono flex flex-col gap-0.5">
					<!-- innermost first -->
					<div v-for="(frame, index) in [...state.frames].reverse()" :key="index" class="text-gray-300">
						<span class="text-yellow-300">#{{ frame.id }}</span>
						<span class="text-gray-500"> RTI expected at SP=</span>${{ toHex(frame.sp, 2) }}
						<span v-if="frame.saved" class="text-gray-500"> saved={{ frame.saved }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, inject, onUnmounted, type Ref, shallowRef, watch } from "vue";
import { useDisassembly } from "@/composables/useDisassembly";
import type { InterruptsState } from "@/types/interrupts.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const vm = inject<Ref<VirtualMachine>>("vm");
const { requestJump } = useDisassembly();

type MaskKey = "pending" | "mask" | "inService" | "eligible";
const FLAG_COLUMNS: { key: MaskKey; label: string; title: string; color: string }[] = [
	{ key: "pending", label: "P", title: "Pending: the line is asserted", color: "bg-yellow-400" },
	{ key: "mask", label: "M", title: "Masked", color: "bg-red-500" },
	{ key: "inService", label: "S", title: "In service (until its EOI)", color: "bg-cyan-400" },
	{ key: "eligible", label: "E", title: "Eligible: can interrupt now", color: "bg-green-500" },
];

const state = shallowRef<InterruptsState | null>(null);

const leds = computed(() =>
	state.value
		? [
				{ label: "Vectoring", on: state.value.enabled, title: "Off: the IMU only ORs its lines into the IRQ" },
				{ label: "Auto-EOI", on: state.value.autoEoi, title: "Nothing stays in service" },
				{ label: "IRQ line", on: state.value.irq, title: "The CPU's IRQ input, as the IMU drives it" },
			]
		: [],
);

const toHex = (value: number, width: number) => value.toString(16).toUpperCase().padStart(width, "0");
const ledClass = (on: boolean) =>
	on ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" : "bg-red-900 shadow-[0_0_6px_rgba(239,68,68,0.6)]";
const bitClass = (mask: number, id: number, color: string) => (mask & (1 << id) ? color : "bg-gray-700");

const refresh = async () => {
	if (vm?.value) state.value = await vm.value.getInterrupts();
};

// While the window is open (it unmounts this view when closed)
let poll: number | undefined;
watch(
	() => vm?.value,
	async (newVm) => {
		window.clearInterval(poll);
		state.value = null;
		if (!newVm) return;
		await newVm.ready;
		await refresh();
		poll = window.setInterval(refresh, 250);
	},
	{ immediate: true },
);

onUnmounted(() => window.clearInterval(poll));
</script>
