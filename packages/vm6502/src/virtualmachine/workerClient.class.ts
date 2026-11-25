type PendingRequest = { resolve: (data: unknown) => void; reject: (error: Error) => void };

/**
 * The CPU worker, main-thread side: its start-up, the request / reply RPC, its teardown.
 * The worker's other messages go to `onMessage`.
 */
export class WorkerClient {
	readonly worker: Worker;
	/** Resolves when the worker has set the machine up (its `ready`), rejects when the machine can't start. */
	readonly started: Promise<void>;
	private resolveStarted!: () => void;
	private rejectStarted!: (error: Error) => void;
	private isStarted = false;
	/** Why the machine couldn't start, or that it was shut down: requests then fail at once with it. */
	private _failure?: Error;

	private requests = new Map<number, PendingRequest>();
	private nextRequestId = 1;

	constructor(onMessage: (event: MessageEvent) => void) {
		this.worker = new Worker(new URL("./cpu/cpu.worker.ts", import.meta.url), { type: "module" });

		this.started = new Promise<void>((resolve, reject) => {
			this.resolveStarted = resolve;
			this.rejectStarted = reject;
		});
		// Only the VM's start-up awaits it: a failure before it gets there is reported through `ready` anyway
		this.started.catch(() => undefined);

		// The worker's script failed to load (or threw) before it was up: the machine can't start
		this.worker.onerror = (event) => {
			if (this.isStarted) return;
			event.preventDefault();
			this.fail(new Error(event.message || "The CPU worker failed to load"));
		};

		this.worker.onmessage = (event) => {
			switch (event.data.type) {
				case "ready":
					this.isStarted = true;
					this.resolveStarted();
					break;
				case "initFailed":
					this.fail(new Error(event.data.error));
					break;
				case "reply": {
					const { id, type: _type, ...data } = event.data;
					this.requests.get(id)?.resolve(data);
					this.requests.delete(id);
					break;
				}
				default:
					onMessage(event);
			}
		};
	}

	get failure() {
		return this._failure;
	}

	/** A command that doesn't answer. */
	post(message: object) {
		this.worker.postMessage(message);
	}

	/**
	 * Sends a worker command that answers with a `reply` message (see `reply` in cpu.worker.ts).
	 * Rejects when the machine couldn't start, or is shut down before the answer comes.
	 */
	request<T>(command: string, data: object = {}): Promise<T> {
		if (this._failure) return Promise.reject(this._failure);
		const id = this.nextRequestId++;
		return new Promise<T>((resolve, reject) => {
			this.requests.set(id, { resolve: resolve as (data: unknown) => void, reject });
			this.worker.postMessage({ command, id, ...data });
		});
	}

	/** The machine can't start: `started` and the requests waiting (or to come) fail with `error`. */
	fail(error: Error) {
		if (this._failure) return;
		this._failure = error;
		this.rejectStarted(error);
		this.rejectRequests(error);
	}

	/** The requests under way fail. Not `started`: a machine still starting is just dropped, nothing goes on with it. */
	terminate() {
		this.worker.terminate();
		this._failure ??= new Error("The machine was shut down");
		this.rejectRequests(this._failure);
	}

	private rejectRequests(error: Error) {
		for (const { reject } of this.requests.values()) reject(error);
		this.requests.clear();
	}
}
