<template>
	<Drawer>
		<DrawerTrigger as-child>
			<button
				class="group flex items-center justify-center w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-600 transition-colors shrink-0"
				title="Memory Map"
			>
				<MapIcon class="h-5 w-5 text-cyan-400 group-hover:text-cyan-300" />
			</button>
		</DrawerTrigger>
		<DrawerContent class="bg-gray-900/90 text-gray-200 border-gray-700 backdrop-blur-sm">
			<div class="container mx-auto py-8">
				<DrawerHeader class="text-center -mt-4 mb-4">
					<DrawerTitle class="text-white text-2xl font-bold">Memory Map</DrawerTitle>
				</DrawerHeader>
				<MemoryMapContainer />
			</div>
		</DrawerContent>
	</Drawer>
</template>

<script lang="ts" setup>
import { Map as MapIcon } from "lucide-vue-next";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import MemoryMapContainer from "./MemoryMapContainer.vue";
</script>
