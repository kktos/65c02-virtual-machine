import type { ExpressionParser } from "@/lib/expressionParser";
import type { QueueItemLine, QueueItem } from "@/types/queueitem";

const MAX_LOOP_ITERATIONS = 10000;

/**
 * Handles the WHILE command for scripting.
 * Syntax: WHILE <expression> [DO|THEN] <command>
 *
 * Like the IF command, it captures the rest of the line segment as the body.
 * If the condition is true, it prepends the body and the original line back to the queue.
 */
export function handleWhileCommand(cmdParser: ExpressionParser, item: QueueItemLine, commandQueue: QueueItem[]) {
	const iterations = (item as any).iterations || 0;

	if (iterations >= MAX_LOOP_ITERATIONS) {
		throw new Error(`Infinite loop protection: WHILE loop exceeded ${MAX_LOOP_ITERATIONS} iterations.`);
	}

	let isTrue = false;

	const expr = cmdParser.parse();
	const condition = expr.value;

	if (typeof condition === "string") isTrue = condition.length > 0;
	else isTrue = condition !== 0;

	if (!isTrue) return;

	if (cmdParser.isIdentifier("DO") || cmdParser.isIdentifier("THEN")) cmdParser.consume();

	const nextTok = cmdParser.peek();
	if (!nextTok) return;
	const bodySource = item.source.slice(nextTok.start).trim();
	if (!bodySource) return;

	// To implement the loop, we push the body of the loop,
	// followed by the original WHILE command line so it can be re-evaluated.
	commandQueue.unshift({ type: "line", source: bodySource }, {
		type: "line",
		source: item.source,
		iterations: iterations + 1,
		isLoopHeader: true,
	} as any);
}
