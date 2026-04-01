import { useSymbols } from "@/composables/useSymbols";
import type { CommandContext, CommandResult, ResultOnLinePayload } from "@/types/command";
import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import { ExpressionParser, TokenType } from "@/lib/expressionParser/expressionParser";
import { miniAssemblerTokenizer } from "@/lib/mini-assembler/tokenizer";
import { assemble } from "@/lib/mini-assembler/mini-assembler";

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

		// const getPrompt = (addr: number) => `!${toHex(addr, 4)} `;

		const lines: string[] = [];
		const doAsm = (line: string): ResultOnLinePayload => {
			const trimmed = line.trim();
			if (!trimmed) return;
			if (trimmed.startsWith(";")) return; // Ignore comments

			lines.push(trimmed);
			// const result = assemble(currentAddr, trimmed, {
			// 	parseExpression,
			// 	parseExpressions,
			// 	defineSymbol,
			// });
			// if (typeof result === "string") return { error: `Error: ${result}` };
			// if (!result) return;

			// currentAddr = result.pc;
			// const bytes = result.bytes;
			// if (bytes && bytes.length > 0) {
			// 	// Write bytes to VM
			// 	for (let i = 0; i < bytes.length; i++) vm.writeDebug(currentAddr + i, bytes[i] as number);

			// 	let res: ResultOnLinePayload = {};
			// 	if (showBytes) {
			// 		const bytesHex = bytes.map((b) => toHex(b, 2)).join(" ");
			// 		res.content = `${formatAddress(currentAddr)}: ${bytesHex.padEnd(10)} ${trimmed}`;
			// 	}
			// 	currentAddr = currentAddr + bytes.length;
			// 	res.prompt = getPrompt(currentAddr);
			// 	return res;
			// }
		};

		return {
			__isMultiLineRequest: true,
			prompt: "!", //getPrompt(currentAddr),
			terminator: ".",
			onLine: doAsm,
			onComplete: () => {
				const source = lines.join("\n");
				const result = assemble(currentAddr, source, {
					parseExpression,
					parseExpressions,
					defineSymbol,
				});

				if (typeof result === "string") return { error: result };

				let totalBytes = 0;
				for (const segment of result.segments) {
					for (let i = 0; i < segment.bytes.length; i++) {
						vm.writeDebug(segment.address + i, segment.bytes[i]);
						totalBytes++;
					}
				}

				return `Assembly finished. ${totalBytes} bytes written across ${result.segments.length} segment(s).`;
			},
		};
	},
});
