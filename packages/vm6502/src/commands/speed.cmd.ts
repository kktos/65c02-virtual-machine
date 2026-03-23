import { useEmulatorSpeed } from "@/composables/useEmulatorSpeed";
import type { CommandContext, CommandDef } from "@/types/command";

export const speed: CommandDef = {
	description: "Set the Machine speed in MHz.",
	paramDef: ["number?"],
	group: "Execution",
	fn: ({ params }: CommandContext) => {
		const val = params[0];
		const { targetSpeed } = useEmulatorSpeed();
		if (typeof val === "number") targetSpeed.value = val;
		return `Speed: ${targetSpeed.value}MHz`;
	},
};
