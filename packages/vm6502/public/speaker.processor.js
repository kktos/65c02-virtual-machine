class SpeakerProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		// Simple ring buffer-like queue
		this.samples = [];

		this.port.onmessage = (e) => {
			// We receive Float32Arrays (chunks of 128 samples)
			// Pushing the whole chunk is more efficient than pushing individual samples
			this.samples.push(e.data);

			// Safety cap to prevent memory leaks if audio stalls
			if (this.samples.length > 100) {
				this.samples.shift();
			}
		};
	}

	process(_inputs, outputs, _parameters) {
		const output = outputs[0];
		const channel = output[0];

		// Get the next chunk of samples
		const chunk = this.samples.shift();

		if (chunk) {
			// If we have a chunk, copy it to the output
			// We assume the sender sends exactly 128 samples per message
			channel.set(chunk);
		} else {
			// Underrun: No data available. Output silence.
			// (Optional: could implement simple hold/interpolation here)
			// channel.fill(0); // TypedArrays are zero-initialized by default
		}

		return true; // Keep processor alive
	}
}

registerProcessor("speaker-processor", SpeakerProcessor);
