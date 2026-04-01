import { assemble } from "@/lib/mini-assembler/mini-assembler";
import { useSymbols } from "@/composables/useSymbols";
import type { CommandContext, CommandResult, ResultOnLinePayload } from "@/types/command";
import { toHex } from "@/lib/hex.utils";
import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import { ExpressionParser, TokenType } from "@/lib/expressionParser/expressionParser";
import { miniAssemblerTokenizer } from "@/lib/mini-assembler/tokenizer";

const { addSymbol, getAddressForLabel } = useSymbols();

export const asmCmd = defineCommand({
	description: "Start mini-assembler at `address`. if `show` is specified, displays the assembled bytes.",
	paramDef: ["address", "name?"],
	group: "Assembler",
	fn: ({ vm, params, isPiped }: CommandContext): CommandResult => {
		let currentAddr = (params[0] as number) & 0xffff;
		let showBytes =
			!isPiped &&
			params.length > 1 &&
			isParamListItemIdentifier(params[1]) &&
			"SHOW".startsWith(params[1].text.toUpperCase());

		const localSymbols = new Map<string, number>();

		const parseExpression = (expr: string): number => {
			const parser = new ExpressionParser(expr, vm, miniAssemblerTokenizer);
			parser.resolveSymbol = (label: string, namespace?: string) => {
				if (label.startsWith(":")) return localSymbols.get(label);
				return getAddressForLabel(label, namespace);
			};
			const res = parser.parse();
			return res.value !== undefined ? (res.value as number) : NaN;
		};

		const parseExpressions = (expr: string): (number | string)[] => {
			const result: number[] = [];
			const parser = new ExpressionParser(expr, vm, miniAssemblerTokenizer);
			parser.resolveSymbol = (label: string, namespace?: string) => {
				if (label.startsWith(":")) return localSymbols.get(label);
				return getAddressForLabel(label, namespace);
			};
			while (!parser.eof()) {
				const res = parser.parse();
				if (res.value !== undefined) result.push(res.value as number);
				if (!parser.match(TokenType.COMMA)) break;
			}
			return result;
		};

		const defineSymbol = (name: string, value: number, isLocal?: boolean) => {
			if (isLocal) {
				localSymbols.set(name, value);
			} else {
				localSymbols.clear();
				addSymbol(value, name);
			}
		};

		const getPrompt = (addr: number) => `!${toHex(addr, 4)} `;

		const doAsm = (line: string): ResultOnLinePayload => {
			const trimmed = line.trim();
			if (!trimmed) return;
			if (trimmed.startsWith(";")) return; // Ignore comments

			const result = assemble(currentAddr, trimmed, {
				parseExpression,
				parseExpressions,
				defineSymbol,
			});
			if (result.error) return { error: `Error: ${result.error}` };

			if (result.bytes.length > 0) {
				// Write bytes to VM
				for (let i = 0; i < result.bytes.length; i++)
					vm.writeDebug((currentAddr + i) & 0xffff, result.bytes[i] as number);

				let res: ResultOnLinePayload = {};
				if (showBytes) {
					const bytesHex = result.bytes.map((b) => toHex(b, 2)).join(" ");
					res.content = `${toHex(currentAddr, 4)}: ${bytesHex.padEnd(8)} ${trimmed}`;
				}
				currentAddr = (currentAddr + result.bytes.length) & 0xffff;
				res.prompt = getPrompt(currentAddr);
				return res;
			}
		};

		return {
			__isMultiLineRequest: true,
			prompt: getPrompt(currentAddr),
			terminator: ".",
			onLine: doAsm,
			onComplete: () => {
				return "Assembly finished.";
			},
		};
	},
});
