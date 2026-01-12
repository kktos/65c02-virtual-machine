import { inject, type Ref } from "vue";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

export function useLabeling() {
	const vm = inject<Ref<VirtualMachine>>("vm");

	const getLabeledInstruction = (opcode: string) => {
		const labels = vm?.value?.machineConfig?.labels;
		if (!labels) return { labeledOpcode: opcode, labelComment: null };

		const addressMatch = opcode.match(/\$([0-9A-Fa-f]{2,4}[\w,()]?)/);

		if (addressMatch) {
			const fullAddressExpression = addressMatch[0];
			const addressHexMatch = fullAddressExpression.match(/([0-9A-Fa-f]{2,4})/);
			if (addressHexMatch) {
				const addressHex = addressHexMatch[1] as string;
				const address = parseInt(addressHex, 16);

				if (labels[address]) {
					const label = labels[address];
					// Replace the address part with the label, keeping the addressing mode suffix
					const suffix = fullAddressExpression.substring(addressHexMatch[0].length);
					const newOpcode = opcode.replace(fullAddressExpression, label + suffix);
					const comment = `$${addressHex.toUpperCase().padStart(4, "0")}`;
					return { labeledOpcode: newOpcode, labelComment: comment };
				}
			}
		}

		return { labeledOpcode: opcode, labelComment: null };
	};
	return getLabeledInstruction;
}
