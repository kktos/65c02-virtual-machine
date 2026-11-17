asm $300
; IMU example: vectored interrupts on the //e (see IMU.md).
; The built-in timer (IMU ID 8, AppleTimer, $C0B8) pulses every second; its handler counts
; the seconds in BCD at the top right of the 40-column text screen.
;
; Paste this file in the debugger console (it assembles at $300 with the mini-assembler),
; then 300G in the console, CALL 768 from BASIC or 300G from the Monitor. It returns at once,
; the counter runs on.
; A reset stops the timer and turns vectoring off.
;
; Mini-assembler: comments on lines of their own, labels local (":") so none is saved
; as a symbol, and no < / > operators (&$FF, /256).
;
; IMU registers: INDEX, DATA LO, DATA HI, CURRENT (read) / EOI (write)
:IMU_INDEX EQU $C0B0
:IMU_DATALO EQU $C0B1
:IMU_DATAHI EQU $C0B2
:IMU_EOI EQU $C0B3
; The timer: CTRL (bit 7 runs it), ACK (releases its line)
:TMR_CTRL EQU $C0B8
:TMR_ACK EQU $C0B9
;
; INDEX / DATA sequences run with interrupts off
:INSTALL PHP
 SEI
; HANDLER 8 ($20 + ID): DATA LO is staged, DATA HI commits
 LDA #$28
 STA :IMU_INDEX
 LDA #:TICK&$FF
 STA :IMU_DATALO
 LDA #:TICK/256
 STA :IMU_DATAHI
; CTRL: vectoring on
 LDA #$00
 STA :IMU_INDEX
 LDA #$80
 STA :IMU_DATALO
; Timer on: every PERIOD frames (60 at reset)
 LDA #$80
 STA :TMR_CTRL
 PLP
 CLI
 RTS
;
; The handler: entered straight from the IRQ (no $FFFE/F, no $3FE), I set
:TICK PHA
; The timer releases its line
 STA :TMR_ACK
; COUNT += 1, in BCD
 SED
 CLC
 LDA :COUNT
 ADC #1
 STA :COUNT
 LDA :COUNT+1
 ADC #0
 STA :COUNT+1
 CLD
; 4 digits at line 0, columns 36-39
 LDA :COUNT+1
 JSR :DIGITS
 STA $0425
 STX $0424
 LDA :COUNT
 JSR :DIGITS
 STA $0427
 STX $0426
; End of interrupt: ID 8 leaves service, then return to the interrupted code
 STA :IMU_EOI
 PLA
 RTI
;
; A: 2 BCD digits -> X: the high one, A: the low one (normal characters)
:DIGITS PHA
 LSR
 LSR
 LSR
 LSR
 ORA #$B0
 TAX
 PLA
 AND #$0F
 ORA #$B0
 RTS
;
:COUNT .DW 0
.
