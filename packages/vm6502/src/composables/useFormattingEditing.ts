import { inject, type Ref, ref } from "vue";
import { type DataBlock, useFormatting } from "@/composables/useDataFormattings";
import { toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

// Shared state (module-scoped to allow sharing between components without props)
const editingRule = ref<(DataBlock & { isNew?: boolean; originalAddress?: number; originalGroup?: string }) | null>(
	null,
);
const validationErrors = ref({
	address: "",
	length: "",
});

const { addFormatting, removeFormat } = useFormatting();

export function useFormattingEditing() {
	const vm = inject<Ref<VirtualMachine>>("vm");

	const getPreview = (rule: { address: number | string; length: number | string; type: string } | null) => {
		if (!vm?.value || !rule) return "";

		let addr = Number(rule.address);
		if (typeof rule.address === "string") {
			const clean = rule.address.replace("$", "");
			addr = parseInt(clean, 16);
		}
		if (Number.isNaN(addr)) return "";

		const len = Number(rule.length) || 1;
		const maxLen = Math.min(len, 25);
		let result = "";

		switch (rule.type) {
			case "byte": {
				const bytes: string[] = [];
				for (let i = 0; i < maxLen; i++) {
					const byte = vm.value.readDebug(addr + i) ?? 0;
					bytes.push(`$${toHex(byte, 2)}`);
				}
				result = bytes.join(" ");
				break;
			}
			case "word": {
				const bytes: string[] = [];
				for (let i = 0; i < maxLen; i++) {
					const byte1 = vm.value.readDebug(addr + i++) ?? 0;
					const byte2 = vm.value.readDebug(addr + i) ?? 0;
					bytes.push(`$${toHex((byte2 << 8) | byte1, 4)}`);
				}
				result = bytes.join(" ");
				break;
			}
			case "string": {
				let str = "";
				for (let i = 0; i < maxLen; i++) {
					const byte = vm.value.readDebug(addr + i) ?? 0;
					str += byte >= 32 ? String.fromCharCode(byte & 0x7f) : ".";
				}
				result = `"${str}"`;
				break;
			}
		}

		if (len > maxLen) result += "...";
		return result;
	};

	const beginAddRule = () => {
		editingRule.value = {
			address: "" as any,
			type: "byte",
			length: 1,
			group: "user",
			isNew: true,
		};
	};

	const beginEdit = (rule: DataBlock) => {
		editingRule.value = {
			...JSON.parse(JSON.stringify(rule)), // Deep copy
			isNew: false,
			originalAddress: rule.address,
			originalGroup: rule.group,
		};
	};

	const cancelEdit = () => {
		editingRule.value = null;
		validationErrors.value = { address: "", length: "" };
	};

	const saveEdit = () => {
		if (!editingRule.value) return;

		validationErrors.value = { address: "", length: "" };
		let hasErrors = false;

		const rule = editingRule.value;
		const addressHex = String(rule.address).replace("$", "");
		const address = parseInt(addressHex, 16);

		if (Number.isNaN(address) || address < 0 || address > 0xffffff) {
			validationErrors.value.address = "Invalid hex address (e.g., C000).";
			hasErrors = true;
		}

		const length = Number(rule.length);
		if (!Number.isInteger(length) || length <= 0) {
			validationErrors.value.length = "Must be a positive integer.";
			hasErrors = true;
		}

		if (hasErrors) return;

		const group = rule.group?.trim() || "user";

		if (
			!rule.isNew &&
			rule.originalAddress !== undefined &&
			rule.originalGroup !== undefined &&
			(rule.originalAddress !== address || rule.originalGroup !== group)
		) {
			removeFormat(rule.originalAddress, rule.originalGroup);
		}

		addFormatting(address, rule.type, length, group);
		editingRule.value = null;
	};

	return {
		editingRule,
		validationErrors,
		getPreview,
		beginAddRule,
		beginEdit,
		cancelEdit,
		saveEdit,
	};
}
