import { describe, expect, it, vi } from "vitest";
import { fakeRegisters } from "@/lib/tests/fakeRegisters";

vi.mock("@/composables/useSymbols", () => ({ useSymbols: () => ({ getAddressForLabel: () => undefined }) }));

const { ExpressionParser } = await import("@/lib/expressionParser/expressionParser");

const registers = fakeRegisters();
const vm = {
	...registers,
	isRunningOrStarting: false,
	// As the VM's: a running machine's registers can't be written
	updateRegister: vi.fn((reg: "A" | "PC", value: number) => {
		if (vm.isRunningOrStarting) throw new Error("running");
		registers.updateRegister(reg, value);
	}),
};
const evaluate = (source: string) => new ExpressionParser(source, vm as never).parse().value;

describe("registers in expressions", () => {
	it("reads them", () => {
		vm.updateRegister("A", 0x42);
		vm.updateRegister("PC", 0xc600);
		expect(evaluate("a")).toBe(0x42);
		expect(evaluate("pc + 1")).toBe(0xc601);
	});

	it("INC steps one, wrapping at its size", () => {
		vm.updateRegister("A", 0xff);
		vm.updateRegister("PC", 0xfffe);
		expect(evaluate("INC(a)")).toBe(0);
		expect(evaluate("INC(pc, 3)")).toBe(1);
		expect(vm.getRegisters()).toMatchObject({ A: 0, PC: 1 });
		expect(() => evaluate("INC(toString)")).toThrow(/Unknown register/);
	});

	it("INC on a running machine reports it, rather than losing the write", () => {
		vm.isRunningOrStarting = true;
		expect(() => evaluate("INC(a)")).toThrow(/running/);
		vm.isRunningOrStarting = false;
	});
});
