import { NATIVE_VIEW_HEIGHT, NATIVE_VIEW_WIDTH, textScreenLineOffsets } from "./constants";

const GR_WIDTH = 40;
const GR_LINES = 48;
const GR_MIXED_LINES = 40;
const AUX_BANK_OFFSET = 0x10000;

export class LowGrRenderer {
	public offsetX = 0;
	public offsetY = 0;
	private scaleX = 1;
	private scaleY = 1;
	private bufferWidth: number;
	private bufferHeight: number;

	constructor(
		private ram: Uint8Array,
		private buffer: Uint8Array,
		targetWidth: number,
		targetHeight: number,
	) {
		this.bufferWidth = targetWidth;
		this.bufferHeight = targetHeight;
		this.resize(targetWidth, targetHeight);
	}

	public resize(width: number, height: number) {
		this.scaleX = NATIVE_VIEW_WIDTH / GR_WIDTH;
		this.scaleY = NATIVE_VIEW_HEIGHT / GR_LINES;
		this.offsetX = Math.floor((this.bufferWidth - NATIVE_VIEW_WIDTH) / 2);
		this.offsetY = Math.floor((this.bufferHeight - NATIVE_VIEW_HEIGHT) / 2);
	}

	public render(isMixed: boolean, isPage2: boolean, isDblRes: boolean): void {
		const pageOffset = isPage2 ? 0x400 : 0;
		const endLine = isMixed ? GR_MIXED_LINES : GR_LINES;

		for (let y = 0; y < endLine; y++) {
			const textRow = y >> 1;
			const isBottom = (y & 1) !== 0;
			const lineBase = (textScreenLineOffsets[textRow] ?? 0) + pageOffset;

			const startY = Math.floor(this.offsetY + y * this.scaleY);
			const endY = Math.floor(this.offsetY + (y + 1) * this.scaleY);

			if (isDblRes) {
				const blockWidth = this.scaleX / 2;
				for (let i = 0; i < GR_WIDTH; i++) {
					// Double GR: Even cols from Aux, Odd cols from Main
					// Aux (Even column i*2)
					const valAux = this.ram[AUX_BANK_OFFSET + lineBase + i] ?? 0;
					const colorAux = isBottom ? valAux >> 4 : valAux & 0x0f;
					this.drawBlock(i * 2, startY, endY, blockWidth, colorAux);

					// Main (Odd column i*2 + 1)
					const valMain = this.ram[lineBase + i] ?? 0;
					const colorMain = isBottom ? valMain >> 4 : valMain & 0x0f;
					this.drawBlock(i * 2 + 1, startY, endY, blockWidth, colorMain);
				}
			} else {
				const blockWidth = this.scaleX;
				for (let i = 0; i < GR_WIDTH; i++) {
					// Standard GR
					const val = this.ram[lineBase + i] ?? 0;
					const color = isBottom ? val >> 4 : val & 0x0f;
					this.drawBlock(i, startY, endY, blockWidth, color);
				}
			}
		}
	}

	private drawBlock(colIndex: number, startY: number, endY: number, width: number, colorIdx: number) {
		const startX = Math.floor(this.offsetX + colIndex * width);
		const endX = Math.floor(this.offsetX + (colIndex + 1) * width);

		for (let dy = startY; dy < endY; dy++) {
			const rowOffset = dy * this.bufferWidth;
			for (let dx = startX; dx < endX; dx++) this.buffer[rowOffset + dx] = colorIdx;
		}
	}
}
