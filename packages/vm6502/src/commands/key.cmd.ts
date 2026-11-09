import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import { useMachine } from "@/composables/useMachine";
import { toHex } from "@/lib/hex.utils";
import type { KeyboardState } from "@/types/bus.interface";
import type { CommandContext } from "@/types/command";

const keyName = (code: number) => {
	if (code === 0x0d) return "Return";
	if (code === 0x1b) return "Esc";
	if (code === 0x20) return "Space";
	if (code < 0x20) return `Ctrl-${String.fromCharCode(code + 0x40)}`;
	if (code === 0x7f) return "Delete";
	return `"${String.fromCharCode(code)}"`;
};

const describe = (state: KeyboardState) =>
	[
		`Keys queued: ${state.queued}`,
		`held: ${state.held === null ? "none" : `${keyName(state.held)} ($${toHex(state.held)})`}`,
		`delay: ${state.delay} cycles`,
		`latch: $${toHex(state.latch | (state.strobe ? 0x80 : 0))}`,
		`key down: ${state.keyDown ? "yes" : "no"}`,
	].join(", ");

export const keyCmd = defineCommand({
	description:
		'Type on the keyboard. KEY "text" queues the keys: the program gets them as it reads the keyboard ' +
		"(paused, they wait). Escapes: \\n Return, \\e Esc, \\t Tab, \\xNN any key code (\\x03 Ctrl-C, \\x08 ←, \\x15 →).\n" +
		'KEY HOLD "A" | code: holds a key down (AKD, auto-repeat) until KEY RELEASE.\n' +
		"KEY CLEAR: empties the queue.\n" +
		"KEY DELAY cycles: the time after the program consumes a key before it gets the next one; " +
		"longer if a program eats keys, 0 for as soon as it asks.\n" +
		"No argument shows the keyboard state.",
	paramDef: ["name?|string?", "string?|number?"],
	paramHelp: '["text" | hold "key"|code | release | clear | delay cycles]',
	group: "Execution",
	fn: async ({ vm, params }: CommandContext) => {
		if (!vm?.bus?.getKeyboardState) throw new Error("This machine has no keyboard.");
		const [first, second] = params;

		if (typeof first === "string") {
			const { state, queued, skipped } = await vm.typeText(first);
			return `Typed ${queued} keys${skipped ? ` (${skipped} skipped: no key for them)` : ""}. ${describe(state)}`;
		}

		if (first === undefined) return describe((await vm.getKeyboardState()).state);
		if (!isParamListItemIdentifier(first)) throw new Error('Expected "text", hold, release, clear or delay.');

		switch (first.text.toUpperCase()) {
			case "HOLD": {
				if (typeof second !== "string" && typeof second !== "number")
					throw new Error('KEY HOLD needs a key: "A" or a key code.');
				return describe((await vm.holdKey(second)).state);
			}
			case "RELEASE":
				return describe((await vm.holdKey(null)).state);
			case "CLEAR":
				return describe((await vm.clearKeys()).state);
			case "DELAY": {
				if (typeof second !== "number" || second < 0) throw new Error("KEY DELAY needs a number of cycles.");
				const { setKeyDelay } = useMachine();
				const answer = await setKeyDelay(second);
				return answer ? describe(answer.state) : "";
			}
			default:
				throw new Error('Expected "text", hold, release, clear or delay.');
		}
	},
});
