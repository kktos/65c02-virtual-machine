// One context for the page: browsers cap how many there are, and once a user gesture has unlocked it, it stays so
// for the machines built after.
let audioCtx: AudioContext | null = null;

// The sound queued ahead is kept between these (seconds): enough to absorb the jitter of the worker's
// messages, never a growing lag (the main thread busy, the clock of the worker drifting from the audio's).
const AUDIO_PREBUFFER = 0.03;
const AUDIO_MAX_LATENCY = 0.15;

/** Plays the sound chunks the worker sends, one after the other, on the main thread. One per VM. */
export class AudioSink {
	private ctx: AudioContext | null = null;
	private nextStartTime = 0;
	/** Scheduled and not played yet: stopped on close */
	private sources = new Set<AudioBufferSourceNode>();
	private closed = false;

	/** Gets the audio context going (it must come after a user gesture); resolves with its sample rate. */
	async open() {
		audioCtx ??= new AudioContext({ sampleRate: 22050 });
		if (audioCtx.state === "suspended") await audioCtx.resume();
		this.ctx = audioCtx;
		return audioCtx.sampleRate;
	}

	queue(samples: Float32Array) {
		const ctx = this.ctx;
		if (!ctx || this.closed) return;

		// Ensure context is running (browsers suspend it until user interaction)
		if (ctx.state === "suspended") ctx.resume();

		// Underrun (a gap in the audio data): restart a little ahead of now, so the next chunks join up.
		// Too much queued (sound produced faster than played): drop the chunk rather than lag behind.
		const currentTime = ctx.currentTime;
		if (this.nextStartTime < currentTime) this.nextStartTime = currentTime + AUDIO_PREBUFFER;
		else if (this.nextStartTime - currentTime > AUDIO_MAX_LATENCY) return;

		const audioBuffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
		audioBuffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);

		const source = ctx.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(ctx.destination);
		source.onended = () => this.sources.delete(source);
		source.start(this.nextStartTime);
		this.sources.add(source);

		// The next chunk starts right after this one
		this.nextStartTime += audioBuffer.duration;
	}

	/** The machine is gone: what it queued stops now, and nothing more is played. */
	close() {
		this.closed = true;
		for (const source of this.sources) source.stop();
		this.sources.clear();
	}
}
