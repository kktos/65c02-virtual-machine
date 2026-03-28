import type { DisassemblyComment } from "@/types/disassemblyline.interface";
import { reactive, ref } from "vue";

const comments = reactive<Record<number, DisassemblyComment[]>>({});
const editingBlockCommentAddr = ref<number | null>(null);

export function useComments() {
	function addComment(address: number, kind: "inline" | "block", comment: string) {
		if (!comments[address]) comments[address] = [];
		comments[address].push({ kind, text: comment });
	}

	function getBothComments(address: number): [string, string] {
		const result = ["", ""] as [string, string];
		const list = comments[address] || [];
		for (let idx = 0; idx < list.length; idx++) {
			if (list[idx].kind === "block") result[1] = list[idx].text;
			else result[0] = list[idx].text;
		}
		return result;
	}

	function getBlockComment(address: number): string | undefined {
		let list = comments[address] || [];
		list = list.filter((c) => c.kind === "block");
		return list[0]?.text;
	}

	// function getInlineComment(address: number): string | undefined {
	// 	let list = comments[address] || [];
	// 	list = list.filter((c) => c.kind === "inline");
	// 	return list[0]?.text;
	// }

	function updateComment(address: number, kind: "inline" | "block", comment: string) {
		if (!comments[address]) return;
		const index = comments[address].findIndex((c) => c.kind === kind);
		if (index !== -1) comments[address][index] = { kind, text: comment };
	}

	function clearComments(address: number) {
		delete comments[address];
	}

	return {
		comments,
		addComment,
		updateComment,
		clearComments,
		// getInlineComment,
		getBlockComment,
		getBothComments,
		editingBlockCommentAddr,
	};
}
