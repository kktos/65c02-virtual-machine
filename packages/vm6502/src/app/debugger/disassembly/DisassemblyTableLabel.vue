<template>
	<td
		:style="{ color: getScopeColor(line.addr) }"
		@contextmenu.prevent="$emit('onContextMenu', $event, line)"
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
</template>

<script lang="ts" setup>
import { useSettings } from "@/composables/useSettings";
import { useSymbols } from "@/composables/useSymbols";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { inject, nextTick, ref, type Ref } from "vue";

defineProps<{
	line: DisassemblyLine;
}>();

defineEmits<{
	(e: "onContextMenu", event: MouseEvent, line: DisassemblyLine): void;
}>();

const vm = inject<Ref<VirtualMachine>>("vm");
const { settings } = useSettings();
const { addSymbol, removeSymbol, getSymbolForAddress, updateSymbol } = useSymbols();

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

const commitLabelEdit = async () => {
	if (editingLabelAddress.value === null) return;
	const addr = editingLabelAddress.value;
	const newLabel = editLabelText.value.trim();
	const oldLabel = originalLabel.value;

	const existingSymbol = getSymbolForAddress(addr);

	if (!newLabel) {
		if (existingSymbol?.id) {
			await removeSymbol(existingSymbol.id);
		}
		cancelLabelEdit();
		return;
	}

	if (newLabel === oldLabel || !existingSymbol) {
		cancelLabelEdit();
		return;
	}

	if (existingSymbol.id) {
		await updateSymbol(existingSymbol.id, addr, newLabel, existingSymbol.ns, existingSymbol.scope);
	} else {
		await addSymbol(addr, newLabel, existingSymbol.ns, existingSymbol.scope);
	}
	cancelLabelEdit();
};

const getScopeColor = (addr: number) => {
	const scope = vm?.value?.getScope(addr & 0xffff);
	if (!scope) return "";
	const color = settings.disassembly.scopeColors[scope];
	// If color is black or transparent, use default class
	if (!color || color === "#000000" || color === "#00000000") return "";
	return color;
};
</script>
