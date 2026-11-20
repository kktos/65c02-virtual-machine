<template>
	<!-- Same frame and title style as the Stack panel next to it; in a floating panel, neither: the panel has them -->
	<div
		class="p-2 bg-black rounded-lg shadow-xl h-full flex flex-col in-[.floating-panel]:p-1 in-[.floating-panel]:rounded-none"
	>
		<div
			class="flex justify-between items-center -mt-1 mb-0.5 shrink-0 in-[.floating-panel]:mt-0 in-[.floating-panel]:justify-end"
		>
			<h2
				class="in-[.floating-panel]:hidden text-[0.65rem] leading-none font-semibold text-cyan-400 uppercase tracking-wider"
			>
				Execution Trace
			</h2>
			<div class="flex items-center space-x-1">
				<!-- Record / stop: tracing slows the CPU, it is off until started here -->
				<button
					@click="toggleTrace"
					class="relative p-1 rounded transition-colors"
					:class="
						traceEnabled
							? 'bg-red-900/40 text-red-400 hover:bg-red-900/60'
							: 'text-gray-400 hover:text-red-400 hover:bg-gray-700'
					"
					:aria-pressed="traceEnabled"
					:title="
						(traceEnabled ? 'Stop tracing' : 'Start tracing (jumps and instructions)') +
						(vm?.traceOverflow?.value ? ' — jumps buffer overflow' : '')
					"
				>
					<span
						v-if="vm?.traceOverflow?.value"
						class="absolute top-0 right-0 w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse shadow-[0_0_4px_rgba(251,146,60,0.6)]"
					></span>
					<Square v-if="traceEnabled" class="h-4 w-4 fill-current" />
					<Circle v-else class="h-4 w-4 fill-current" />
				</button>
				<div
					class="flex rounded border border-gray-700 overflow-hidden text-[0.65rem] leading-none mr-1"
					role="group"
				>
					<button
						v-for="m in MODES"
						:key="m.value"
						@click="mode = m.value"
						class="px-1.5 py-1 transition-colors"
						:class="mode === m.value ? 'bg-gray-700 text-cyan-300' : 'text-gray-400 hover:text-gray-200'"
						:aria-pressed="mode === m.value"
						:title="m.title"
					>
						{{ m.label }}
					</button>
				</div>
				<Popover>
					<PopoverTrigger as-child>
						<button
							class="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
							title="Trace Settings"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>
					</PopoverTrigger>
					<PopoverContent class="w-60 bg-gray-800 border-gray-700 text-gray-100 p-3" align="end">
						<div v-if="mode === 'jumps'" class="flex flex-col space-y-2">
							<label class="text-xs font-medium text-gray-400">Max Trace Depth</label>
							<input
								type="number"
								v-model.number="traceSize"
								class="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
								min="10"
								max="1000"
								step="10"
							/>
						</div>
						<div v-else class="flex flex-col space-y-2">
							<label class="text-xs font-medium text-gray-400" for="trace-kept">Instructions kept</label>
							<select
								id="trace-kept"
								v-model.number="instructionsKept"
								class="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
							>
								<option v-for="n in KEPT_SIZES" :key="n" :value="n">{{ n }}</option>
							</select>
							<p class="text-[0.65rem] text-gray-500">Changing it while tracing restarts the trace.</p>
							<label class="text-xs font-medium text-gray-400" for="trace-rows">Rows shown</label>
							<input
								id="trace-rows"
								type="number"
								v-model.number="rowsShown"
								class="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
								min="10"
								:max="ROWS_MAX"
								step="100"
							/>
						</div>
					</PopoverContent>
				</Popover>

				<button
					@click="refreshTrace"
					class="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
					title="Refresh Trace"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
				<button
					@click="clearTrace"
					class="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors"
					title="Clear Trace"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
			</div>
		</div>

		<div
			v-if="mode === 'jumps'"
			class="flex-grow min-h-0 overflow-y-auto font-mono text-xs bg-black p-1.5 rounded-md"
		>
			<table class="text-left border-collapse w-full">
				<thead class="sticky top-0 bg-black">
					<tr class="text-gray-500 border-b border-gray-700">
						<th class="py-1 w-12">Source</th>
						<th class="py-1 w-15 text-center">Type</th>
						<th class="py-1">Target</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="(entry, index) in traceHistory" :key="index" class="hover:bg-gray-800 text-gray-300">
						<td
							class="py-0.5 text-yellow-500 cursor-pointer hover:text-yellow-300 hover:underline"
							@click="handleJumpToSource(entry.source)"
							title="Jump to disassembly"
						>
							{{ formatAddress(entry.source) }}
						</td>
						<td class="py-0.5 text-gray-400 text-center">{{ entry.type }}</td>
						<td
							class="py-0.5 text-cyan-400 cursor-pointer hover:text-yellow-300 hover:underline"
							@click="handleJumpToSource(entry.target)"
							title="Jump to disassembly"
						>
							{{ formatAddress(entry.target) }}
						</td>
					</tr>
					<tr v-if="traceHistory.length === 0">
						<td colspan="3" class="py-4 text-center text-gray-600 italic">
							{{
								traceEnabled
									? "No trace data yet: run the machine."
									: "No trace data. Press ● to start tracing."
							}}
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<!-- Every instruction, most recent first like the jumps (the top row is the last one executed), registers before it -->
		<div v-else class="flex-grow min-h-0 overflow-auto font-mono text-xs bg-black p-1.5 rounded-md">
			<table class="text-left border-collapse w-full whitespace-nowrap">
				<thead class="sticky top-0 bg-black">
					<tr class="text-gray-500 border-b border-gray-700">
						<th class="py-1 pr-2">Address</th>
						<th class="py-1 pr-2">Instruction</th>
						<th class="py-1 pr-1.5 text-right">A</th>
						<th class="py-1 pr-1.5 text-right">X</th>
						<th class="py-1 pr-1.5 text-right">Y</th>
						<th class="py-1 pr-1.5 text-right" title="Status flags (set: upper case)">NV-BDIZC</th>
						<th class="py-1 text-right">SP</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="(entry, index) in instructions" :key="index" class="hover:bg-gray-800 text-gray-300">
						<td
							class="py-0.5 pr-2 text-yellow-500 cursor-pointer hover:text-yellow-300 hover:underline"
							@click="handleJumpToSource(entry.address)"
							:title="entry.label ? `${entry.label} — jump to disassembly` : 'Jump to disassembly'"
						>
							{{ formatAddress(entry.address) }}
						</td>
						<td class="py-0.5 pr-2">
							<span v-if="entry.label" class="text-green-400">{{ entry.label }}: </span>
							<span class="text-cyan-400">{{ entry.instruction }}</span>
						</td>
						<td class="py-0.5 pr-1.5 text-right">{{ toHex(entry.a) }}</td>
						<td class="py-0.5 pr-1.5 text-right">{{ toHex(entry.x) }}</td>
						<td class="py-0.5 pr-1.5 text-right">{{ toHex(entry.y) }}</td>
						<td class="py-0.5 pr-1.5 text-right text-gray-400" :title="`P=$${toHex(entry.p)}`">
							{{ formatFlags(entry.p) }}
						</td>
						<td class="py-0.5 text-right">{{ toHex(entry.sp) }}</td>
					</tr>
					<tr v-if="instructions.length === 0">
						<td colspan="7" class="py-4 text-center text-gray-600 italic whitespace-normal">
							{{
								traceEnabled
									? "No trace data yet: run the machine."
									: "No trace data. Press ● to start tracing."
							}}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
		<div
			v-if="mode === 'instructions' && recorded > instructions.length"
			class="shrink-0 pt-0.5 text-[0.65rem] text-gray-500"
		>
			Last {{ instructions.length }} of {{ recorded }} recorded
		</div>
	</div>
</template>

<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core";
import { Circle, Square } from "lucide-vue-next";
import { inject, onMounted, onUnmounted, type Ref, ref, watch } from "vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDisassembly } from "@/composables/useDisassembly";
import { useMachine } from "@/composables/useMachine";
import { type DescribedTraceEntry, describeTraceEntries, formatFlags } from "@/lib/instructionTrace.lib";
import { formatAddress, toHex } from "@/lib/hex.utils";
import { INSTRUCTION_TRACE_MAX_SIZE } from "@/virtualmachine/cpu/instructionTrace";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

type Mode = "jumps" | "instructions";
const MODES: { value: Mode; label: string; title: string }[] = [
	{ value: "jumps", label: "Jumps", title: "JSR / JMP / interrupts: where the flow went" },
	{ value: "instructions", label: "Instr.", title: "Every instruction executed, with the registers before it" },
];
const KEPT_SIZES = [1024, 4096, 16384, INSTRUCTION_TRACE_MAX_SIZE];
const ROWS_MAX = 5000;
// While running, the instruction view is redrawn at most this often (each redraw disassembles the rows)
const RUNNING_REFRESH_MS = 1000;

const vm = inject<Ref<VirtualMachine>>("vm");
const { isRunning, traceEnabled, setTraceEnabled } = useMachine();
const toggleTrace = () => setTraceEnabled(!traceEnabled.value);
const { requestJump } = useDisassembly();
const mode = useLocalStorage<Mode>("trace-mode", "jumps");
const traceHistory = ref<{ type: string; source: number; target: number }[]>([]);
const traceSize = ref(200);

const instructionsKept = useLocalStorage("trace-instructions-kept", 4096);
const rowsShown = useLocalStorage("trace-rows-shown", 500);
const instructions = ref<DescribedTraceEntry[]>([]);
const recorded = ref(0);

const refreshTrace = () => {
	vm?.value?.getTrace();
	refreshInstructions(true);
};

const clearTrace = () => {
	vm?.value?.clearTrace();
	traceHistory.value = [];
	instructions.value = [];
	recorded.value = 0;
	lastTotal = 0;
};

const handleJumpToSource = (addr: number) => requestJump(addr);

// ─── Instructions ───────────────────────────────────────────────────────────

let lastTotal = -1;
let lastRefresh = 0;
let refreshing = false;
const rowCount = () => Math.min(Math.max(Math.trunc(rowsShown.value) || 0, 10), ROWS_MAX);

/** Re-reads the trace when new instructions were recorded (or `force`), at most once a second while running. */
async function refreshInstructions(force = false) {
	const machine = vm?.value;
	if (!machine || mode.value !== "instructions" || refreshing) return;
	const now = performance.now();
	if (!force && isRunning.value && now - lastRefresh < RUNNING_REFRESH_MS) return;
	refreshing = true;
	try {
		const snapshot = await machine.getInstructionTrace(rowCount());
		if (!force && snapshot.total === lastTotal) return;
		lastTotal = snapshot.total;
		lastRefresh = now;
		recorded.value = snapshot.total;
		// The trace is oldest first: shown most recent first, as the jumps
		instructions.value = (await describeTraceEntries(machine, snapshot.words)).reverse();
	} finally {
		refreshing = false;
	}
}

let pollInterval: number | undefined;
onMounted(() => {
	pollInterval = window.setInterval(() => refreshInstructions(), 250);
});

watch(mode, (m) => {
	if (m !== "instructions") return;
	refreshInstructions(true);
});
watch(rowsShown, () => refreshInstructions(true));

watch(
	instructionsKept,
	(size) => {
		const machine = vm?.value;
		if (!machine) return;
		machine.instructionTraceSize = size;
		// The size only takes effect when the trace (re)starts: restart it if it runs
		if (machine.isTraceEnabled) machine.setTrace(true);
	},
	{ flush: "post" },
);

// ─── Jumps ──────────────────────────────────────────────────────────────────

watch(
	() => vm?.value,
	(newVm) => {
		if (newVm) {
			newVm.onTraceReceived = (history) => {
				traceHistory.value = [...history].reverse();
			};
			newVm.setTraceSize(traceSize.value);
			newVm.instructionTraceSize = instructionsKept.value;
			newVm.getTrace();
			lastTotal = -1;
			refreshInstructions(true);
		}
	},
	{ immediate: true },
);

watch(traceSize, (newSize) => {
	vm?.value?.setTraceSize(newSize);
});

onUnmounted(() => {
	clearInterval(pollInterval);
	if (vm?.value) vm.value.onTraceReceived = undefined;
});
</script>
