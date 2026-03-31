import type { COMMANDS } from "@/commands";
import type { ParamList } from "@/types/command";
import type { OptionItemDef } from "@/types/options";
import type { ParamDef } from "@/types/params";
import type { Command } from "@/types/command";
import { type ExpressionParser, TokenType } from "./expressionParser";

function matchesType(value: any, allowedTypes: string[]): boolean {
	for (const type of allowedTypes) {
		if (type === "rest") return true;
		if (value === null && type === "wbyte") return true;
		if (typeof value === "string") {
			if (type === "string") return true;
			if (type === "at" && value.startsWith("@")) return true;
		}
		if (typeof value === "number") {
			if (type === "number" || type === "float") return true;
			if (type === "byte" || type === "wbyte") {
				if (value >= 0 && value <= 0xff) return true;
			}
			if (type === "word" || type === "address") {
				if (value >= 0 && value <= 0xffff) return true;
			}
		}
		if (typeof value === "object") {
			if ("start" in value && type === "range") return true;
			if ("text" in value && type === "name") return true;
			if (value instanceof RegExp && type === "regex") return true;
		}
	}
	return false;
}

function tryParseToken(parser: ExpressionParser, allowedTypes: string[]): { matched: boolean; value?: any } {
	const startPos = parser.pos;
	const token = parser.peek();

	if (token.type === TokenType.EOF) return { matched: false };

	// 1. Special Handling: wbyte wildcard (??)
	if (token.type === TokenType.DOUBLE_QUESTION && allowedTypes.includes("wbyte")) {
		parser.consume();
		return { matched: true, value: null };
	}

	// 2. Special Handling: range (strict start:end)
	if (allowedTypes.includes("range") && token.type === TokenType.INTEGER) {
		try {
			const s = parser.parse();
			if (parser.match(TokenType.COLON)) {
				const e = parser.parse();
				if (s.type === TokenType.INTEGER && e.type === TokenType.INTEGER) {
					const start = s.value as number;
					const end = e.value as number;
					return { matched: true, value: { start: Math.min(start, end), end: Math.max(start, end) } };
				}
			}
		} catch {}
		parser.pos = startPos; // Backtrack
	}

	// 3. General Parsing
	try {
		const res = parser.parse();
		let val: any = res.value;

		if (res.type === TokenType.IDENTIFIER && allowedTypes.includes("name")) {
			val = { text: res.raw, value: res.value };
		} else if (res.type === TokenType.AT) {
			val = res.raw;
		}

		if (matchesType(val, allowedTypes)) return { matched: true, value: val };
	} catch {}

	parser.pos = startPos;
	return { matched: false };
}

function tryParseOption(
	parser: ExpressionParser,
	availableOptions: readonly OptionItemDef[] | undefined,
	optsStore: Record<string, any>,
): boolean {
	if (parser.peek().type !== TokenType.DOUBLE_DASH) return false;

	const res = parser.parse();

	const optDefFound = availableOptions?.filter((o) => o.name.startsWith(res.raw)) as OptionItemDef[];
	if (optDefFound.length > 1) throw new Error(`Unknown option "--${res.raw}".`);
	const optDef = optDefFound[0];

	const optName = optDef.name;

	let val: any = true;

	if (parser.match(TokenType.ASSIGN)) {
		const valRes = parser.parse();
		val = valRes.value;

		if (val === undefined && valRes.type === TokenType.IDENTIFIER) {
			const text = valRes.raw.toLowerCase();
			if (text === "true") val = true;
			else if (text === "false") val = false;
			else val = valRes.raw;
		}
	}

	if (optDef.value) {
		const { kind } = optDef.value;
		if (kind === "number") {
			if (typeof val !== "number") throw new Error(`Option "--${optName}" expects a number.`);
		} else if (kind === "string") {
			if (typeof val !== "string" && typeof val !== "number")
				throw new Error(`Option "--${optName}" expects a string.`);
			val = String(val);
		} else if (kind === "oneOf") {
			const choices = optDef.value.choices as readonly string[];
			if (!choices.includes(String(val)))
				throw new Error(`Option "--${optName}" expects one of: ${choices.join(", ")}`);
			val = String(val);
		}
	} else {
		if (typeof val !== "boolean") {
			if (val === 0) val = false;
			else if (val === 1) val = true;
			else if (typeof val === "string" && val.toLowerCase() === "false") val = false;
			else if (typeof val === "string" && val.toLowerCase() === "true") val = true;
			else throw new Error(`Option "--${optName}" is a flag and expects a boolean.`);
		}
	}

	optsStore[optName] = val;
	return true;
}

function getParamDefinition(def: ParamDef) {
	if ("oneOf" in def) {
		return {
			allowedTypes: def.oneOf.map((p) => p.type),
			qty: def.oneOf[0].qty,
		};
	}
	return {
		allowedTypes: [def.type],
		qty: def.qty,
	};
}

export function parseCommandParams(
	cmdParser: ExpressionParser,
	cmd: COMMANDS,
	startParamIndex: number,
	userParams: ParamList,
	cmdSpec: Command,
	injectedValue?: any,
) {
	const opts: Record<string, any> = {};
	const paramDef = cmdSpec.paramDef;
	const paramDefs = paramDef || [];

	let defIndex = startParamIndex;
	let injectedConsumed = false;
	let hasAMatch = false;

	while (defIndex < paramDefs.length) {
		const def = paramDefs[defIndex];
		const { allowedTypes, qty } = getParamDefinition(def);
		const isOptional = qty === "?" || qty === "*";
		const isVariadic = qty === "*" || qty === "+";

		let matchesForThisDef = 0;

		while (true) {
			if (tryParseOption(cmdParser, cmdSpec.options, opts)) continue;

			// Try to parse from token stream
			const { matched, value } = tryParseToken(cmdParser, allowedTypes);

			if (matched) {
				hasAMatch = true;
				userParams.push(value);
				cmdParser.match(TokenType.COMMA); // optional comma consumption
				matchesForThisDef++;
				if (!isVariadic) break; // If not variadic, move to next definition
				continue;
			}

			// Try to use injected value if parsing failed/EOF
			if (!injectedConsumed && injectedValue !== undefined && matchesType(injectedValue, allowedTypes)) {
				userParams.push(injectedValue);
				injectedConsumed = true;
				matchesForThisDef++;
				if (!isVariadic) break;
				continue;
			}

			break; // No match found
		}

		if (matchesForThisDef === 0 && !isOptional)
			throw new Error(`Missing required parameter: ${allowedTypes.join("|")}`);

		defIndex++;
	}

	while (!cmdParser.eof()) {
		if (tryParseOption(cmdParser, cmdSpec.options, opts)) continue;
		if (hasAMatch) throw new Error(`Too many parameters for command "${cmd}".`);
		else throw new Error(`Wrong type of parameters for command "${cmd}"`);
	}
	if (!injectedConsumed && injectedValue !== undefined) throw new Error("Too many parameters (piped value unused).");

	if (cmdSpec.options) {
		for (const opt of cmdSpec.options) {
			if (!(opt.name in opts)) {
				if (opt.value) {
					if (opt.value.default !== undefined) opts[opt.name] = opt.value.default;
				} else {
					opts[opt.name] = false;
				}
			}
		}
	}

	let finalParams: ParamList = userParams;
	if (cmdSpec.staticParams) {
		if (cmdSpec.staticParams.prepend) finalParams = [...cmdSpec.staticParams.prepend, ...finalParams];
		if (cmdSpec.staticParams.append) finalParams = [...finalParams, ...cmdSpec.staticParams.append];
	}

	return { params: finalParams, opts };
}
