import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function useLabeling() {
	const LABELS: Record<number, string> = {
		512: "INPUTBUF",
		1024: "TXT_SCRN_START",
		49152: "KBD_STROBE",
		64738: "INIT_SYSTEM",
	};

	const getLabeledInstruction = (opcode: string) => {
		const addressMatch = opcode.match(/\$([0-9A-Fa-f]{2,4}[\w,()]?)/);

		if (addressMatch) {
			const fullAddressExpression = addressMatch[0];
			const addressHexMatch = fullAddressExpression.match(/([0-9A-Fa-f]{2,4})/);
			if (addressHexMatch) {
				const addressHex = addressHexMatch[1] as string;
				const address = parseInt(addressHex, 16);

				if (LABELS[address]) {
					const label = LABELS[address];
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
