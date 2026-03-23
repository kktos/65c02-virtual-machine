import type { ParamType, Quantifier, SingleParamDef, RestParamDef, ParamDef, ParamDefList } from "@/types/params";

function parseQuantifier(raw: string): { type: string; qty: Quantifier } {
	const QUANTIFIERS = new Set(["?", "*", "+"]);
	const last = raw[raw.length - 1];
	if (QUANTIFIERS.has(last)) {
		return { type: raw.slice(0, -1), qty: last as Quantifier };
	}
	return { type: raw, qty: "1" };
}

function parseSingleOrRest(raw: string): SingleParamDef | RestParamDef {
	const PARAM_TYPES = new Set<ParamType>([
		"byte",
		"wbyte",
		"word",
		"number",
		"address",
		"range",
		"string",
		"bool",
		"regex",
		"name",
		"rest",
	]);

	const { type, qty } = parseQuantifier(raw);

	if (!PARAM_TYPES.has(type as ParamType)) throw new Error(`Unknown param type: "${type}"`);

	if (type === "rest") {
		if (qty !== "1" && qty !== "+")
			throw new Error(`"rest" only supports implicit(1) or + quantifier, got "${qty}"`);
		return { type: "rest", qty: "+" };
	}

	return { type: type as Exclude<ParamType, "rest">, qty };
}

function parseParamDef(token: string): ParamDef {
	const parts = token.split("|");

	if (parts.length === 1) return parseSingleOrRest(parts[0]);

	// choice — must not contain "rest"
	const choices = parts.map((p) => {
		const parsed = parseSingleOrRest(p);
		if (parsed.type === "rest") throw new Error(`"rest" cannot appear in a choice`);
		return parsed as SingleParamDef;
	});

	return { oneOf: choices as [SingleParamDef, SingleParamDef, ...SingleParamDef[]] };
}

export function parseParamList(tokens: string[]): ParamDefList {
	const result: ParamDef[] = tokens.map(parseParamDef);

	// validate rest position
	const restIndex = result.findIndex((p) => "type" in p && p.type === "rest");
	if (restIndex !== -1 && restIndex !== result.length - 1)
		throw new Error(`"rest" must be the last parameter (found at index ${restIndex})`);

	return result as ParamDefList;
}
