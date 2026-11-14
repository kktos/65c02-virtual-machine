import { describe, expect, it, vi } from "vitest";
import { PIA6821 } from "../pia6821";

describe("PIA 6821", () => {
	it("selects the DDR or the port by the control register's bit 2", () => {
		const pia = new PIA6821({ readPortA: () => 0xa5 });
		pia.write(0, 0x0f); // DDRA: bits 0-3 out
		expect(pia.read(0)).toBe(0x0f);
		pia.write(1, 0x04); // port
		pia.write(0, 0x03);
		expect(pia.read(0)).toBe(0xa3); // inputs from outside, outputs from ORA
		expect(pia.outputA).toBe(0x03);
	});

	it("CB1 sets the flag; the IRQ when enabled; reading port B clears it", () => {
		const irq = vi.fn();
		const pia = new PIA6821({ irq });
		pia.write(3, 0x05); // port B, CB1 IRQ enabled
		pia.pulseCB1();
		expect(pia.read(3) & 0x80).toBe(0x80);
		expect(irq).toHaveBeenLastCalledWith(true);
		pia.read(2);
		expect(pia.read(3) & 0x80).toBe(0);
		expect(irq).toHaveBeenLastCalledWith(false);
	});

	it("keeps the flag without the IRQ when CB1's IRQ is disabled", () => {
		const irq = vi.fn();
		const pia = new PIA6821({ irq });
		pia.write(3, 0x04);
		pia.pulseCB1();
		expect(pia.read(3) & 0x80).toBe(0x80);
		expect(irq).not.toHaveBeenCalled();
		pia.write(3, 0x05); // enabling it with the flag set raises the IRQ
		expect(irq).toHaveBeenLastCalledWith(true);
	});

	it("peek doesn't clear the flags", () => {
		const pia = new PIA6821();
		pia.write(3, 0x05);
		pia.pulseCB1();
		pia.peek(2);
		expect(pia.irq).toBe(true);
	});
});
