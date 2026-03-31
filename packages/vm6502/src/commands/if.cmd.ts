import type { ExpressionParser } from "@/lib/expressionParser/expressionParser";
import type { QueueItemLine, QueueItem } from "@/types/queueitem";

export function handleIfCommand(cmdParser: ExpressionParser, item: QueueItemLine, commandQueue: QueueItem[]) {
	let isTrue = false;

	const expr = cmdParser.parse();
	const condition = expr.value;

	if (typeof condition === "string") isTrue = condition.length > 0;
	else isTrue = condition !== 0;

	if (!isTrue) return;

	if (cmdParser.isIdentifier("THEN")) cmdParser.consume();

	const nextTok = cmdParser.peek();
	if (!nextTok) return;
	const source = item.source.slice(nextTok.start).trim();
	if (!source) return;

	commandQueue.unshift({
		type: "line",
		source,
	});
}
