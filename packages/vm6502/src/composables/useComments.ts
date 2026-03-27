import type { DisassemblyComment } from "@/types/disassemblyline.interface";
import { reactive, ref } from "vue";

const comments = reactive<Record<number, DisassemblyComment[]>>({});
const editingBlockCommentAddr = ref<number | null>(null);

export function useComments() {
	function addComment(address: number, comment: DisassemblyComment) {
		if (!comments[address]) comments[address] = [];
		comments[address].push(comment);
	}

	function getComments(address: number): DisassemblyComment[] {
		return comments[address] || [];
	}

	function getBlockComment(address: number): DisassemblyComment | undefined {
		let list = comments[address] || [];
		list = list.filter((c) => c.kind === "block");
		return list[0];
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
		getBlockComment,
		editingBlockCommentAddr,
	};
}
