import {
	REG_A_OFFSET,
	REG_PC_OFFSET,
	REG_SP_OFFSET,
	REG_STATUS_OFFSET,
	REG_X_OFFSET,
	REG_Y_OFFSET,
} from "./shared-memory";

/**
 * The CPU's registers, for a device that reads or sets them during an instruction (a firmware call it serves).
 * While the CPU executes, they are its own (kept out of the shared registers view, written back when it stops):
 * a device must go through this, not the view. `pc` is the address of the instruction being executed.
 */
export interface CpuRegisters {
	a: number;
	x: number;
	y: number;
	/** The status register (P). */
	p: number;
	sp: number;
	readonly pc: number;
}

/** The registers in the shared registers view: when no CPU runs (a device tested alone). */
export const viewRegisters = (view: DataView): CpuRegisters => ({
	get a() {
		return view.getUint8(REG_A_OFFSET);
	},
	set a(value) {
		view.setUint8(REG_A_OFFSET, value);
	},
	get x() {
		return view.getUint8(REG_X_OFFSET);
	},
	set x(value) {
		view.setUint8(REG_X_OFFSET, value);
	},
	get y() {
		return view.getUint8(REG_Y_OFFSET);
	},
	set y(value) {
		view.setUint8(REG_Y_OFFSET, value);
	},
	get p() {
		return view.getUint8(REG_STATUS_OFFSET);
	},
	set p(value) {
		view.setUint8(REG_STATUS_OFFSET, value);
	},
	get sp() {
		return view.getUint8(REG_SP_OFFSET);
	},
	set sp(value) {
		view.setUint8(REG_SP_OFFSET, value);
	},
	get pc() {
		return view.getUint16(REG_PC_OFFSET, true);
	},
});
