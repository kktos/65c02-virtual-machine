import { StreamLanguage, type StreamParser } from "@codemirror/language";

const opcodes =
	/^(ADC|AND|ASL|BCC|BCS|BEQ|BIT|BMI|BNE|BPL|BRK|BVC|BVS|CLC|CLD|CLI|CLV|CMP|CPX|CPY|DEC|DEX|DEY|EOR|INC|INX|INY|JMP|JSR|LDA|LDX|LDY|LSR|NOP|ORA|PHA|PHP|PLA|PLP|ROL|ROR|RTI|RTS|SBC|SEC|SED|SEI|STA|STX|STY|TAX|TAY|TSX|TXA|TXS|TYA)$/i;
const commands = /^(print|do|hook|exec|log|mem|dump|bp|undef|help)$/i;
const registers = /^(a|x|y|sp|pc|p)$/i;

const asm6502Parser: StreamParser<unknown> = {
	token(stream) {
		// Eat whitespace
		if (stream.eatSpace()) return null;

		// Comments
		if (stream.peek() === ";") {
			stream.skipToEnd();
			return "comment";
		}

		// Hex numbers ($1234)
		if (stream.match(/^\$[0-9a-fA-F]+/)) {
			return "number";
		}

		// Decimal numbers (#12)
		if (stream.match(/^#[0-9]+/)) {
			return "number";
		}

		// Labels (ending with :)
		if (stream.match(/^[a-zA-Z_.][a-zA-Z0-9_.]*:/)) {
			return "labelName";
		}

		// Directives / Pipes
		if (stream.match(/^\|>/)) {
			return "operator";
		}

		// Words
		if (stream.match(/^[a-zA-Z_.][a-zA-Z0-9_.]*/)) {
			const word = stream.current();
			if (opcodes.test(word)) return "keyword";
			if (commands.test(word)) return "typeName"; // VM Commands
			if (registers.test(word)) return "variableName";
			return "variable";
		}

		// Operators / Punctuation
		stream.next();
		return "punctuation";
	},
};

export function asm6502() {
	return StreamLanguage.define(asm6502Parser);
}
