import { TEXT_LINES } from "../../ram_map.js";
import { textColors, fontSizes, colorAddr } from "./text-constants.js";

const BaseAddr= TEXT_LINES[0];
const fontSize= fontSizes[14][40];
const x= fontSize.left;
const y= fontSize.top + fontSize.h + 2;

export function renderText40(video, ctx, canvas) {
	ctx.font = `${fontSize.h}px "PrintChar21"`;

	ctx.fillStyle = textColors[video.tbColor&0x0F].color;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	for(let line= 0; line<24; line++)
		for(let column= 0; column<40; column++) {
			const addr= TEXT_LINES[line]+column;
			let ascii= video.memory[addr];
			const color= video.memory[addr-BaseAddr+colorAddr];

			if(color) {
				ctx.fillStyle = textColors[color & 0x0F].color;
				ctx.fillRect(x+(fontSize.w * column), 2+y+((fontSize.h+2) * (line-1)), fontSize.w, fontSize.h+2);
			}

			if(ascii === 0xA0)
				continue;

			if(ascii<=0x1F)
				ascii+= 0xE140;
			else
			if(ascii<=0x3F)
				ascii+= 0xE100;
			else
			if(ascii<=0x5F)
				ascii+= 0xE100;
			else
			if(ascii<=0x7F)
				ascii+= 0xE100;
			else
			if(ascii>=0xA0)
				ascii-= 0x80;
			const char= String.fromCharCode(ascii);

			ctx.fillStyle= textColors[(color ? color : video.tbColor) >> 4].color;

			ctx.fillText(char, x+(fontSize.w * column), y+((fontSize.h+2) * line));

		}

	// ctx.fillStyle="red";
	// ctx.font = `16px monospace`;
	// const txt= `${ cols[0].addr.toString(16) }:${ cols[0].color.toString(16) }`;
	// ctx.fillText(txt, canvas.width-ctx.measureText(txt).width-5, canvas.height-1);

}

export function clearScreen40(video) {
	for(let line= 0; line<24; line++) {
		const addr= TEXT_LINES[line];
		for(let column= 0; column<40; column++) {
			video.memory[addr + column]= 0xA0;
		}
	}
}
