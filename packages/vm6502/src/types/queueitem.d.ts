type QueueItemLine = {
	type: "line";
	source: string;
	tokens?: CommandSegment;
	chain?: CommandSegment[] | null;
	injectedPipe?: any;
};
type QueueItemMarker = { type: "marker"; value: string };
export type QueueItem = QueueItemLine | QueueItemMarker;
type Sink = (output: any) => void;
