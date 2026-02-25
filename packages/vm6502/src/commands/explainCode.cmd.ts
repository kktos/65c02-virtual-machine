import type { Command, ParamList } from "@/composables/useCommands";
import { useGemini } from "@/composables/useGemini";
import { useMachine } from "@/composables/useMachine";
import { disassembleRange, formatDisassemblyAsText } from "@/lib/disassembler";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { Ref } from "vue";

export const explain: Command = {
	description: "explain code from <address> to <address>",
	paramDef: ["long", "long"],
	fn: async (vm: VirtualMachine, _progress: Ref<number>, params: ParamList) => {
		const readByte = (address: number, debug = true) => (debug ? vm.readDebug(address) : vm.read(address)) ?? 0;
		const { registers } = useMachine();
		const { explainCode, explanation } = useGemini();

		const start = params[0] as number;
		const end = params[1] as number;
		const lines = disassembleRange(readByte, vm.getScope(start), start, end, registers);
		const source = formatDisassemblyAsText(lines);
		const text = await explainCode("test");

		explanation.value = "yo?";
		return text ?? "";
	},
};
