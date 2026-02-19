<template>
	<table class="w-full">
		<thead>
			<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md z-10">
				<th class="py-1 text-center w-8"></th>
				<th class="py-1 text-left px-2 w-20">Addr</th>
				<th class="py-1 text-left w-20"></th>
				<th class="py-1 text-left w-60">Opcode</th>
				<th class="py-1 text-left flex-grow">Comment</th>
				<th v-if="settings.disassembly.showCycles" class="py-1 text-right w-12">Cycles</th>
			</tr>
		</thead>
		<tbody>
			<template v-for="line in disassembly" :key="line.addr">
				<tr v-if="line.label">
					<td
						colspan="6"
						class="py-0.5 px-2 text-yellow-500 font-bold font-mono text-xs border-l-4 border-transparent"
						:style="{ color: getScopeColor(line.addr) }"
						@contextmenu.prevent="handleContextMenu($event, line)"
						:title="line.src"
					>
						{{ line.label }}:
					</td>
				</tr>
				<tr
					:class="[
						'hover:bg-gray-700 transition duration-100 border-l-4',
						line.addr === address ? 'bg-yellow-800/70 text-yellow-100 font-bold border-yellow-400' : 'border-transparent text-gray-300',
						contextMenu.isOpen && contextMenu.address === line.addr ? 'bg-gray-700' : ''
					]"
				>
					<td class="py-0.5 text-center">
						<button @click="$emit('toggleBreakpoint', line.addr)" class="w-full h-full flex items-center justify-center cursor-pointer group">
							<span class="w-2 h-2 rounded-full transition-colors" :class="getBreakpointClass(line.addr)"></span>
						</button>
					</td>
					<td
						class="py-0.5 px-2 tabular-nums text-indigo-300 font-mono cursor-pointer align-baseline"
						:style="{ 'background-color': getScopeColor(line.addr)+'1A' }"
						:title="`Scope: ${getScopeForAddr(line.addr)} | CTRL+Click to view in Memory Viewer`"
						@click.ctrl.prevent="$emit('addressClick', line.addr)"
					>
						{{ line.faddr }}
					</td>
					<td class="py-0.5 tabular-nums text-gray-400">
						{{ line.bytes }}
					</td>
					<td
						class="py-0.5 text-left flex items-center"
						:class="{ 'cursor-pointer': isCtrlPressed && isOpcodeClickable(line) }"
						:title="getOpcodeTitle(line.opc)"
						@click.ctrl.prevent="$emit('opcodeClick', line)"
						@contextmenu.prevent="handleContextMenu($event, line)"
					>
						<span :class="{ 'hover:underline': isCtrlPressed && isOpcodeClickable(line) }">
							<span :class="{ 'text-blue-400': line.opc.startsWith('.') }">{{ line.opc }}</span>
							{{ line.opr ? ' ' + line.opr : '' }}
						</span>
						<span
							v-if="line.addr === address && getBranchPrediction(line.opc)"
							:class="['ml-2', getBranchPrediction(line.opc)?.color]"
							:title="getBranchPrediction(line.opc)?.title"
						>
							{{ getBranchPrediction(line.opc)?.char }}
						</span>
					</td>
					<td class="py-0.5 text-left text-gray-500 align-baseline">
						{{ line.comment }}
					</td>
					<td v-if="settings.disassembly.showCycles" class="py-0.5 text-center text-gray-400">
						{{ line.cycles }}
					</td>
				</tr>
			</template>
		</tbody>
	</table>

	<AddSymbolPopover
		:is-open="contextMenu.isOpen"
		@update:is-open="(val) => contextMenu.isOpen = val"
		:x="contextMenu.x"
		:y="contextMenu.y"
		:address="contextMenu.address"
		:key="`${contextMenu.x}-${contextMenu.y}`"
	/>
</template>

<script lang="ts" setup>
import { inject, onMounted, onUnmounted, type Ref, ref } from "vue";
import AddSymbolPopover from "@/components/AddSymbolPopover.vue";
import { useSettings } from "@/composables/useSettings";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

	const vm= inject<Ref<VirtualMachine>>("vm");

	const { registers} = defineProps<{
		registers: EmulatorState['registers'];
		disassembly: DisassemblyLine[];
		address: number;
		getBreakpointClass: (address: number) => string;
	}>();

	defineEmits<{
		(e: "toggleBreakpoint", address: number): void;
		(e: "addressClick", address: number): void;
		(e: "opcodeClick", line: DisassemblyLine): void;
	}>();

	const { settings } = useSettings();

	const isCtrlPressed = ref(false);

	const updateCtrlState = (e: KeyboardEvent) => {
		isCtrlPressed.value = e.ctrlKey;
	};

	onMounted(() => {
		window.addEventListener("keydown", updateCtrlState);
		window.addEventListener("keyup", updateCtrlState);
	});

	onUnmounted(() => {
		window.removeEventListener("keydown", updateCtrlState);
		window.removeEventListener("keyup", updateCtrlState);
	});

	const getBranchPrediction = (opcode: string) => {
		// Defensive check for props.registers (already added in last iteration, keeping it)
		if (!registers) return null;

		const { N, Z, C, V } = registers;
		let isTaken = false;
		let isBranchOpcode = false;

		switch (opcode) {
			case 'BNE':
				isTaken = !Z;
				isBranchOpcode = true;
				break;
			case 'BEQ':
				isTaken = Z;
				isBranchOpcode = true;
				break;
			case 'BPL':
				isTaken = !N;
				isBranchOpcode = true;
				break;
			case 'BMI':
				isTaken = N;
				isBranchOpcode = true;
				break;
			case 'BCC':
				isTaken = !C;
				isBranchOpcode = true;
				break;
			case 'BCS':
				isTaken = C;
				isBranchOpcode = true;
			break;
			case 'BVC':
				isTaken = !V;
				isBranchOpcode = true;
				break;
			case 'BVS':
				isTaken = V;
				isBranchOpcode = true;
				break;
		}

		if (!isBranchOpcode) return null;

		return isTaken ?
			{ char: '→', title: 'Branch Taken', color: 'text-green-400' }
			:
			{ char: '↓', title: 'Branch Not Taken', color: 'text-red-400' };

	};

	const pcOpcodes= new Set(['JMP', 'JSR', 'BCC', 'BCS', 'BEQ', 'BMI', 'BNE', 'BPL', 'BVC', 'BVS']);

	const isOpcodeClickable = (line: DisassemblyLine) => {
		const mnemonic = line.opc;
		if (pcOpcodes.has(mnemonic)) return true;
		const operand = line.opr;
		return operand.includes('$'); // Simple check for an address operand
	};

	const getOpcodeTitle = (opc: string) => {
		if (pcOpcodes.has(opc)) return 'CTRL+Click to follow jump/branch';
		return 'CTRL+Click to view effective address in Memory Viewer';
	};

	const getScopeForAddr = (addr: number) => {
		const scope = vm?.value?.getScope(addr & 0xFFFF);
		return scope ?? "";
	};

	const getScopeColor = (addr: number) => {
		const scope = vm?.value?.getScope(addr & 0xFFFF);
		if (!scope) return "";
		const color = settings.disassembly.scopeColors[scope];
		// If color is black or transparent, use default class
		if (!color || color === '#000000' || color === '#00000000') return "";
		return color;
	};

	// --- Context Menu & Label Editing ---
	const contextMenu = ref({
		isOpen: false,
		x: 0,
		y: 0,
		address: 0
	});

	const handleContextMenu = (event: MouseEvent, line: DisassemblyLine) => {
		contextMenu.value = {
			isOpen: true,
			x: event.clientX,
			y: event.clientY,
			address: line.addr
		};
	};

</script>
