<template>
	<TableRow v-if="editingSymbol" class="bg-gray-700/50 hover:bg-gray-700/50">
		<TableCell />
		<TableCell class="align-top">
			<Input v-model="editingSymbol.ns" placeholder="user" class="h-8 bg-gray-900 border-gray-600" />
		</TableCell>
		<TableCell class="align-top">
			<div>
				<Input
					v-model="editingSymbol.label"
					placeholder="LABEL_NAME"
					class="h-8 bg-gray-900 border-gray-600"
					:class="{ 'border-red-500': validationErrors.label }"
				/>
				<p class="text-red-400 text-xs mt-1 h-4" :class="{ invisible: !validationErrors.label }">
					{{ validationErrors.label || "Error" }}
				</p>
			</div>
		</TableCell>
		<TableCell class="align-top">
			<div>
				<Input
					v-model="editingSymbol.addr"
					placeholder="$C000"
					class="h-8 bg-gray-900 border-gray-600 font-mono"
					:class="{ 'border-red-500': validationErrors.addr }"
				/>
				<p class="text-red-400 text-xs mt-1 h-4" :class="{ invisible: !validationErrors.addr }">
					{{ validationErrors.addr || "Error" }}
				</p>
			</div>
		</TableCell>
		<TableCell class="align-top">
			<select
				v-model="editingSymbol.scope"
				class="h-8 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-200 focus:outline-none"
			>
				<option v-for="scope in availableScopes" :key="scope" :value="scope">
					{{ scope }}
				</option>
			</select>
		</TableCell>
		<TableCell v-if="shouldDisplayDisk" class="align-top">
			<Input
				v-if="!editingSymbol.isNew"
				:value="editingSymbol.disk"
				class="h-8 bg-gray-900 border-gray-600"
				disabled
				title="Disk cannot be changed"
			/>
		</TableCell>
		<TableCell class="text-right align-top">
			<div class="flex items-center justify-end gap-1 mt-1">
				<button @click="saveEdit" class="p-1 text-green-400 hover:bg-gray-600 rounded" title="Save">
					<Check class="h-4 w-4" />
				</button>
				<button @click="cancelEdit" class="p-1 text-red-400 hover:bg-gray-600 rounded" title="Cancel">
					<X class="h-4 w-4" />
				</button>
			</div>
		</TableCell>
	</TableRow>
</template>

<script setup lang="ts">
import { Check, X } from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { useSymbolEditing } from "../../../composables/useSymbolEditing";

defineProps<{
	shouldDisplayDisk: boolean;
}>();

const { editingSymbol, validationErrors, availableScopes, saveEdit, cancelEdit } = useSymbolEditing();
</script>
