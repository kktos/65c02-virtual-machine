<template>
	<div
		:style="{ 'border-color': getScopeColor(line.addr), color: settings.disassembly.syntax.label }"
		:title="line.src + '[' + vm?.getScope(line.addr) + ']'"
		@click.stop="handleClick($event)"
		@dblclick="handleDblClick"
		class="col-span-full border-l-3 cursor-pointer hover:bg-gray-800/50"
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
					class="bg-black font-bold font-mono text-xs border border-blue-500 px-1 h-5 w-full focus:outline-none"
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
		<template v-else>
			<div class="p-0.5 pl-1 font-bold">{{ line.label }}:</div>
		</template>
	</div>
</template>

<script lang="ts" setup>
import { useSettings } from "@/composables/useSettings";
import { useSymbols } from "@/composables/useSymbols";
import type { DisassemblyLine } from "@/types/disassemblyline.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { inject, nextTick, ref, type Ref } from "vue";

const props = defineProps<{
	line: DisassemblyLine;
}>();

const emit = defineEmits<{
	(e: "onLabelClick", event: MouseEvent, line: DisassemblyLine): void;
}>();

const vm = inject<Ref<VirtualMachine>>("vm");
const { settings } = useSettings();
const { addSymbol, removeSymbol, getSymbolForAddress, updateSymbol } = useSymbols();

const editingLabelAddress = ref<number | null>(null);
const editLabelText = ref("");
const originalLabel = ref("");
const labelError = ref("");
const editLabelInputRef = ref<HTMLInputElement | null>(null);
const clickTimeout = ref<number | null>(null);

const handleClick = (event: MouseEvent) => {
	if (clickTimeout.value !== null) {
		window.clearTimeout(clickTimeout.value);
	}
	clickTimeout.value = window.setTimeout(() => {
		emit("onLabelClick", event, props.line);
		clickTimeout.value = null;
	}, 200);
};

const handleDblClick = () => {
	if (clickTimeout.value !== null) {
		window.clearTimeout(clickTimeout.value);
		clickTimeout.value = null;
	}
	startLabelEdit(props.line);
};

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
