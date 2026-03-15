import { computed, inject, type Ref, ref } from "vue";
import { useSymbols, type SymbolEntry } from "@/composables/useSymbols";
import { toHex } from "@/lib/hex.utils";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

export type EditableSymbol = {
	id: number;
	label: string;
	addr: string | number; // string during input
	ns: string;
	scope: string;
	src?: string;
	disk?: string;
	isNew?: boolean;
	originalAddress?: number;
	originalNamespace?: string;
};

const editingSymbol = ref<EditableSymbol | null>(null);
const validationErrors = ref({
	addr: "",
	label: "",
});

export function useSymbolEditing() {
	const vm = inject<Ref<VirtualMachine>>("vm");
	const { addSymbol, updateSymbol } = useSymbols();

	const availableScopes = computed(() => {
		return vm?.value?.getScopes() ?? ["main"];
	});

	const beginAddSymbol = () => {
		editingSymbol.value = {
			label: "",
			addr: "", // Start with empty string for input
			ns: "user",
			scope: "main",
			isNew: true,
			id: 0,
		};
	};

	const beginEdit = (symbol: SymbolEntry) => {
		editingSymbol.value = {
			...JSON.parse(JSON.stringify(symbol)), // deep copy
			addr: toHex(symbol.addr, 6), // show hex string in input
			isNew: false,
			originalAddress: symbol.addr,
			originalNamespace: symbol.ns,
		};
	};

	const saveEdit = async () => {
		if (!editingSymbol.value) return;

		validationErrors.value = { addr: "", label: "" };
		let hasErrors = false;

		const symbol = editingSymbol.value;
		const addressHex = String(symbol.addr).replace("$", "");
		const address = parseInt(addressHex, 16);
		const namespace = symbol.ns?.trim() || "user";

		if (Number.isNaN(address) || address < 0 || address > 0xffffff) {
			validationErrors.value.addr = "Invalid hex address (e.g., C000).";
			hasErrors = true;
		}

		const label = symbol.label.trim();
		if (!label) {
			validationErrors.value.label = "Label cannot be empty.";
			hasErrors = true;
		}

		if (hasErrors) return;

		const scope = symbol.scope?.trim() || "main";

		if (symbol.isNew) {
			try {
				await addSymbol(address, label, namespace, scope);
			} catch (e) {
				validationErrors.value.label = "Duplicate label.";
				hasErrors = true;
			}
		} else {
			await updateSymbol(editingSymbol.value.id, address, label, namespace, scope);
		}

		if (hasErrors) return;

		editingSymbol.value = null;
	};

	const cancelEdit = () => {
		editingSymbol.value = null;
		validationErrors.value = { addr: "", label: "" };
	};

	return {
		editingSymbol,
		validationErrors,
		availableScopes,
		beginAddSymbol,
		beginEdit,
		saveEdit,
		cancelEdit,
	};
}
