// Helper to convert Apple's weird character codes to something renderable
function mapAppleChr(char: number): string {
	const ascii = char & 0x7f;
	if (ascii >= 0x40 && ascii <= 0x7f) return String.fromCharCode(ascii);
	if (ascii < 0x20) return String.fromCharCode(ascii + 0x40);
	return String.fromCharCode(ascii);
}

export async function generateApple2Assets(): Promise<{ video?: unknown; bus?: unknown }> {
	if (typeof document === "undefined") return {};

	await Promise.all([document.fonts.load("21px PrintChar21"), document.fonts.load("16px PRNumber3")]);

	const generateCharmap = async (font: string, charWidth: number, charHeight: number) => {
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;

		ctx.imageSmoothingEnabled = false;
		canvas.style.imageRendering = "pixelated";

		const cols = 16;
		const rows = 16;

		canvas.width = cols * charWidth;
		canvas.height = rows * charHeight;

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.font = font;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		for (let i = 0; i < 256; i++) {
			const char = mapAppleChr(i);
			const col = i % cols;
			const row = Math.floor(i / cols);
			const x = Math.floor(col * charWidth + charWidth / 2);
			const y = Math.floor(row * charHeight + charHeight / 2);

			if (i <= 0x7f) {
				ctx.fillStyle = "white";
				ctx.fillRect(col * charWidth, row * charHeight, charWidth, charHeight);
				ctx.fillStyle = "black";
			} else {
				ctx.fillStyle = "white";
			}
			ctx.fillText(char, x, y);
		}
		const bitmap = await createImageBitmap(canvas);

		const url = canvas.toDataURL();
		console.log(`Font Atlas: ${font} W${canvas.width} x H${canvas.height} char w${charWidth} h${charHeight}`);
		console.log(
			"%c  ",
			`font-size: 1px; padding: ${canvas.height / 2}px ${canvas.width / 2}px; background: url(${url}) no-repeat; background-size: contain;`,
		);

		return {
			bitmap,
			metrics: { charWidth, charHeight, cols, rows, offsetTop: 2, offsetLeft: 3 },
		};
	};

	const map40 = await generateCharmap("21px PrintChar21", 16, 22);
	const map80 = await generateCharmap("16px PRNumber3", 7, 16);

	return {
		video: {
			charmap40: map40?.bitmap,
			metrics40: map40?.metrics,
			charmap80: map80?.bitmap,
			metrics80: map80?.metrics,
		},
	};
}
