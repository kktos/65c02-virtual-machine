import { TEXT_LINES } from "../ram_map.js";

export default class Video {
	constructor(memory) {
		this.memory = new Uint8Array(memory);
	}

	get width() {
		return 40 * 15 + 20;
	}

	get height() {
		return 24 * 22 + 20;
	}

	update({ tick, viewport: { ctx, canvas } }, cycles) {
		ctx.fillStyle = "black";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		const x = 7;
		const y = 7 + 22;
		ctx.fillStyle = "white";
		ctx.font = '20px "PrintChar21"';
		for (let line = 0; line < 24; line++)
			for (let column = 0; column < 40; column++) {
				const addr = TEXT_LINES[line] + column;
				let ascii = this.memory[addr];
				if (ascii <= 0x1f) ascii += 0xe140;
				else if (ascii <= 0x3f) ascii += 0xe100;
				else if (ascii <= 0x5f) ascii += ((tick / 10) | 0) % 2 ? 0xe100 : 0;
				else if (ascii <= 0x7f) ascii += -0x40 + (((tick / 10) | 0) % 2 ? 0xe100 : 0);
				else if (ascii >= 0xa0 && ascii <= 0xdf) ascii = ascii - 0x80;
				const char = String.fromCharCode(ascii);
				ctx.fillText(char, x + 15 * column, y + 22 * line);
			}

		// ctx.fillStyle="#7777FF";
		// ctx.font = '12px monospace';
		// y= 400;
		// x= 10
		// for(let line= 0; line<6; line++) {
		// 	const addr= (TEXT_LINES[line]).toString(16).toUpperCase();
		// 	ctx.fillText(addr.padStart(4, '0')+":", x, y+(16*line));
		// 	for(let column= 0; column<40; column++) {
		// 		const char= (this.memory[TEXT_LINES[line]+column]).toString(16);
		// 		ctx.fillText(char.padStart(2, '0'), x+40+(15*column), y+(16*line));
		// 	}
		// }

		// ctx.fillStyle="red";
		// ctx.font = '16px monospace';
		// ctx.fillText(`${this.count}`, 10, canvas.height-20);
		// ctx.fillText(`PC:${this.cpu.pc}`, 10, canvas.height-40);
		// ctx.fillText(` X:${this.cpu.x}`, 10, canvas.height-60);
	}
}
