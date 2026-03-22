import { StreamLanguage, type StreamParser } from "@codemirror/language";

const commands =
	/^(if|do|&|set|gl|vr|run|pause|step|s|reset|reboot|speed|asm|search|d|code|db|dw|da|str|def|undef|ren|find|hook|labels|scopepath|m|m1|m2|m3|bp|bpa|bpw|bpr|bc|bca|bcw|bcr|explain|log|routine|font|help|err|list|print|printmd|cls|write|buf|tr|sed|hd|show|hide)$/i;
const registers = /^(a|x|y|pc|sp|p)$/i;

const routineParser: StreamParser<unknown> = {
	token(stream) {
		// Eat whitespace
		if (stream.eatSpace()) return null;

		// Comments
		if (stream.peek() === ";") {
			stream.skipToEnd();
			return "comment";
		}

		// RegExp //...//
		if (stream.match(/^\/\/.*?(\/\/|$)/)) {
			return "regexp";
		}

		// Strings "..."
		if (stream.match(/^"([^"]|\\")*"?/)) {
			return "string";
		}

		// Strings '...'
		if (stream.match(/^'([^']|\\')*'?/)) {
			return "string";
		}

		// Hex numbers ($1234)
		if (stream.match(/^\$[0-9a-fA-F]+/)) {
			return "number";
		}

		// Decimal numbers (#12)
		if (stream.match(/^#[0-9]+/)) {
			return "number";
		}

		// Directives / Pipes
		if (stream.match(/^\|>/)) {
			return "operator";
		}

		// Words
		if (stream.match(/^[a-zA-Z_.&][a-zA-Z0-9_.]*/)) {
			const word = stream.current();
			if (commands.test(word)) return "keyword";
			if (registers.test(word)) return "variableName";
			return "variable";
		}

		// Operators / Punctuation
		stream.next();
		return "punctuation";
	},
};

export function shellRoutine() {
	return StreamLanguage.define(routineParser);
}
