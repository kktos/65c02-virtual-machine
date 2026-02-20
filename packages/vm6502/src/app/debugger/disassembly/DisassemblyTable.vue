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
						@dblclick="startLabelEdit(line)"
					>
						<template v-if="editingLabelAddress === line.addr">
							<div class="relative w-full inline-block">
								<input
									:ref="
										(el) => {
											if (el) editLabelInputRef = el as HTMLInputElement;
										}
									"
									v-model="editLabelText"
									class="bg-black text-yellow-500 font-bold font-mono text-xs border border-blue-500 px-1 h-5 w-full focus:outline-none"
									@keydown.enter="commitLabelEdit"
									@keydown.esc="cancelLabelEdit"
									@blur="cancelLabelEdit"
									@input="labelError = ''"
								/>
								<div
									v-if="labelError"
									class="absolute top-full left-0 mt-1 bg-red-900 text-white text-xs px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap border border-red-700"
								>
									{{ labelError }}
								</div>
							</div>
						</template>
						<template v-else> {{ line.label }}: </template>
					</td>
				</tr>
				<tr
					:class="[
						'hover:bg-gray-700 transition duration-100 border-l-4',
						line.addr === address ? 'bg-yellow-800/70 text-yellow-100 font-bold border-yellow-400' : 'border-transparent text-gray-300',
						contextMenu.isOpen && contextMenu.address === line.addr ? 'bg-gray-700' : '',
					]"
				>
					<td class="py-0.5 text-center">
						<button @click="$emit('toggleBreakpoint', line.addr)" class="w-full h-full flex items-center justify-center cursor-pointer group">
							<span class="w-2 h-2 rounded-full transition-colors" :class="getBreakpointClass(line.addr)"></span>
						</button>
					</td>
					<td
						class="py-0.5 px-2 tabular-nums text-indigo-300 font-mono cursor-pointer align-baseline"
						:style="{ 'background-color': getScopeColor(line.addr) + '1A' }"
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
						@dblclick="startEdit(line)"
					>
						<template v-if="editingAddress === line.addr">
							<div class="relative w-full">
								<input
									:ref="
										(el) => {
											if (el) editInputRef = el as HTMLInputElement;
										}
									"
									v-model="editText"
									class="bg-black text-white p-0 w-full font-mono focus:outline-none"
									@keydown.enter="commitEdit"
									@keydown.esc="cancelEdit"
									@blur="cancelEdit"
									@input="asmError = ''"
								/>
								<div
									v-if="asmError"
									class="absolute top-full left-0 mt-1 bg-red-900 text-white text-xs px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap border border-red-700"
								>
									{{ asmError }}
								</div>
							</div>
						</template>
						<template v-else>
							<span
								:class="{
									'hover:underline': isCtrlPressed && isOpcodeClickable(line),
								}"
							>
								<span :class="{ 'text-blue-400': line.opc.startsWith('.') }">{{ line.opc }}</span>
								{{ line.opr ? " " + line.opr : "" }}
							</span>
							<span
								v-if="line.addr === address && getBranchPrediction(line.opc)"
								:class="['ml-2', getBranchPrediction(line.opc)?.color]"
								:title="getBranchPrediction(line.opc)?.title"
							>
								{{ getBranchPrediction(line.opc)?.char }}
							</span>
						</template>
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
		@update:is-open="(val) => (contextMenu.isOpen = val)"
		:x="contextMenu.x"
		:y="contextMenu.y"
		:address="contextMenu.address"
		:key="`${contextMenu.x}-${contextMenu.y}`"
	/>
</template>

<script lang="ts" setup>
import { useKeyModifier } from "@vueuse/core";
import { inject, nextTick, type Ref, ref } from "vue";
import AddSymbolPopover from "@/components/AddSymbolPopover.vue";
import { useSettings } from "@/composables/useSettings";
import { useSymbols } from "@/composables/useSymbols";
import { assemble } from "@/lib/assembler";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorState } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { BRANCH_OPCODES } from "@/lib/opcodes";

const vm = inject<Ref<VirtualMachine>>("vm");

const { registers } = defineProps<{
	registers: EmulatorState["registers"];
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
const isCtrlPressed = useKeyModifier("Control");
const { symbolDict, addSymbol, removeSymbol } = useSymbols();

const getBranchPrediction = (opcode: string) => {
	// Defensive check for props.registers (already added in last iteration, keeping it)
	if (!registers) return null;

	const { N, Z, C, V } = registers;
	let isTaken = false;
	let isBranchOpcode = false;

	switch (opcode) {
		case "BNE":
			isTaken = !Z;
			isBranchOpcode = true;
			break;
		case "BEQ":
			isTaken = Z;
			isBranchOpcode = true;
			break;
		case "BPL":
			isTaken = !N;
			isBranchOpcode = true;
			break;
		case "BMI":
			isTaken = N;
			isBranchOpcode = true;
			break;
		case "BCC":
			isTaken = !C;
			isBranchOpcode = true;
			break;
		case "BCS":
			isTaken = C;
			isBranchOpcode = true;
			break;
		case "BVC":
			isTaken = !V;
			isBranchOpcode = true;
			break;
		case "BVS":
			isTaken = V;
			isBranchOpcode = true;
			break;
	}

	if (!isBranchOpcode) return null;

	return isTaken ? { char: "→", title: "Branch Taken", color: "text-green-400" } : { char: "↓", title: "Branch Not Taken", color: "text-red-400" };
};

const isOpcodeClickable = (line: DisassemblyLine) => {
	const mnemonic = line.opc;
	if (BRANCH_OPCODES.has(mnemonic)) return true;
	const operand = line.opr;
	return operand.includes("$"); // Simple check for an address operand
};

const getOpcodeTitle = (opc: string) => {
	if (BRANCH_OPCODES.has(opc)) return "CTRL+Click to follow jump/branch";
	return "CTRL+Click to view effective address in Memory Viewer";
};

const getScopeForAddr = (addr: number) => {
	const scope = vm?.value?.getScope(addr & 0xffff);
	return scope ?? "";
};

const getScopeColor = (addr: number) => {
	const scope = vm?.value?.getScope(addr & 0xffff);
	if (!scope) return "";
	const color = settings.disassembly.scopeColors[scope];
	// If color is black or transparent, use default class
	if (!color || color === "#000000" || color === "#00000000") return "";
	return color;
};

// --- Context Menu & Label Editing ---
const contextMenu = ref({
	isOpen: false,
	x: 0,
	y: 0,
	address: 0,
});

const handleContextMenu = (event: MouseEvent, line: DisassemblyLine) => {
	contextMenu.value = {
		isOpen: true,
		x: event.clientX,
		y: event.clientY,
		address: line.addr,
	};
};

// --- Inline Assembler ---
const asmError = ref("");
const editingAddress = ref<number | null>(null);
const editText = ref("");
const editInputRef = ref<HTMLInputElement | null>(null);

const startEdit = (line: DisassemblyLine) => {
	editingAddress.value = line.addr;
	editText.value = `${line.opc} ${line.opr}`.trim();
	asmError.value = "";
	nextTick(() => {
		editInputRef.value?.focus();
	});
};

const cancelEdit = () => {
	editingAddress.value = null;
	editText.value = "";
	asmError.value = "";
};

const commitEdit = () => {
	if (editingAddress.value === null) return;

	const result = assemble(editingAddress.value, editText.value, (label) => {
		const dict = symbolDict.value;
		for (const addrStr in dict) {
			const addr = parseInt(addrStr, 10);
			const namespaces = dict[addr];
			for (const ns in namespaces) {
				if (namespaces[ns]?.label === label) return addr;
			}
		}
		return undefined;
	});

	if (result.error) {
		asmError.value = result.error;
		return;
	}

	if (vm?.value && result.bytes.length > 0) {
		for (let i = 0; i < result.bytes.length; i++) {
			vm.value.writeDebug(editingAddress.value + i, result.bytes[i] as number);
		}
	}

	// fake mod to trigger watch for disassembly update
	registers.A++;

	cancelEdit();
};

// --- Label Editing ---
const editingLabelAddress = ref<number | null>(null);
const editLabelText = ref("");
const originalLabel = ref("");
const labelError = ref("");
const editLabelInputRef = ref<HTMLInputElement | null>(null);

const startLabelEdit = (line: DisassemblyLine) => {
	editingLabelAddress.value = line.addr;
	editLabelText.value = line.label || "";
	originalLabel.value = line.label || "";
	labelError.value = "";
	nextTick(() => {
		editLabelInputRef.value?.focus();
	});
};

const cancelLabelEdit = () => {
	editingLabelAddress.value = null;
	editLabelText.value = "";
	originalLabel.value = "";
	labelError.value = "";
};

const commitLabelEdit = () => {
	if (editingLabelAddress.value === null) return;
	const addr = editingLabelAddress.value;
	const newLabel = editLabelText.value.trim();
	const oldLabel = originalLabel.value;

	// Find namespace/scope of the old label
	let namespace = "user";
	let scope = "main";

	const namespaces = symbolDict.value[addr];
	if (namespaces) {
		for (const ns in namespaces) {
			if (namespaces[ns].label === oldLabel) {
				namespace = ns;
				scope = namespaces[ns].scope || "main";
				break;
			}
		}
	}

	if (!newLabel) {
		removeSymbol(addr, namespace);
		cancelLabelEdit();
		return;
	}

	if (newLabel === oldLabel) {
		cancelLabelEdit();
		return;
	}

	// Check duplicate in the same namespace
	for (const aStr in symbolDict.value) {
		const a = parseInt(aStr, 10);
		if (a === addr) continue;
		const nsData = symbolDict.value[a];
		if (nsData && nsData[namespace] && nsData[namespace].label === newLabel) {
			labelError.value = `Label "${newLabel}" already exists in namespace "${namespace}"`;
			return;
		}
	}

	addSymbol(addr, newLabel, namespace, scope);
	cancelLabelEdit();
};
</script>
