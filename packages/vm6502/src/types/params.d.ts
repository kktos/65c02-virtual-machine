type ParamType =
	| "byte"
	| "wbyte"
	| "word"
	| "number"
	| "address"
	| "range"
	| "string"
	| "bool"
	| "regex"
	| "name"
	| "rest";

type Quantifier = "1" | "?" | "*" | "+";

// A single typed param with its own quantifier
type SingleParamDef = {
	type: Exclude<ParamType, "rest">;
	qty: Quantifier;
};

// "rest" stays isolated — always * and never in a choice
type RestParamDef = {
	type: "rest";
	qty: "*";
};

// A choice between 2+ fully-qualified params (each with its own type+qty)
type ChoiceParamDef = {
	oneOf: [SingleParamDef, SingleParamDef, ...SingleParamDef[]];
};

// A parameter is either a single, a choice, or a rest
export type ParamDef = SingleParamDef | ChoiceParamDef | RestParamDef;

// rest, if present, must be last
type ParamDefList = [...(SingleParamDef | ChoiceParamDef)[]] | [...(SingleParamDef | ChoiceParamDef)[], RestParamDef];
