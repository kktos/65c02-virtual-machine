export class VideoOutput {
	private canvas: HTMLCanvasElement;
	private gl: WebGL2RenderingContext;
	private videoBuffer: Uint8Array;
	private width: number;
	private height: number;

	constructor(canvas: HTMLCanvasElement, videoBuffer: Uint8Array, width: number, height: number) {
		this.canvas = canvas;
		this.videoBuffer = videoBuffer;
		this.width = width;
		this.height = height;
		this.canvas.width = this.width;
		this.canvas.height = this.height;

		const gl = this.canvas.getContext("webgl2");
		if (!gl) throw new Error("Could not get WebGL2 context");
		this.gl = gl;

		const expectedSize = this.width * this.height * 4;
		if (this.videoBuffer.length < expectedSize)
			throw new Error(
				`Video buffer size (${this.videoBuffer.length}) is insufficient for ${this.width}x${this.height} resolution. Expected at least ${expectedSize} bytes.`,
			);
		if (this.videoBuffer.length > expectedSize)
			throw new Error(
				`Video buffer size (${this.videoBuffer.length}) exceeds ${this.width}x${this.height} resolution requirement (${expectedSize} bytes).`,
			);

		this.initWebGL();
	}

	private initWebGL() {
		const gl = this.gl;

		// Vertex Shader
		const vsSource = `#version 300 es
        in vec2 a_position;
        in vec2 a_texCoord;
        out vec2 v_texCoord;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            v_texCoord = a_texCoord;
        }`;

		// Fragment Shader
		const fsSource = `#version 300 es
        precision mediump float;
        in vec2 v_texCoord;
        uniform sampler2D u_image;
        out vec4 outColor;
        void main() {
            outColor = texture(u_image, v_texCoord);
        }`;

		const createShader = (type: number, source: string) => {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Error creating shader");
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
			}
			return shader;
		};

		const program = gl.createProgram();
		if (!program) throw new Error("Error creating program");
		gl.attachShader(program, createShader(gl.VERTEX_SHADER, vsSource));
		gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fsSource));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
		}
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

		// Texture
		gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	}

	public render() {
		const gl = this.gl;
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this.videoBuffer);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}
}
