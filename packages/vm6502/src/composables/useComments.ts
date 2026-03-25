import type { DisassemblyComment } from "@/types/disassemblyline.interface";
import { reactive } from "vue";

// Global state for comments to persist across re-renders
const comments = reactive<Record<number, DisassemblyComment[]>>({});

export function useComments() {
	function addComment(address: number, comment: DisassemblyComment) {
		if (!comments[address]) {
			comments[address] = [];
		}
		comments[address].push(comment);
	}

	function getComments(address: number): DisassemblyComment[] {
		return comments[address] || [];
	}

	function clearComments(address: number) {
		delete comments[address];
	}

	return {
		comments,
		addComment,
		getComments,
		clearComments,
	};
}
