<template>
	<TableRow v-if="editingRule" class="bg-gray-700/50 hover:bg-gray-700/50">
		<TableCell class="align-top">
			<div>
				<Input
					v-model="editingRule.address"
					placeholder="$C000"
					class="h-8 bg-gray-900 border-gray-600 font-mono"
					:class="{ 'border-red-500': validationErrors.address }"
				/>
				<p class="text-red-400 text-xs mt-1 h-4" :class="{ invisible: !validationErrors.address }">
					{{ validationErrors.address || "Error" }}
				</p>
			</div>
		</TableCell>
		<TableCell class="align-top">
			<select
				v-model="editingRule.type"
				class="h-8 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-200 focus:outline-none"
			>
				<option>byte</option>
				<option>word</option>
				<option>string</option>
			</select>
		</TableCell>
		<TableCell class="align-top">
			<div>
				<Input
					v-model.number="editingRule.length"
					type="number"
					min="1"
					class="h-8 bg-gray-900 border-gray-600"
					:class="{ 'border-red-500': validationErrors.length }"
				/>
				<p class="text-red-400 text-xs mt-1 h-4" :class="{ invisible: !validationErrors.length }">
					{{ validationErrors.length || "Error" }}
				</p>
			</div>
		</TableCell>
		<TableCell class="align-top pt-3">
			<div class="font-mono text-xs text-gray-400 truncate max-w-[150px]">
				{{ getPreview(editingRule) }}
			</div>
		</TableCell>
		<TableCell class="align-top">
			<Input v-model="editingRule.group" placeholder="user" class="h-8 bg-gray-900 border-gray-600" />
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
import { useFormattingEditing } from "@/composables/useFormattingEditing";

const { editingRule, validationErrors, getPreview, saveEdit, cancelEdit } = useFormattingEditing();
</script>
