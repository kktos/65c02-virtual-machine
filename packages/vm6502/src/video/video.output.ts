export class VideoOutput {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private videoBuffer: Uint8Array;
	private width: number;
	private height: number;

	constructor(canvas: HTMLCanvasElement, videoBuffer: Uint8Array, width: number, height: number) {
		this.canvas = canvas;
		const context = this.canvas.getContext("2d");
		if (!context) throw new Error("Could not get 2D context from canvas");
		this.ctx = context;
		this.videoBuffer = videoBuffer;
		this.width = width;
		this.height = height;
		this.canvas.width = this.width;
		this.canvas.height = this.height;
	}

	public render() {
		if (!this.ctx) return;
		// Create an ImageData object to hold the pixel data
		const imageData = this.ctx.createImageData(this.width, this.height);

		// Directly copy the RGBA data from our shared buffer into the ImageData
		imageData.data.set(this.videoBuffer);

		// Draw the new frame to the canvas
		this.ctx.putImageData(imageData, 0, 0);
	}
}
