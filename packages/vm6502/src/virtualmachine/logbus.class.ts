// logBus.ts
// Compact pub/sub log bus. Every log has text; payload is optional,
// per-channel typed extra data. O(1) no-op when nobody's listening,
// and emitLazy() lets callers skip building text/payload entirely in that case.

/** Extend this map to register new channels + their optional payload shape. */
export interface LogPayloads {
	disk: { type: string; block: number; address: number };
	trace: { pc: number; opcode: string; cycles: number };
	shell: undefined;
	script: undefined;
	hyper: undefined;
}

type Channel = keyof LogPayloads;
type Listener<C extends Channel> = (text: string, payload: LogPayloads[C]) => void;
type Unsubscribe = () => void;

class LogBus {
	private subs = new Map<Channel, Set<Listener<any>>>();

	/** Subscribe a listener to a channel. Returns an unsubscribe fn. */
	on<C extends Channel>(channel: C, listener: Listener<C>): Unsubscribe {
		let set = this.subs.get(channel);
		if (!set) this.subs.set(channel, (set = new Set()));
		set.add(listener);
		return () => {
			set!.delete(listener);
		};
	}

	/** Unsubscribe a specific listener from a channel (alternative to the fn returned by on()). */
	off<C extends Channel>(channel: C, listener: Listener<C>): void {
		this.subs.get(channel)?.delete(listener);
	}

	/** True if anyone is listening. Use to guard text/payload construction on hot paths. */
	isActive(channel: Channel): boolean {
		const set = this.subs.get(channel);
		return !!set && set.size > 0;
	}

	/** Emit text (+ optional payload). No-ops in O(1) when nobody's listening. */
	emit<C extends Channel>(channel: C, text: string, payload?: LogPayloads[C]): void {
		const set = this.subs.get(channel);
		if (!set) return;
		for (const fn of set) fn(text, payload as LogPayloads[C]);
	}

	/**
	 * Lazy emit — `build` only runs if there are subscribers.
	 * Use whenever formatting `text` or constructing `payload` isn't free
	 * (disassembly, string interpolation, object spreads, etc).
	 */
	emitLazy<C extends Channel>(channel: C, build: () => [text: string, payload?: LogPayloads[C]]): void {
		const set = this.subs.get(channel);
		if (!set || set.size === 0) return;
		const [text, payload] = build();
		for (const fn of set) fn(text, payload as LogPayloads[C]);
	}

	/** Drop all listeners for a channel (e.g. on hot-reload / teardown). */
	clear(channel: Channel): void {
		this.subs.delete(channel);
	}
}

export const logBus = new LogBus();

/* ------------------------------------------------------------------ */
/* Usage                                                               */
/* ------------------------------------------------------------------ */

// SmartPort card — cheap payload, emit directly:
//   logBus.emit('disk', `Track ${track} sector ${sector}`, { drive: 1, track, sector, op: 'read' });

// CPU trace — text/payload expensive to build (disassembly), so guard it:
//   logBus.emitLazy('trace', () => [`$${pc.toString(16)} ${op}`, { pc, opcode: op, cycles }]);

// LogWindow.vue subscribing:
//   const unsub = logBus.on('disk', (text, payload) => { diskHead.value = payload; lines.value.push(text); });
//   onUnmounted(unsub);

// Shell / script engine — no payload needed:
//   logBus.emit('shell', `Loaded ${filename}`);
