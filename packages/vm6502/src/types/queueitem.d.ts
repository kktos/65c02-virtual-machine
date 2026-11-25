type QueueItemLine = {
	type: "line";
	source: string;
	tokens?: CommandSegment;
	chain?: CommandSegment[] | null;
	injectedPipe?: any;
};
type QueueItemMarker = { type: "marker"; value: string };
export type QueueItem = QueueItemLine | QueueItemMarker;
/** Can return a promise: a G (JSR) waits for the machine to pause. */
type Sink = (output: any) => void | Promise<void>;
