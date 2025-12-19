import type { Breakpoint } from "./breakpoint.interface";

export interface EmulatorState {
	registers: {
		A: number;
		X: number;
		Y: number;
		PC: number;
		SP: number;
		P: number;
		C: boolean;
		Z: boolean;
		I: boolean;
		D: boolean;
		B: boolean;
		V: boolean;
		N: boolean;
	};
	breakpoints: Breakpoint[];
}
