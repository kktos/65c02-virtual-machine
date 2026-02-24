<template>
	<Dialog :open="modelValue" @update:open="(value) => emit('update:modelValue', value)">
		<DialogContent
			overlayClass="bg-transparent"
			:showCloseButton="false"
			class="sm:max-w-lg bg-gray-900 border-gray-700 text-gray-200"
		>
			<DialogTitle><DialogDescription /></DialogTitle>
			<div class="relative">
				<input
					ref="inputRef"
					v-model="command"
					@keydown.enter="execute"
					type="text"
					:disabled="isLoading"
					placeholder="Enter command (e.g., A=$10)..."
					class="w-full bg-gray-950 text-green-400 font-mono p-1 rounded border border-gray-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none disabled:opacity-50"
				/>
				<Loader2
					v-if="isLoading"
					class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400"
				/>
			</div>
			<div v-if="error" class="mt-2 text-red-400 text-sm font-mono whitespace-pre-wrap">{{ error }}</div>
			<div v-if="success" class="mt-2 text-green-400 text-sm font-mono whitespace-pre-wrap">{{ success }}</div>

			<div v-if="progress > 0" class="w-full bg-gray-700 rounded-full h-1.5 mt-2">
				<div class="bg-cyan-600 h-1.5 rounded-full" :style="{ width: progress + '%' }"></div>
			</div>

			<DialogFooter class="text-xs text-gray-500 sm:justify-start pt-2">
				Press <kbd class="bg-gray-800 px-1 rounded">Enter</kbd> to execute,
				<kbd class="bg-gray-800 px-1 rounded">Esc</kbd> to close.
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { inject, nextTick, ref, watch, type Ref } from "vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-vue-next";
import {
	REG_A_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
} from "../../virtualmachine/cpu/shared-memory";
import type { VirtualMachine } from "../../virtualmachine/virtualmachine.class";
import DialogTitle from "@/components/ui/dialog/DialogTitle.vue";
import { generateLabels } from "../../lib/disassembler";
import { toHex } from "@/lib/hex.utils";

const props = defineProps<{
	modelValue: boolean;
}>();

const emit = defineEmits<{
	(e: "update:modelValue", value: boolean): void;
}>();

const vm = inject<Ref<VirtualMachine | null>>("vm");
const command = ref("");
const error = ref("");
const success = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const isLoading = ref(false);
const progress = ref(0);

watch(
	() => props.modelValue,
	(newVal) => {
		if (newVal) {
			// on open
			nextTick(() => {
				inputRef.value?.focus();
			});
		} else {
			// on close, reset state
			error.value = "";
			success.value = "";
			isLoading.value = false;
			progress.value = 0;
		}
	},
);

type ParamType = "byte" | "word" | "string";
type ParamDef = ParamType | `${ParamType}?`;
type ParamList = (string | number | undefined)[];
type Command = {
	description: string;
	paramDef: ParamDef[];
	fn: (vm: VirtualMachine, params: ParamList) => string | Promise<string>;
};

const parseValue = (valStr: string, max: number): number => {
	const isHex = valStr.startsWith("$");
	const value = parseInt(isHex ? valStr.slice(1) : valStr, isHex ? 16 : 10);

	if (Number.isNaN(value)) {
		throw new Error(`Invalid value: ${valStr}`);
	}

	if (value > max) {
		throw new Error(`Value exceeds range (max $${max.toString(16).toUpperCase()})`);
	}

	return value;
};

const COMMAND_LIST = {
	"A=": {
		description: "Set value to Accumulator",
		paramDef: ["byte"],
		fn: (vm: VirtualMachine, params: ParamList) => {
			const val = params[0] as number;
			vm.sharedRegisters.setUint8(REG_A_OFFSET, val);
			return `Register A set to $${toHex(val)}`;
		},
	},
	"X=": {
		description: "Set value to X register",
		paramDef: ["byte"],
		fn: (vm: VirtualMachine, params: ParamList) => {
			const val = params[0] as number;
			vm.sharedRegisters.setUint8(REG_X_OFFSET, val);
			return `Register X set to $${toHex(val)}`;
		},
	},
	"Y=": {
		description: "Set value to Y register",
		paramDef: ["byte"],
		fn: (vm: VirtualMachine, params: ParamList) => {
			const val = params[0] as number;
			vm.sharedRegisters.setUint8(REG_Y_OFFSET, val);
			return `Register Y set to $${toHex(val)}`;
		},
	},
	"PC=": {
		description: "Set value to PC register",
		paramDef: ["word"],
		fn: (vm: VirtualMachine, params: ParamList) => {
			const val = params[0] as number;
			vm.sharedRegisters.setUint16(REG_PC_OFFSET, val, true);
			return `Register PC set to $${toHex(val, 4)}`;
		},
	},
	"SP=": {
		description: "Set value to Stack Pointer",
		paramDef: ["byte"],
		fn: (vm: VirtualMachine, params: ParamList) => {
			const val = params[0] as number;
			vm.sharedRegisters.setUint8(REG_SP_OFFSET, val);
			return `Register SP set to $${toHex(val)}`;
		},
	},
	GL: {
		description: "Generate labels for a memory range. Params: <from> <to> [scope]",
		paramDef: ["word", "word", "string?"],
		fn: async (vm: VirtualMachine, params: (string | number | undefined)[]) => {
			const from = params[0] as number;
			const to = params[1] as number;
			const scope = (params[2] as string) || vm.getScope(from);

			if (from >= to) throw new Error("'from' address must be less than 'to' address.");

			await generateLabels(
				from,
				scope,
				to,
				(addr) => vm.read(addr),
				(p) => {
					progress.value = p;
				},
			);
			return `Labels generated for $${toHex(from, 4)}-$${toHex(to, 4)} ('${scope}')`;
		},
	},
	HELP: {
		description: "Lists all available commands.",
		paramDef: [],
		fn: (_vm: VirtualMachine, _params: (string | number | undefined)[]) => {
			const commandHelp: string = typedKeys(COMMAND_LIST)
				.sort()
				.map((key) => {
					const cmd = COMMAND_LIST[key];
					return `${key.padEnd(8)} ${cmd.description}`;
				})
				.join("\n");
			return `Available commands:\n${commandHelp}`;
		},
	},
} satisfies Record<string, Command>;

function typedKeys<T extends object>(obj: T): (keyof T)[] {
	return Object.keys(obj) as (keyof T)[];
}

const execute = async () => {
	if (!vm?.value) {
		error.value = "Virtual Machine not initialized.";
		return;
	}

	if (isLoading.value) return;

	const cmdInput = command.value.trim().toUpperCase();
	if (!cmdInput) return;

	isLoading.value = true;
	progress.value = 0;
	error.value = "";
	success.value = "";

	// Find command
	const cmdKey = typedKeys(COMMAND_LIST).find((key) => cmdInput.startsWith(key));

	try {
		if (cmdKey) {
			const commandDef = COMMAND_LIST[cmdKey];
			const paramStr = cmdInput.slice(cmdKey.length).trim();
			const paramsAsStr = paramStr.length > 0 ? paramStr.split(/\s+/) : [];

			const requiredParams = commandDef.paramDef.filter((p) => !p.endsWith("?")).length;
			const maxParams = commandDef.paramDef.length;

			if (paramsAsStr.length < requiredParams || paramsAsStr.length > maxParams) {
				throw new Error(
					`Invalid parameters. Expected ${requiredParams}${
						requiredParams !== maxParams ? `-${maxParams}` : ""
					}, got ${paramsAsStr.length}.`,
				);
			}

			const params: (string | number)[] = [];
			for (let i = 0; i < paramsAsStr.length; i++) {
				const param = paramsAsStr[i] as string;
				let paramDef = commandDef.paramDef[i] as ParamDef;
				if (paramDef.endsWith("?")) paramDef = paramDef.slice(0, -1) as ParamType;

				if (paramDef === "byte") params.push(parseValue(param, 0xff));
				else if (paramDef === "word") params.push(parseValue(param, 0xffff));
				else if (paramDef === "string") params.push(param);
				else throw `Unknown parameter type: ${paramDef}`;
			}
			success.value = await commandDef.fn(vm?.value, params);
			command.value = "";
		} else {
			throw new Error("Unknown command");
		}
	} catch (e: any) {
		error.value = e.message || "Execution failed";
	} finally {
		isLoading.value = false;
	}
};
</script>
