import machine from "./machines/apple2e-enhanced/machine.js";
import VM from "./vm.js";
import {hexbyte} from "./utils.js";

// import machine from "./machines/klaus-test-suite/machine.js";
// import machine from "./machines/apple2-plus/machine.js";

async function main() {
	const canvas= document.getElementById("screen");
	const vm= new VM(canvas, machine);
	await vm.setup();
	vm.start();

	window.R= async (bank, addr, isDebug) => {
		const rez= await vm.DBG_memRead(bank, addr, isDebug);
		console.log(hexbyte(rez));
	};
	window.W= async (bank, addr, value) => {
		await vm.DBG_memWrite(bank, addr, value);
	};
	window.S= async (from, to, value) => {
		await vm.DBG_memSearch(from, to, value);
	};
}


main();

const src=`
HOME EQU $FC58 ;CLEAR SCREEN
INIT EQU $FB2F ;HOME CURSOR
SPKR EQU $C030 ;SPEAKER CLICK OUTPUT
WAIT EQU $FCA8 ;TIME DELAY SET BY ACCUMULATOR


; THE DEMO PROGRAM PLAYS EACH OF THE SIXTEEN
; SOUND EFFECTS IN ORDER, SEPARATED BY A
; TIME DELAY.



		.ORG $800

DEMO4	JSR INIT 		;MAKE SCREEN BLANK
		JSR HOME
		LDA #$00 		;START WITH FIRST NOTE
		PHA 			;AND SAVE ON STACK

NXTNOT4 TAX
		JSR OBNOX4 		;AND PLAY IT
		LDY #10			;STALL FOR TIME

STALL4 	JSR WAIT
		DEY
		BNE STALL4 		;TILL DELAY DONE

		PLA 			;GET NOTE NUMBER
		CMP FLNGTH4 	;DONE WITH LAST NOTE?
		BEQ DONE4 		;YES, EXIT

		CLC
		ADC #$01 		;NO, PICK NEXT NOTE
		PHA
		BNE NXTNOT4 	;ALWAYS

DONE4	RTS 			; AND EXIT


BASENT4 LDX #$00 		;BASIC POKE HERE+1
OBNOX4	PHP 			;ML ENTRY POINT
		PHA
		TYA 			;SAVE P,A, AND Y REGS
		PHA

		TXA 			;RANGE CHECK ON SELECTION
		CMP FLNGTH4 	;TO MAKE SURE ITS IN FILE
		BCC LOK4
		LDA #$00 		;DEFAULT TO ZERO SELECTION
LOK4 	ASL 			;AND DOUBLE FILE POINTER
		TAX
		LDA SEFO,X 		;GET NUMBER OF TRIPS
		STA TRPCNT4 	;AND SAVE
		INX
		LDA SEFO,X 		;GET SWEEP RANGE
		STA SWEEP4+1 	;AND SAVE

SWEEP4 	LDY #$00 		;SWEEP VALUE POKED HERE
NXTSWP4 TYA
		TAX 			;DURATION
NXTCYC4 TYA 			;PITCH
		JSR WAIT
		BIT SPKR 		;WRAP SPEAKER
		CPX #$80 		;J BYPASS IF GEIGER
		BEQ EXIT4 		;SPECIAL EFFECT
		DEX
		BNE NXTCYC4 	;ANOTHER CYCLE
		DEY
		BNE NXTSWP4 	;GO UP IN PITCH
		DEC TRPCNT4 	;MADE ALL TRIPS?
		BNE SWEEP4 		;NO, REPEAT

EXIT4 	PLA 			;RESTORE REGISTERS
		TAY
		PLA
		PLP
		RTS 			;AND EXIT

TRPCNT4
		.BYT $01			;TRIP COUNT DECREMENTED HERE
FLNGTH4
		.BYT $10			;SIXTEEN AVAILABLE SOUNDS

; SIXTEEN AVAILABLE SOUNDS
; *** SOUND EFFECT FILES ***
; EACH NOTE TAKES A TRIP AND A SWEEP VALUE IN SEQUENCE. 175
; ADD $80 TO NUMBER OF GEIGER CLICKS WANTED.

SEFO
		.BYT $01,$08 ; TICK
SEF1
		.BYT $01,$18 ; WHOPIDOOP
SEF2
		.BYT $FF,$01 ; PIP
SEF3
		.BYT $06,$10 ; PHASOR
SEF4
		.BYT $01,$30 ; MUSIC SCALE
SEF5
		.BYT $20,$06 ; SHORT BRASS
SEF6
		.BYT $70,$06 ; MED1.UM BkASS
SEF7
		.BYT $FF,$06 ; LONG BRASS
SEF8
		.BYT $01,$A0 ; GEIGER
SEF9
		.BYT $FF,$02 ; GLEEP
SEF10
		.BYT $04,$1C ; GLISSADE
SEF11
		.BYT $01,$10 ; QWIP
SEF12
		.BYT $30,$0B ; OBOE
SEF13
		.BYT $30,$07 ; FRENCH HORN
SEF14
		.BYT $50,$09 ; ENGLISH HORN
SEF15
		.BYT $01,$64 ; TIME BOMB
`;
document.getElementById("editor").innerText= src;
