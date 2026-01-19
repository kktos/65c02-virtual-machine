    .ORG $1000

    ; Apple II Soft Switches
    KBD      = $C000    ; Keyboard Data
    KBDSTRB  = $C010    ; Keyboard Strobe
    TXTCLR   = $C050    ; Switch to Graphics Mode
    TXTSET   = $C051    ; Switch to Text Mode
    MIXSET   = $C052    ; Enable Mixed Mode (Graphics + 4 lines text)
    MIXCLR   = $C053    ; Disable Mixed Mode (Full Graphics)
    TXTPAGE1 = $C054    ; Select Page 1
    HIRES    = $C057    ; Select Hi-Res Mode

    ; Zero Page Pointers
    PTR_L    = $FE
    PTR_H    = $FF
    CV       = $25      ; Cursor Vertical Position

START:
    ; 1. Setup: Clear HGR screen and draw something
    JSR CLEAR_HGR
    JSR DRAW_RECTS

    ; 2. Activate HGR Mixed Mode
    BIT TXTCLR      ; Graphics
    BIT HIRES       ; Hi-Res
    BIT TXTPAGE1    ; Page 1
    BIT MIXSET      ; Mixed (Text at bottom)

    ; 3. Write "MIX" to the text window (Line 22 starts at $0750)
    LDA #$CD        ; 'M' (High bit set for normal video)
    STA $0750
    LDA #$C9        ; 'I'
    STA $0751
    LDA #$D8        ; 'X'
    STA $0752

    ; 4. Wait for user input
    JSR WAIT_KEY

    ; 5. Switch to Full Screen HGR
    BIT MIXCLR      ; Clear Mixed flag -> Full Screen

    ; 6. Wait for user input
    JSR WAIT_KEY

    ; 7. Set Cursor to visible line (21)
    LDA #21
    STA CV

    ; 8. Restore Text Mode and Exit
    BIT TXTSET
    RTS

; --- Subroutines ---

WAIT_KEY:
    LDA KBD         ; Load keyboard data
    BPL WAIT_KEY    ; Loop if bit 7 is clear (no key pressed)
    BIT KBDSTRB     ; Clear the strobe
    RTS

CLEAR_HGR:
    LDA #$00
    STA PTR_L       ; Start at $xx00
    LDA #$20        ; Start at $2000 (HGR Page 1)
    STA PTR_H
    LDY #$00
    TYA             ; A = 0
LOOP1:
    STA (PTR_L),Y   ; Clear byte
    INY
    BNE LOOP1       ; Loop 256 times
    INC PTR_H       ; Next page
    LDA PTR_H
    CMP #$40        ; Stop at $4000
    BNE LOOP1
    RTS

DRAW_RECTS:
    LDA #$00
    STA PTR_L
    LDA #$20
    STA PTR_H
    LDY #$00
LOOP_PAGE:
    ; We iterate through all bytes.
    ; Map offset to column to determine color.
    ; 0-39: Col 0-39
    ; 40-79: Col 0-39
    ; 80-119: Col 0-39
    ; 120-127: Holes
    TYA
    AND #$7F        ; Mod 128
    CMP #120
    BCS NEXT       ; Skip screen holes

    ; Normalize to 0-39
    CMP #80
    BCC TRY40
    SBC #80
    JMP COLOR
TRY40:
    CMP #40
    BCC COLOR
    SBC #40
COLOR:
    ; A is 0-39
    CMP #10
    BCC GREEN
    CMP #20
    BCC VIOLET
    CMP #30
    BCC ORANGE
    ; BLUE
    LDA #$D5
    BNE DRAW
GREEN:
    LDA #$2A
    BNE DRAW
VIOLET:
    LDA #$55
    BNE DRAW
ORANGE:
    LDA #$AA
DRAW:
    STA (PTR_L),Y
NEXT:
    INY
    BNE LOOP_PAGE
    INC PTR_H
    LDA PTR_H
    CMP #$40
    BNE LOOP_PAGE
    RTS
