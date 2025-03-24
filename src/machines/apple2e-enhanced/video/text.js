import { TEXT_LINES } from "../../ram_map.js";
import { MON_CH, MON_CV, fontSizes, textColors } from "./text-constants.js";

const BaseAddr = TEXT_LINES[0];

const font40 = fontSizes[14][40];
const font80 = fontSizes[16][80];
const fonts = {
	40: {
		name: `${font40.h}px "PrintChar21"`,
		offsetLeft: font40.left,
		offsetTop: font40.top + font40.h + 2,
		w: font40.w,
		h: font40.h,
	},
	80: {
		name: `${font80.h}px "PRNumber3"`,
		offsetLeft: font80.left,
		offsetTop: font80.top + font80.h + 2,
		w: font80.w,
		h: font80.h,
	},
};

const BLINKFREQUENCY = 10;
let cursorBlinkTick = 0;
let cursorVisible = false;

function asciiToChar(asciiCode) {
	let charCode = asciiCode;
	if (charCode <= 0x1f) charCode += 0xe140;
	else if (charCode <= 0x3f) charCode += 0xe100;
	else if (charCode <= 0x5f) charCode += 0xe100;
	else if (charCode <= 0x7f)
		charCode += 0xe0c0; // $60-$7F -> $E120-$E13F
	else if (charCode >= 0xa0) charCode -= 0x80;

	return String.fromCharCode(charCode);
}

export function renderText(video, ctx, canvas) {
	let cursorY;
	let cursorX;

	const font = fonts[video.maxCol];
	ctx.font = font.name;

	if (!video.mixed) {
		ctx.fillStyle = textColors[video.tbColor & 0x0f].color;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	if (video.cursorState) {
		cursorY = video.memory[MON_CV];
		cursorX = video.memory[MON_CH];
		cursorBlinkTick++;
	}

	for (let line = video.mixed ? 20 : 0; line < 24; line++)
		for (let column = 0; column < video.maxCol; column++) {
			const addr = TEXT_LINES[line] + (video.col80 ? column >> 1 : column);
			const bank = !video.col80 || column & 1 ? 0 : 1;
			const ascii = video.memory[bank * 0x10000 + addr];
			const colour = video.textColours[bank * 0x0400 + addr - BaseAddr];

			if (colour) {
				ctx.fillStyle = textColors[colour & 0x0f].color;
				ctx.fillRect(
					font.offsetLeft + font.w * column,
					2 + font.offsetTop + (font.h + 2) * (line - 1),
					font.w,
					font.h + 2,
				);
			}

			if (video.cursorState && cursorX === column && cursorY === line) {
				if (cursorBlinkTick > BLINKFREQUENCY) {
					cursorBlinkTick = 0;
					cursorVisible = !cursorVisible;
				}
				ctx.fillStyle = cursorVisible ? "#FFF" : textColors[colour & 0x0f].color;
				ctx.fillRect(font.offsetLeft + font.w * column, font.offsetTop + (font.h + 2) * line, font.w, 2);
			}

			if (ascii === 0xa0) continue;

			ctx.fillStyle = textColors[(colour ? colour : video.tbColor) >> 4].color;
			ctx.fillText(asciiToChar(ascii), font.offsetLeft + font.w * column, font.offsetTop + (font.h + 2) * line);
		}

	ctx.fillStyle = "red";
	ctx.font = "10px monospace";
	const txt = `${cursorX} ${cursorY}`;
	ctx.fillText(txt, canvas.width - ctx.measureText(txt).width - 5, canvas.height - 12);
}
