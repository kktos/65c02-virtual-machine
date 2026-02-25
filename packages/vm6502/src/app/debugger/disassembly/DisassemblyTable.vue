<template>
	<table class="w-full table-fixed">
		<thead>
			<tr class="text-gray-400 sticky top-0 bg-gray-900 border-b border-gray-700 shadow-md z-10">
				<!-- Header -->
				<th class="py-1 text-center w-6"></th>
				<th class="py-1 text-center w-6"><StickyNote class="w-3 h-3 mx-auto" /></th>
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
					<DisassemblyTableLabel
						colspan="7"
						class="py-0.5 px-2 text-yellow-500 font-bold font-mono text-xs border-l-4 border-transparent"
						:line="line"
						@on-context-menu="handleContextMenu($event, line)"
					/>
				</tr>
				<tr
					@contextmenu.prevent="handleContextMenu($event, line)"
					:class="[
						'hover:bg-gray-700 transition duration-100 border-l-4',
						line.addr === address
							? 'bg-yellow-800/70 text-yellow-100 font-bold border-yellow-400'
							: 'border-transparent text-gray-300',
						isLineSelected(line.addr) ? 'bg-indigo-900/40 border-indigo-500/50' : '',
						line.addr === selectionStart || line.addr === selectionEnd ? 'bg-indigo-800/60' : '',
						contextMenu.isOpen && contextMenu.address === line.addr ? 'bg-gray-700' : '',
					]"
				>
					<td class="py-0.5 text-center">
						<button
							@click="$emit('toggleBreakpoint', line.addr)"
							class="w-full h-full flex items-center justify-center cursor-pointer group"
						>
							<span
								class="w-2 h-2 rounded-full transition-colors"
								:class="getBreakpointClass(line.addr)"
							></span>
						</button>
					</td>
					<td class="py-0.5 text-center group/note">
						<button
							@click="openNoteEditor($event, line)"
							class="w-full h-full flex items-center justify-center cursor-pointer transition-colors"
							:title="getNote(line.addr) ? 'Edit Note' : 'Add Note'"
						>
							<StickyNote
								class="w-3 h-3 transition-colors"
								:class="
									getNote(line.addr)
										? 'text-yellow-400 fill-yellow-400/20'
										: 'text-gray-700 group-hover/note:text-yellow-100'
								"
							/>
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

	<!-- Markers Context Menu (CTRL + Right Click) -->
	<div class="fixed z-50 pointer-events-none" :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }">
		<Popover :open="contextMenu.isOpen" @update:open="(val) => (contextMenu.isOpen = val)">
			<PopoverTrigger as-child>
				<div class="w-0 h-0"></div>
			</PopoverTrigger>
			<PopoverContent
				class="w-48 p-1 bg-gray-800 border-gray-700 text-gray-200 pointer-events-auto"
				align="start"
			>
				<button
					class="w-full text-left px-2 py-1.5 text-xs text-gray-200 hover:bg-gray-700 rounded flex items-center gap-2"
					@click="emitMarker('start')"
				>
					<Pin class="w-4 h-4" /> Set Start Marker
				</button>
				<button
					class="w-full text-left px-2 py-1.5 text-xs text-gray-200 hover:bg-gray-700 rounded flex items-center gap-2"
					@click="emitMarker('end')"
				>
					<Flag class="w-4 h-4" /> Set End Marker
				</button>
			</PopoverContent>
		</Popover>
	</div>

	<AddSymbolPopover
		:is-open="symbolPopover.isOpen"
		@update:is-open="(val) => (symbolPopover.isOpen = val)"
		:x="symbolPopover.x"
		:y="symbolPopover.y"
		:address="symbolPopover.address"
		:key="`sym-${symbolPopover.x}-${symbolPopover.y}`"
	/>

	<NoteEditor
		:is-open="noteEditor.isOpen"
		:x="noteEditor.x"
		:y="noteEditor.y"
		:address="noteEditor.address"
		:scope="noteEditor.scope"
		:disassembly="disassembly"
		@update:is-open="(val) => (noteEditor.isOpen = val)"
	/>
</template>

<script lang="ts" setup>
import { useKeyModifier } from "@vueuse/core";
import { inject, type Ref, ref, reactive, nextTick } from "vue";
import { StickyNote, Pin, Flag } from "lucide-vue-next";
import AddSymbolPopover from "@/components/AddSymbolPopover.vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettings } from "@/composables/useSettings";
import { useSymbols } from "@/composables/useSymbols";
import { assemble } from "@/lib/assembler";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { EmulatorRegisters } from "@/types/emulatorstate.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { BRANCH_OPCODES } from "@/lib/opcodes";
import { useNotes } from "@/composables/useNotes";
import NoteEditor from "./NoteEditor.vue";
import DisassemblyTableLabel from "./DisassemblyTableLabel.vue";

const vm = inject<Ref<VirtualMachine>>("vm");

const { registers, selectionStart, selectionEnd } = defineProps<{
	registers: EmulatorRegisters;
	disassembly: DisassemblyLine[];
	address: number;
	getBreakpointClass: (address: number) => string;
	selectionStart: number | null;
	selectionEnd: number | null;
}>();

const emit = defineEmits<{
	(e: "toggleBreakpoint", address: number): void;
	(e: "addressClick", address: number): void;
	(e: "opcodeClick", line: DisassemblyLine): void;
	(e: "setSelectionStart", address: number): void;
	(e: "setSelectionEnd", address: number): void;
}>();

const { settings } = useSettings();
const isCtrlPressed = useKeyModifier("Control");
const { getAddressForLabel } = useSymbols();
const { getNoteEntry } = useNotes();

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

	return isTaken
		? { char: "→", title: "Branch Taken", color: "text-green-400" }
		: { char: "↓", title: "Branch Not Taken", color: "text-red-400" };
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

const getNote = (addr: number) => {
	const scope = vm?.value?.getScope(addr & 0xffff) ?? "";
	return getNoteEntry(addr, scope);
};

const isLineSelected = (addr: number) => {
	if (selectionStart === null || selectionEnd === null) return false;
	const min = Math.min(selectionStart, selectionEnd);
	const max = Math.max(selectionStart, selectionEnd);
	return addr >= min && addr <= max;
};

// --- Context Menu & Label Editing ---
const contextMenu = ref({
	isOpen: false,
	x: 0,
	y: 0,
	address: 0,
});

const symbolPopover = ref({ isOpen: false, x: 0, y: 0, address: 0 });

const handleContextMenu = (event: MouseEvent, line: DisassemblyLine) => {
	if (event.ctrlKey) {
		symbolPopover.value.isOpen = false;
		contextMenu.value = {
			isOpen: true,
			x: event.clientX,
			y: event.clientY,
			address: line.addr,
		};
	} else {
		contextMenu.value.isOpen = false;
		symbolPopover.value = {
			isOpen: true,
			x: event.clientX,
			y: event.clientY,
			address: line.addr,
		};
	}
};

const emitMarker = (type: "start" | "end") => {
	if (type === "start") emit("setSelectionStart", contextMenu.value.address);
	if (type === "end") emit("setSelectionEnd", contextMenu.value.address);
	contextMenu.value.isOpen = false;
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

	const result = assemble(editingAddress.value, editText.value, (label) => getAddressForLabel(label));
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

// --- Note Editing ---
const noteEditor = reactive<{
	isOpen: boolean;
	x: number;
	y: number;
	address: number;
	scope: string;
}>({
	isOpen: false,
	x: 0,
	y: 0,
	address: 0,
	scope: "",
});

const openNoteEditor = (event: MouseEvent, line: DisassemblyLine) => {
	const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
	noteEditor.address = line.addr;
	noteEditor.scope = vm?.value?.getScope(line.addr & 0xffff) ?? "";
	noteEditor.x = rect.right + 10; // Position to the right of the icon
	noteEditor.y = Math.min(rect.top, window.innerHeight - 250); // Prevent going off-screen bottom
	noteEditor.isOpen = true;
};
</script>
