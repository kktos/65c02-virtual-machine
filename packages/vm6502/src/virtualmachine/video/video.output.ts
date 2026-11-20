/** A rectangle of the video buffer, in buffer pixels */
export interface VideoViewRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The palette used until the machine sends its own: index i is gray level i (RGBA, 256 entries). */
export function grayscalePalette() {
	const palette = new Uint8Array(256 * 4);
	for (let i = 0; i < 256; i++) palette.set([i, i, i, 255], i * 4);
	return palette;
}

/** A copy of the `rect` part of a video buffer `bufferWidth` pixels wide, row after row. */
export function cropVideoBuffer(buffer: Uint8Array, bufferWidth: number, rect: VideoViewRect) {
	const { x, y, width, height } = rect;
	const pixels = new Uint8Array(width * height);
	for (let row = 0; row < height; row++) {
		const from = (y + row) * bufferWidth + x;
		pixels.set(buffer.subarray(from, from + width), row * width);
	}
	return pixels;
}

/**
 * How the picture fills the canvas. fit: as large as it fits, keeping its aspect ratio. integer: the largest whole
 * multiple of its size that fits. native: its original size, a buffer pixel per CSS pixel (a whole number of device
 * pixels), shrunk only when the canvas is too small for it.
 */
export type VideoScaling = "fit" | "integer" | "native";

/** Device pixels per buffer pixel at the original size: the device pixel ratio, rounded to keep pixels even */
export function nativeScale(devicePixelRatio: number) {
	return Math.max(1, Math.round(devicePixelRatio));
}

/**
 * Where the picture is drawn in a canvas of `bufW` x `bufH` (backing store) pixels, in integer or native scaling:
 * the largest whole multiple of the view that fits, at most `maxScale`
 */
function integerViewport(bufW: number, bufH: number, view: VideoViewRect, maxScale = Number.POSITIVE_INFINITY) {
	// Whole multiple when it fits; a box smaller than the buffer can't be scaled by an
	// integer, so fall back to the fractional fit there.
	const fit = Math.min(bufW / view.width, bufH / view.height);
	const scale = Math.min(maxScale, fit >= 1 ? Math.floor(fit) : fit);
	const width = Math.round(view.width * scale);
	const height = Math.round(view.height * scale);
	// Centered; gl.viewport counts y from the bottom
	const x = Math.floor((bufW - width) / 2);
	const bottom = Math.floor((bufH - height) / 2);
	return { x, top: bufH - height - bottom, bottom, width, height };
}

/**
 * The video buffer pixel under the point (`px`, `py`) of a canvas, in CSS pixels from its top-left corner, or
 * null outside the picture. `box`: the canvas' CSS size; `store`: its backing store size; `view`: the part of the
 * buffer shown. Fit mode: the store is the view, laid out by `object-fit: contain`. Integer and native scaling: the
 * store is the box in device pixels, the picture centered in it (see `integerViewport`).
 */
export function canvasPointToBuffer(
	px: number,
	py: number,
	box: { width: number; height: number },
	store: { width: number; height: number },
	view: VideoViewRect,
	scaling: VideoScaling,
	devicePixelRatio = 1,
): { x: number; y: number } | null {
	if (box.width <= 0 || box.height <= 0) return null;
	let left: number;
	let top: number;
	let scale: number;
	if (scaling !== "fit") {
		// In backing store pixels
		const toStore = store.width / box.width;
		px *= toStore;
		py *= toStore;
		const maxScale = scaling === "native" ? nativeScale(devicePixelRatio) : undefined;
		const viewport = integerViewport(store.width, store.height, view, maxScale);
		left = viewport.x;
		top = viewport.top;
		scale = viewport.width / view.width;
	} else {
		scale = Math.min(box.width / view.width, box.height / view.height);
		left = (box.width - view.width * scale) / 2;
		top = (box.height - view.height * scale) / 2;
	}
	const x = Math.floor((px - left) / scale);
	const y = Math.floor((py - top) / scale);
	if (x < 0 || y < 0 || x >= view.width || y >= view.height) return null;
	return { x: view.x + x, y: view.y + y };
}

export class VideoOutput {
	private canvas: HTMLCanvasElement;
	private gl: WebGL2RenderingContext;
	private videoBuffer: Uint8Array;
	private width: number;
	private height: number;
	private imageTexture: WebGLTexture | null = null;
	private paletteTexture: WebGLTexture | null = null;
	private uvRectLocation: WebGLUniformLocation | null = null;

	// Only this part of the buffer is displayed (lets a machine crop its border)
	private viewRect: VideoViewRect;

	// Integer and native scaling: the canvas backing store matches the element's size in device pixels
	// and the frame is drawn into a centered viewport that is a whole multiple of the buffer size,
	// so every source pixel becomes an identical k x k block of screen pixels.
	private scaling: VideoScaling = "fit";
	private resizeObserver: ResizeObserver | null = null;

	constructor(canvas: HTMLCanvasElement, videoBuffer: Uint8Array, width: number, height: number) {
		this.canvas = canvas;
		this.videoBuffer = videoBuffer;
		this.width = width;
		this.height = height;
		this.viewRect = { x: 0, y: 0, width, height };
		this.canvas.width = this.width;
		this.canvas.height = this.height;

		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		this.canvas.style.objectFit = "contain";
		this.canvas.style.imageRendering = "pixelated";

		const gl = this.canvas.getContext("webgl2", { preserveDrawingBuffer: true });
		if (!gl) throw new Error("Could not get WebGL2 context");
		this.gl = gl;

		const expectedSize = this.width * this.height;
		if (this.videoBuffer.length < expectedSize)
			throw new Error(
				`Video buffer size (${this.videoBuffer.length}) is insufficient for ${this.width}x${this.height} resolution. Expected at least ${expectedSize} bytes.`,
			);
		if (this.videoBuffer.length > expectedSize)
			throw new Error(
				`Video buffer size (${this.videoBuffer.length}) exceeds ${this.width}x${this.height} resolution requirement (${expectedSize} bytes).`,
			);

		this.initPalette();
		this.initWebGL();
	}

	private initWebGL() {
		const gl = this.gl;

		// Vertex Shader
		const vsSource = `#version 300 es
        in vec2 a_position;
        in vec2 a_texCoord;
        uniform vec4 u_uvRect; // visible part of the buffer: offset (xy) and size (zw), in UV units
        out vec2 v_texCoord;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            v_texCoord = u_uvRect.xy + a_texCoord * u_uvRect.zw;
        }`;

		// Fragment Shader
		const fsSource = `#version 300 es
        precision mediump float;
        in vec2 v_texCoord;
        uniform sampler2D u_image;
        uniform sampler2D u_palette;
        out vec4 outColor;
        void main() {
            float index = texture(u_image, v_texCoord).r;
            outColor = texture(u_palette, vec2(index, 0.5));
        }`;

		const createShader = (type: number, source: string) => {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Error creating shader");
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
				throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
			return shader;
		};

		const program = gl.createProgram();
		if (!program) throw new Error("Error creating program");
		gl.attachShader(program, createShader(gl.VERTEX_SHADER, vsSource));
		gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fsSource));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
		gl.useProgram(program);

		// Full screen quad (Triangle Strip)
		const vertices = new Float32Array([-1, 1, 0, 0, -1, -1, 0, 1, 1, 1, 1, 0, 1, -1, 1, 1]);
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

		const aPos = gl.getAttribLocation(program, "a_position");
		const aTex = gl.getAttribLocation(program, "a_texCoord");
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
		gl.enableVertexAttribArray(aTex);
		gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);

		// Uniforms
		gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
		gl.uniform1i(gl.getUniformLocation(program, "u_palette"), 1);
		this.uvRectLocation = gl.getUniformLocation(program, "u_uvRect");
		this.applyViewRect();

		// Texture
		this.imageTexture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		// Use R8 for single byte index
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.width, this.height, 0, gl.RED, gl.UNSIGNED_BYTE, null);
	}

	private initPalette() {
		const gl = this.gl;
		const palette = grayscalePalette();
		this.paletteTexture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, palette);
	}

	public setScaling(scaling: VideoScaling) {
		if (scaling === this.scaling) return;
		const wasFit = this.scaling === "fit";
		this.scaling = scaling;
		// Integer <-> native only changes the viewport, drawn every frame
		if (wasFit === (scaling === "fit")) return;

		if (scaling !== "fit") {
			// Size containment keeps the (now large) backing store from feeding back into layout:
			// the element keeps the box it had in fit mode.
			this.canvas.style.contain = "size";
			this.canvas.style.objectFit = "fill";
			this.resizeObserver = new ResizeObserver((entries) => this.onResize(entries));
			try {
				this.resizeObserver.observe(this.canvas, { box: "device-pixel-content-box" });
			} catch {
				this.resizeObserver.observe(this.canvas);
			}
			return;
		}

		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.canvas.style.contain = "";
		this.canvas.style.objectFit = "contain";
		this.canvas.width = this.viewRect.width;
		this.canvas.height = this.viewRect.height;
	}

	public setViewRect(rect: VideoViewRect) {
		// Keep it inside the buffer, at least one pixel
		const x = Math.min(Math.max(0, Math.round(rect.x)), this.width - 1);
		const y = Math.min(Math.max(0, Math.round(rect.y)), this.height - 1);
		const width = Math.min(Math.max(1, Math.round(rect.width)), this.width - x);
		const height = Math.min(Math.max(1, Math.round(rect.height)), this.height - y);
		this.viewRect = { x, y, width, height };
		this.applyViewRect();
		// In fit mode the backing store is the visible size, so object-fit keeps its aspect ratio
		if (this.scaling === "fit") {
			this.canvas.width = width;
			this.canvas.height = height;
		}
	}

	private applyViewRect() {
		const { x, y, width, height } = this.viewRect;
		this.gl.uniform4f(
			this.uvRectLocation,
			x / this.width,
			y / this.height,
			width / this.width,
			height / this.height,
		);
	}

	private onResize(entries: ResizeObserverEntry[]) {
		const entry = entries[0];
		if (!entry) return;
		// Canvas content box in device pixels (exact when the browser reports it, else rounded)
		const devSize = entry.devicePixelContentBoxSize?.[0];
		const dpr = window.devicePixelRatio || 1;
		const width = devSize ? devSize.inlineSize : Math.round(entry.contentRect.width * dpr);
		const height = devSize ? devSize.blockSize : Math.round(entry.contentRect.height * dpr);
		// Setting width/height clears the drawing buffer; the next animation frame redraws it
		if (width > 0 && height > 0) {
			this.canvas.width = width;
			this.canvas.height = height;
		}
	}

	private setViewport() {
		const gl = this.gl;
		const bufW = gl.drawingBufferWidth;
		const bufH = gl.drawingBufferHeight;

		if (this.scaling === "fit") {
			gl.viewport(0, 0, bufW, bufH);
			return;
		}

		const maxScale = this.scaling === "native" ? nativeScale(window.devicePixelRatio || 1) : undefined;
		const { x, bottom, width, height } = integerViewport(bufW, bufH, this.viewRect, maxScale);
		gl.viewport(0, 0, bufW, bufH);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.viewport(x, bottom, width, height);
	}

	/** The video buffer pixel under a point of the page (a mouse event's clientX / clientY), or null */
	public clientToBuffer(clientX: number, clientY: number) {
		const rect = this.canvas.getBoundingClientRect();
		return canvasPointToBuffer(
			clientX - rect.left,
			clientY - rect.top,
			rect,
			{ width: this.gl.drawingBufferWidth, height: this.gl.drawingBufferHeight },
			this.viewRect,
			this.scaling,
			window.devicePixelRatio || 1,
		);
	}

	public render() {
		const gl = this.gl;
		this.setViewport();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RED, gl.UNSIGNED_BYTE, this.videoBuffer);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		if ((globalThis as any).DEBUG_VIDEO_OUTPUT) {
			(globalThis as any).DEBUG_VIDEO_OUTPUT = false;
			const width = gl.drawingBufferWidth;
			const height = gl.drawingBufferHeight;
			const pixels = new Uint8Array(width * height * 4);
			gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d");
			if (ctx) {
				const imageData = ctx.createImageData(width, height);
				// WebGL reads pixels upside down relative to Canvas
				for (let y = 0; y < height; y++) {
					const srcY = height - 1 - y;
					const row = pixels.subarray(srcY * width * 4, (srcY + 1) * width * 4);
					imageData.data.set(row, y * width * 4);
				}
				ctx.putImageData(imageData, 0, 0);
				console.log("VideoOutput Snapshot:", width, height);
				console.log(
					"%c  ",
					`font-size: 1px; padding: ${height / 2}px ${width / 2}px; background: url(${canvas.toDataURL()}) no-repeat; background-size: contain;`,
				);
			}
		}
	}

	public destroy() {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
	}

	public setPalette(colors: Uint8Array) {
		if (colors.length !== 256 * 4) throw new Error("Palette must be 256 colors (1024 bytes) in RGBA format");
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, colors);
	}
}
