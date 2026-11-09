<template>
	<!-- The "Add" action lives in the host (BreakpointsDrawer header), which calls the exposed createBreakpoint() -->
	<div class="flex flex-col h-full">
		<ScrollArea class="flex-1 min-h-0 w-full" type="always">
			<ul class="space-y-1.5 text-sm text-gray-300 p-1.5 min-h-full">
				<li v-if="breakpoints.length === 0" class="text-gray-500 italic p-2 text-center">
					No active breakpoints.
				</li>
				<li
					v-for="(bp, index) in breakpoints"
					:key="bp.address + bp.type + index"
					:class="[
						'flex items-stretch bg-gray-800 hover:bg-gray-700/80 transition duration-100 font-mono overflow-hidden',
					]"
				>
					<Popover
						:open="isEditing(bp, 'type')"
						@update:open="(open: boolean) => (open ? startEditing(bp, 'type') : cancelEdit())"
					>
						<PopoverTrigger as-child>
							<button
								type="button"
								:class="[
									'flex items-center justify-center w-15 text-xs font-bold text-white cursor-pointer outline-none',
									getTypeStyles(bp.type).bg,
									inactiveClass(bp),
								]"
								:disabled="!bp.enabled"
								:title="bp.command ? `Hook on ${bp.type}${bp.once ? ' (once)' : ''}` : bp.type"
							>
								<span
									class="tracking-wider uppercase flex flex-col items-center hover:scale-110 transition-transform"
								>
									{{ bp.type }}<FishingHook v-if="bp.command" class="w-4 h-4" />
								</span>
							</button>
						</PopoverTrigger>
						<PopoverContent
							align="start"
							:side-offset="2"
							class="w-15 p-0 border-0 bg-transparent rounded-none overflow-hidden shadow-lg shadow-black/50 flex flex-col"
							@open-auto-focus="focusCurrentType"
							@keydown="onTypeMenuKeydown"
						>
							<button
								v-for="type in BREAKPOINT_TYPES"
								:key="type"
								type="button"
								:data-type="type"
								:class="[
									'flex items-center justify-center py-1.5 text-xs font-bold text-white font-mono cursor-pointer outline-none',
									'hover:brightness-125 focus-visible:brightness-125',
									getTypeStyles(type).bg,
									type === bp.type ? 'ring-1 ring-inset ring-white/70' : '',
								]"
								@click="selectType(bp, type)"
							>
								<span class="tracking-wider uppercase">{{ type }}</span>
							</button>
						</PopoverContent>
					</Popover>
					<div class="flex-1 min-w-0 flex flex-col pl-3 pr-2 py-0.5">
						<div class="flex items-center gap-3">
							<input
								type="checkbox"
								:checked="bp.enabled"
								@change="handleToggleEnable(bp)"
								:class="!bp.enabled && 'opacity-60'"
								class="form-checkbox h-4 w-4 text-cyan-600 transition duration-150 ease-in-out bg-gray-700 border-gray-500 rounded focus:ring-offset-gray-900 cursor-pointer focus:ring-cyan-500"
								title="Enable/Disable Breakpoint"
							/>
							<div v-if="isEditing(bp, 'address')" class="flex items-center">
								<input
									ref="editInput"
									v-model="editValue"
									class="bg-gray-900/90 px-1 py-0 rounded-sm text-indigo-200 font-mono text-sm w-36 focus:ring-1 focus:ring-indigo-400 focus:outline-none border border-indigo-700"
									@blur="saveEdit(bp)"
									@keydown.enter.prevent="saveEdit(bp)"
									@keydown.esc.prevent="cancelEdit"
								/>
							</div>
							<span
								v-else
								:class="inactiveClass(bp)"
								class="text-indigo-300 cursor-pointer hover:text-white border-b border-transparent hover:border-indigo-500/50 transition-colors w-36 inline-block px-1 font-mono text-sm truncate"
								@click="startEditing(bp, 'address')"
							>
								{{ formatAddress(bp.address) }}
								<span v-if="bp.endAddress && bp.endAddress !== bp.address">
									{{ formatAddress(bp.endAddress) }}
								</span>
							</span>
							<button
								v-if="!bp.command && !isEditing(bp, 'command')"
								:disabled="!bp.enabled"
								:class="inactiveClass(bp)"
								@click="startEditing(bp, 'command')"
								title="Add hook command"
								class="p-1 rounded-full hover:bg-gray-900/70 transition-colors"
							>
								<FishingHook class="w-4 h-4 text-gray-500 hover:text-cyan-400" />
							</button>
							<button
								@click="handleRemoveBreakpoint(bp)"
								class="ml-auto text-red-500 hover:text-red-400 text-lg p-1"
								title="Remove Breakpoint"
							>
								&times;
							</button>
						</div>
						<!-- Hook on its own full-width line: it can be a multi-line script (executeCommand runs it line by line) -->
						<div v-if="isEditing(bp, 'command')" class="pb-1.5">
							<textarea
								ref="editInput"
								v-model="editValue"
								rows="1"
								spellcheck="false"
								placeholder="Command(s) to run on hit, one per line"
								class="block w-full resize-none overflow-hidden bg-gray-900/90 px-1.5 py-1 text-cyan-200 font-mono text-xs leading-4 focus:ring-1 focus:ring-cyan-400 focus:outline-none border border-cyan-700 placeholder:text-gray-500"
								title="Ctrl/Cmd+Enter to save, Esc to cancel"
								@input="autosize"
								@blur="saveEdit(bp)"
								@keydown.enter.meta.prevent="saveEdit(bp)"
								@keydown.enter.ctrl.prevent="saveEdit(bp)"
								@keydown.esc.prevent="cancelEdit"
							/>
						</div>
						<pre
							v-else-if="bp.command"
							:class="inactiveClass(bp)"
							class="mb-1.5 px-1.5 py-1 font-mono text-xs leading-4 text-cyan-200 whitespace-pre-wrap break-all cursor-pointer bg-gray-900/40 hover:bg-gray-900 border border-transparent hover:border-cyan-700/60"
							title="Click to edit hook command"
							@click="startEditing(bp, 'command')"
							>{{ bp.command }}</pre>
					</div>
				</li>
			</ul>
		</ScrollArea>
	</div>
</template>

<script lang="ts" setup>
import { inject, type Ref, watch, ref, nextTick } from "vue";
import { useBreakpoints, type BreakpointState } from "@/composables/useBreakpoints";
import type { Breakpoint } from "@/types/breakpoint.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatAddress, toHex } from "@/lib/hex.utils";
import { FishingHook } from "lucide-vue-next";

const vm = inject<Ref<VirtualMachine>>("vm");

const {
	breakpoints,
	addBreakpoint,
	removeBreakpoint,
	toggleBreakpointEnable,
	updateBreakpointCommand,
	getBreakpointKey,
} = useBreakpoints();

const editingBpKey = ref<string | null>(null);
type EditField = "type" | "address" | "command";

const editingField = ref<EditField | null>(null);
const editValue = ref("");
const editInput = ref<(HTMLInputElement | HTMLTextAreaElement)[] | null>(null);

const isEditing = (bp: BreakpointState, field: EditField) =>
	editingBpKey.value === getBreakpointKey(bp) && editingField.value === field;

// Grow the hook textarea with its content
const autosize = (event: Event) => fitHeight(event.target as HTMLTextAreaElement);
const fitHeight = (el: HTMLTextAreaElement) => {
	el.style.height = "auto";
	el.style.height = `${el.scrollHeight}px`;
};

const BREAKPOINT_TYPES = ["pc", "read", "write", "access"] as const satisfies readonly Breakpoint["type"][];

const selectType = (bp: BreakpointState, type: Breakpoint["type"]) => {
	editValue.value = type;
	saveEdit(bp);
};

const focusCurrentType = (event: Event) => {
	event.preventDefault();
	const menu = event.target as HTMLElement;
	const current = menu.querySelector<HTMLButtonElement>(`[data-type="${editValue.value}"]`);
	(current ?? menu.querySelector<HTMLButtonElement>("button"))?.focus();
};

const onTypeMenuKeydown = (event: KeyboardEvent) => {
	if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
	event.preventDefault();
	const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("button")];
	const index = items.indexOf(document.activeElement as HTMLButtonElement);
	const delta = event.key === "ArrowDown" ? 1 : -1;
	items[(index + delta + items.length) % items.length]?.focus();
};

// Breakpoints are loaded into each new VM by useMachine, so this list can mount/unmount freely (drawer).

watch(editingBpKey, (newKey) => {
	if (newKey) {
		nextTick(() => {
			const el = editInput.value?.[0];
			if (!el) return;
			el.focus();
			if (el instanceof HTMLTextAreaElement) {
				fitHeight(el);
				el.setSelectionRange(el.value.length, el.value.length);
			}
		});
	}
});

const createBreakpoint = () => {
	const newBp = {
		address: 0,
		type: "pc",
		enabled: true,
	} satisfies Breakpoint;
	addBreakpoint(newBp, vm?.value);
	nextTick(() => startEditing(newBp, "address"));
};

defineExpose({ createBreakpoint });

// A disabled breakpoint only keeps its enable toggle and delete button interactive.
const inactiveClass = (bp: BreakpointState) => (bp.enabled ? "" : "opacity-60 pointer-events-none");

const startEditing = (bp: BreakpointState, field: EditField) => {
	if (!bp.enabled) return;
	editingBpKey.value = getBreakpointKey(bp);
	editingField.value = field;
	switch (field) {
		case "command":
			editValue.value = bp.command || "";
			break;
		case "address":
			editValue.value = toHex(bp.address);
			if (bp.endAddress && bp.endAddress !== bp.address) {
				editValue.value += "-" + toHex(bp.endAddress);
			}
			break;
		case "type":
			editValue.value = bp.type;
			break;
	}
};

const cancelEdit = () => {
	editingBpKey.value = null;
	editingField.value = null;
	editValue.value = "";
};

const saveEdit = (bp: BreakpointState) => {
	if (editingBpKey.value === getBreakpointKey(bp)) {
		switch (editingField.value) {
			case "command":
				updateBreakpointCommand(bp, editValue.value);
				break;
			case "address": {
				const cleanVal = editValue.value.replace(/[$:]/g, "").trim();
				const parts = cleanVal.split("-");
				let newAddr = parseInt(parts[0], 16);
				let newEnd = newAddr;
				if (parts.length > 1 && parts[1].trim()) {
					const endVal = parseInt(parts[1], 16);
					if (!Number.isNaN(endVal)) {
						newEnd = Math.max(newAddr, endVal);
						newAddr = Math.min(newAddr, endVal);
					}
				}

				if (!Number.isNaN(newAddr) && (newAddr !== bp.address || newEnd !== (bp.endAddress ?? bp.address))) {
					removeBreakpoint(bp, vm?.value);
					bp.address = newAddr;
					bp.endAddress = newEnd !== newAddr ? newEnd : undefined;
					addBreakpoint(bp, vm?.value);
				}
				break;
			}
			case "type": {
				if (editValue.value === bp.type) break;
				removeBreakpoint(bp, vm?.value);
				bp.type = editValue.value as Breakpoint["type"];
				addBreakpoint(bp, vm?.value);
				break;
			}
		}

		cancelEdit();
	}
};

const handleRemoveBreakpoint = (bp: Breakpoint) => removeBreakpoint(bp, vm?.value);
const handleToggleEnable = (bp: Breakpoint) => toggleBreakpointEnable(bp, vm?.value);

const getTypeStyles = (type: Breakpoint["type"]) => {
	switch (type) {
		case "pc":
			return { bg: "bg-indigo-700" };
		case "write":
			return { bg: "bg-red-700" };
		case "read":
			return { bg: "bg-yellow-700" };
		case "access":
			return { bg: "bg-green-700" };
		default:
			return { bg: "bg-gray-700" };
	}
};
</script>
