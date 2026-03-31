import { useRoutines, type Routine } from "@/composables/useRoutines";
import { TokenType, ExpressionParser } from "@/lib/expressionParser/expressionParser";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";
import type { QueueItem, QueueItemLine, Sink } from "@/types/queueitem";
import { executeSubQueue } from "@/composables/useCommands";

export const END_ROUTINE_MARKER = "--END-ROUTINE--";

const { getRoutine } = useRoutines();

export async function handleDoCommand(
	cmdParser: ExpressionParser,
	item: QueueItemLine,
	subQueue: QueueItem[],
	isLastInChain: boolean,
	currentSink: Sink,
	pipeValue: unknown,
	vm: VirtualMachine,
) {
	const token = cmdParser.peek();
	if (!cmdParser.matchIdentifier()) throw new Error("DO needs a routine name !!!.");

	const routineName = token.text;
	const routine = getRoutine(routineName);
	if (!routine) throw new Error(`Routine '${routineName}' not found.`);

	const args = parseRoutineArgs(cmdParser, pipeValue);
	if (args.length !== routine.args.length)
		throw new Error(`Routine '${routineName}' expects ${routine.args.length} argument(s), but got ${args.length}.`);

	const expandedLines = expandRoutineLines(routine, args);

	if (isLastInChain) {
		subQueue.unshift(...expandedLines, { type: "marker", value: END_ROUTINE_MARKER });
	} else {
		const res = await executeSubQueue([...expandedLines], new ExpressionParser("", vm), true, vm);
		if (res.error) throw new Error(res.error);
		res.success.forEach((out) => currentSink(out));
	}

	item.injectedPipe = undefined;
}

function expandRoutineLines(routine: Routine, args: string[]) {
	const expandedLines: QueueItem[] = [];

	routine.lines
		.filter((line) => !line.trim().startsWith(";") && line.trim() !== "")
		.forEach((line) => {
			let processed = line;
			routine.args.forEach((argName, index) => {
				processed = processed.replaceAll(`@${argName}`, args[index]);
			});

			expandedLines.push({
				type: "line",
				source: processed,
			});
		});

	return expandedLines;
}

function parseRoutineArgs(cmdParser: ExpressionParser, pipeValue: unknown) {
	const args: string[] = [];
	while (!cmdParser.eof()) {
		const res = cmdParser.parse();
		switch (res.type) {
			case TokenType.STRING:
				args.push(`"${res.value}"`);
				break;
			default:
				args.push(String(res.value));
				break;
		}
		// cmdParser.consume();
	}
	if (pipeValue !== undefined) {
		if (typeof pipeValue === "string") args.push(`"${pipeValue}"`);
		else args.push(String(pipeValue));
	}

	return args;
}
