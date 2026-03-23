// Utility to transform Union types to Intersection types
// e.g. { a: string } | { b: number } => { a: string } & { b: number }
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

// ─── Option value types ───────────────────────────────────────────────────────

export type OptionValueDef =
	| { kind: "number"; default?: number }
	| { kind: "string"; default?: string }
	| { kind: "oneOf"; choices: [string, string, ...string[]]; default?: string };

export type OptionItemDef = { name: string; value?: never } | { name: string; value: OptionValueDef };

// ─── Options type inference ───────────────────────────────────────────────────

type ResolveOptionValue<V extends OptionValueDef> = V extends { kind: "number" }
	? number
	: V extends { kind: "string" }
		? string
		: V extends { kind: "oneOf"; choices: infer C extends readonly string[] }
			? C[number]
			: never;

export type ResolveOption<O extends OptionItemDef> = O extends { name: infer N extends string; value?: never }
	? { [K in N]: boolean }
	: O extends { name: infer N extends string; value: infer V extends OptionValueDef }
		? undefined extends V["default"]
			? { [K in N]?: ResolveOptionValue<V> }
			: { [K in N]: ResolveOptionValue<V> }
		: never;

// Use UnionToIntersection to merge the array of options into one object
export type ResolveOptions<O extends readonly OptionItemDef[]> = UnionToIntersection<
	{ [K in keyof O]: O[K] extends OptionItemDef ? ResolveOption<O[K]> : never }[number]
>;
