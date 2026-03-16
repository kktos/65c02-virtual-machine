<template>
	<Popover v-model:open="isSearchOpen">
		<PopoverTrigger as-child>
			<Button variant="ghost" size="icon" class="h-6 w-6 text-gray-400 hover:text-cyan-300" title="Search Memory">
				<Search class="h-4 w-4" />
			</Button>
		</PopoverTrigger>
		<PopoverContent class="w-80 p-3 bg-gray-800 border-gray-700" align="end">
			<div class="flex flex-col space-y-3">
				<div class="flex items-center space-x-2">
					<select
						v-model="searchMode"
						class="bg-gray-900 text-xs text-gray-200 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
					>
						<option value="hex">Hex</option>
						<option value="text_lo">Text (bit7=0)</option>
						<option value="text_hi">Text (bit7=1)</option>
						<option value="text_any">Text (Any)</option>
					</select>
					<input
						v-model="searchQuery"
						@keydown.enter="performSearch(1)"
						type="text"
						class="flex-1 bg-gray-900 text-xs text-gray-200 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
						:placeholder="searchMode === 'hex' ? 'e.g. A9 00' : 'Text...'"
					/>
				</div>
				<div class="flex items-center space-x-2">
					<input
						type="checkbox"
						id="searchAllBanks"
						v-model="searchAllBanks"
						class="rounded bg-gray-900 border-gray-600 text-cyan-500 focus:ring-cyan-500 h-3 w-3"
					/>
					<label for="searchAllBanks" class="text-xs text-gray-300 cursor-pointer select-none"
						>Search All Banks</label
					>
				</div>
				<div v-if="searchError" class="text-[10px] text-red-400">
					{{ searchError }}
				</div>
				<div class="flex justify-end space-x-2">
					<Button size="sm" variant="secondary" class="h-7 text-xs" @click="performSearch(-1)">Prev</Button>
					<Button
						size="sm"
						class="h-7 text-xs bg-cyan-600 hover:bg-cyan-500 text-white"
						@click="performSearch(1)"
						>Next</Button
					>
				</div>
			</div>
		</PopoverContent>
	</Popover>
</template>

<script lang="ts" setup>
import { Search } from "lucide-vue-next";
import { inject, ref, type Ref } from "vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

const props = defineProps<{
	currentAddress: number;
}>();

const emit = defineEmits<{
	(e: "searching"): void;
	(e: "found", payload: { address: number; length: number; location: string }): void;
}>();

const vm = inject<Ref<VirtualMachine>>("vm");

const isSearchOpen = ref(false);
const searchQuery = ref("");
const searchMode = ref<"hex" | "text_lo" | "text_hi" | "text_any">("hex");
const searchAllBanks = ref(false);
const searchError = ref("");

const performSearch = (direction: 1 | -1) => {
	emit("searching");
	searchError.value = "";
	if (!searchQuery.value || !vm?.value) return;

	let searchBytes: Uint8Array;

	if (searchMode.value === "hex") {
		const clean = searchQuery.value.replace(/\s+/g, "");
		if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
			searchError.value = "Invalid Hex";
			return;
		}
		searchBytes = new Uint8Array(clean.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
	} else {
		searchBytes = new Uint8Array(
			[...searchQuery.value].map((char) => {
				const charCode = char.charCodeAt(0) & 0x7f;
				return searchMode.value === "text_hi" ? charCode | 0x80 : charCode;
			}),
		);
	}

	if (searchBytes.length === 0) return;

	const banks = vm.value.machineConfig.memory.banks || 1;
	const totalMemory = banks * 0x10000;
	const rangeStart = searchAllBanks.value ? 0 : props.currentAddress & 0xff0000;
	const rangeEnd = searchAllBanks.value ? totalMemory - 1 : (props.currentAddress & 0xff0000) | 0xffff;
	const is7Bit = searchMode.value === "text_any";
	const results = vm.value.search(searchBytes, rangeStart, rangeEnd, is7Bit);

	if (!results || results.length === 0) {
		searchError.value = searchAllBanks.value ? "Not found in memory" : "Not found in current bank";
		return;
	}

	const currentAddr = props.currentAddress;
	let found =
		direction === 1
			? results.find((r) => r.address > currentAddr)
			: [...results].reverse().find((r) => r.address < currentAddr);
	if (!found) {
		found = direction === 1 ? results[0] : results[results.length - 1];
	}

	emit("found", { address: found!.address, length: searchBytes.length, location: found!.location });
};
</script>
