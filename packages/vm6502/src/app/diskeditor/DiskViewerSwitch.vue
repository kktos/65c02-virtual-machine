<template>
	<div class="flex rounded border border-gray-700 overflow-hidden text-xs" title="How the bytes are shown">
		<button
			v-for="v in DISK_VIEWERS"
			:key="v.id"
			class="px-2 py-0.5 transition-colors"
			:class="
				viewer === v.id ? 'bg-cyan-900/50 text-cyan-200' : 'text-gray-400 hover:text-cyan-300 hover:bg-gray-800'
			"
			:title="v.title"
			@click="viewer = v.id"
		>
			{{ v.label }}
		</button>
	</div>
</template>

<script lang="ts" setup>
import { DISK_VIEWERS, useDiskEditor } from "@/composables/useDiskEditor";

const { viewer } = useDiskEditor();
</script>
