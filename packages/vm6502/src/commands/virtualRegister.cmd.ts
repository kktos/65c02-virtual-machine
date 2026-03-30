import { defineCommand } from "@/composables/useCommands";
import { useMachine } from "@/composables/useMachine";
import type { CommandContext, ParamListItemIdentifier } from "@/types/command";
import type { RegisterDescriptor } from "@/types/registers";

export const virtualRegisterCmd = defineCommand({
	description: "Add a virtual register to the machine\nVR name address byte|word r|w|rw",
	paramDef: ["name", "address", "name", "name"],
	group: "Monitor",
	fn: ({ params }: CommandContext) => {
		const name = params[0] as ParamListItemIdentifier;
		const address = params[1] as number;
		const sizeDef = params[2] as ParamListItemIdentifier;
		const mode = params[3] as ParamListItemIdentifier;

		const { addVirtualRegister, vm } = useMachine();

		const am = mode.text.toLowerCase();
		if (!["r", "w", "rw"].includes(am)) throw new Error("Invalid access mode; must be 'r', 'w', or 'rw'");

		let size: number;
		switch (sizeDef.text.toLowerCase()) {
			case "byte":
				size = 1;
				break;
			case "word":
				size = 2;
				break;
			default:
				throw new Error("Invalid size definition; must be 'byte' or 'word'");
		}

		const vr: RegisterDescriptor = {
			key: name.text,
			label: name.text,
			size,
			read: () => vm.value?.readDebug(address) ?? 0,
			isVirtual: true,
		};

		if (am === "r" || am === "rw") vr.read = () => vm.value?.read(address) ?? 0;
		if (am === "w" || am === "rw") vr.write = (value: number) => vm.value?.writeIO(address, value);

		addVirtualRegister(vr);

		return `New virtual register added:${name.text}`;
	},
});
