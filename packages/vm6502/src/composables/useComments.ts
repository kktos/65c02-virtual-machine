import type { DisassemblyComment } from "@/types/disassemblyline.interface";
import { reactive } from "vue";

const comments = reactive<Record<number, DisassemblyComment[]>>({});

export function useComments() {
	function addComment(address: number, comment: DisassemblyComment) {
		if (!comments[address]) comments[address] = [];
		comments[address].push(comment);
	}

	function getComments(address: number): DisassemblyComment[] {
		return comments[address] || [];
	}

	function updateComment(address: number, comment: DisassemblyComment) {
		if (!comments[address]) return;
		const index = comments[address].findIndex((c) => c.source === comment.source && c.kind === comment.kind);
		if (index !== -1) comments[address][index] = comment;
	}

	function clearComments(address: number) {
		delete comments[address];
	}

	return {
		comments,
		addComment,
		getComments,
		updateComment,
		clearComments,
	};
}
