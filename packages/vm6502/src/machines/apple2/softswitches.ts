/*
http://www.lazilong.com/apple_II/bbros/ascii.jpg
 */
/*
APPLE IIe Auxiliary Memory Softswitches

-- MEMORY MANAGEMENT SOFT SWITCHES
$C000 W 80STOREOFF Allow page2 to switch video page1 page2
$C001 W 80STOREON Allow page2 to switch main & aux video memory
$C002 W RAMRDOFF Read enable main memory from $0200-$BFFF
$C003 W RAMDRON Read enable aux memory from $0200-$BFFF
$C004 W RAMWRTOFF Write enable main memory from $0200-$BFFF
$C005 W RAMWRTON Write enable aux memory from $0200-$BFFF
$C006 W INTCXROMOFF Enable slot ROM from $C100-$CFFF
$C007 W INTCXROMON Enable main ROM from $C100-$CFFF

$C008 W ALZTPOFF Enable main memory from $0000-$01FF & avl BSR
$C009 W ALTZPON Enable aux memory from $0000-$01FF & avl BSR

$C00A W SLOTC3ROMOFF Enable main ROM from $C300-$C3FF
$C00B W SLOTC3ROMON Enable slot ROM from $C300-$C3FF

-- VIDEO SOFT SWITCHES
$C00C W 80COLOFF Turn off 80 column display
$C00D W 80COLON Turn on 80 column display
$C00E W ALTCHARSETOFF Turn off alternate characters
$C00F W ALTCHARSETON Turn on alternate characters
$C050 R/W TEXTOFF Select graphics mode
$C051 R/W TEXTON Select text mode
$C052 R/W MIXEDOFF Use full screen for graphics
$C053 R/W MIXEDON Use graphics with 4 lines of text
$C054 R/W PAGE2OFF Select panel display (or main video memory)
$C055 R/W PAGE2ON Select page2 display (or aux video memory)
$C056 R/W HIRESOFF Select low resolution graphics
$C057 R/W HIRESON Select high resolution graphics

$C022 R/W TBCOLOR IIgs Screen Color: (0-3) Low Nibble is BG, (4-7) High Nibble is Text

-- SOFT SWITCH STATUS FLAGS
$C010 R7 AKD 1=key pressed 0=keys free (clears strobe)
$C011 R7 BSRBANK2 1=bank2 available 0=bank1 available
$C012 R7 BSRREADRAM 1=BSR active for read 0=$D000-$FFFF active

$C013 R7 RAMRD 0=main $0200-$BFFF active reads 1=aux active
$C014 R7 RAMWRT 0=main $0200-$BFFF active writes 1=aux writes

$C015 R7 INTCXROM 1=main $C100-$CFFF ROM active 0=slot active
$C016 R7 ALTZP 1=aux $0000-$1FF+auxBSR 0=main available
$C017 R7 SLOTC3ROM 1=slot $C3 ROM active 0=main $C3 ROM active
$C018 R7 80STORE 1=page2 switches main/aux 0=page2 video
$C019 R7 VERTBLANK 1=vertical retrace on 0=vertical retrace off
$C01A R7 TEXT 1=text mode is active 0=graphics mode active
$C01B R7 MIXED 1=mixed graphics & text 0=full screen
$C01C R7 PAGE2 1=video page2 selected or aux
$C01D R7 HIRES 1=high resolution graphics 0=low resolution
$C01E R7 ALTCHARSET 1=alt character set on 0=alt char set off
$C01F R7 80COL 1=80 col display on 0=80 col display off

$C073 W BANKSEL RAMworks-style Aux RAM Card bank select

"Language Card" area Switches
Bank 1 and Bank 2 here are the 4K banks at $D000-$DFFF. The
remaining area from $E000-$FFFF is the same for both
sets of switches.

$C080 ;LC RAM bank2, Read and WR-protect RAM

$C081 ROMIN;LC RAM bank2, Read ROM instead of RAM,
;two or more successive reads WR-enables RAM

$C082 ;LC RAM bank2, Read ROM instead of RAM,
;WR-protect RAM

$C083 LCBANK2 ;LC RAM bank2, Read RAM
;two or more successive reads WR-enables RAM

$C088 ;LC RAM bank1, Read and WR-protect RAM
$C089 ;LC RAM bank1, Read ROM instead of RAM,
;two or more successive reads WR-enables RAM

$C08A ;LC RAM bank1, Read ROM instead of RAM,
;WR-protect RAM

$C08B LCBANK1 ;LC RAM bank1, Read RAM
;two or more successive reads WR-enables RAM

$C084-$C087 are echoes of $C080-$C083
$C08C-$C08F are echoes of $C088-$C08B

$C080 R  LCRAMIN2 Read RAM bank 2; no write
$C081 RR ROMIN2 Read ROM; write RAM bank 2
$C082 R  LCROMIN2 Read ROM; no write
$C083 RR LCBANK2 Read/write RAM bank 2

*/
// R KBD
export const KBD = 0xc000;
// R KBDSTRB
export const KBDSTRB = 0xc010;

// W 80STOREOFF Allow page2 to switch video page1 page2
export const STORE80OFF = 0xc000;
// W 80STOREON Allow page2 to switch main & aux video memory
export const STORE80ON = 0xc001;
// R7 80STORE 1=page2 switches main/aux 0=page2 video
export const STORE80 = 0xc018;

// W ALTCHARSETOFF Turn off alternate characters
export const ALTCHARSETOFF = 0xc00e;
// W ALTCHARSETON Turn on alternate characters
export const ALTCHARSETON = 0xc00f;
// R7 ALTCHARSET 1=alt character set on 0=alt char set off
export const ALTCHARSET = 0xc01e;

// R7 TEXT 1=text mode is active 0=graphics mode active
export const TEXT = 0xc01a;
// R7 MIXED 1=mixed graphics & text 0=full screen
export const MIXED = 0xc01b;
// R7 HIRES 1=high resolution graphics 0=low resolution
export const HIRES = 0xc01d;

// W RAMRDOFF Read enable main memory from $0200-$BFFF
export const RAMRDOFF = 0xc002;
// W RAMDRON Read enable aux memory from $0200-$BFFF
export const RAMRDON = 0xc003;
// W RAMWRTOFF Write enable main memory from $0200-$BFFF
export const RAMWRTOFF = 0xc004;
// W RAMWRTON Write enable aux memory from $0200-$BFFF
export const RAMWRTON = 0xc005;

// W 80COLOFF Turn off 80 column display
export const COL80OFF = 0xc00c;
// W 80COLON Turn on 80 column display
export const COL80ON = 0xc00d;
// R7 80COL 1=80 col display on0=80 col display off
export const COL80 = 0xc01f;

// R/W Select graphics mode
export const TEXTOFF = 0xc050;
// R/W Select text mode
export const TEXTON = 0xc051;
// R/W Use full screen for graphics
export const MIXEDOFF = 0xc052;
// R/W Use graphics with 4 lines of text
export const MIXEDON = 0xc053;
// R/W Select low resolution graphics
export const HIRESOFF = 0xc056;
// R/W Select high resolution graphics
export const HIRESON = 0xc057;

// R/W PAGE2OFF Select panel display (or main video memory)
export const PAGE2OFF = 0xc054;
// R/W PAGE2ON Select page2 display (or aux video memory)
export const PAGE2ON = 0xc055;
// R7 PAGE2 1=video page2 selected or aux
export const PAGE2 = 0xc01c;

// R/W TBCOLOR IIgs Screen Color: (0-3) Low Nibble is BG, (4-7) High Nibble is Text
export const TBCOLOR = 0xc022;

// W INTCXROMOFF Enable slot ROM from $C100-$C7FF (but $C800-$CFFF depends on INTC8ROM)
export const INTCXROMOFF = 0xc006;
// W INTCXROMON Enable main ROM from $C100-$CFFF
export const INTCXROMON = 0xc007;
// R7 INTCXROM 1=main $C100-$CFFF ROM active 0=slot active
export const INTCXROM = 0xc015;

// R7 SLOTC3ROM 1=slot $C3 ROM active 0=main $C3 ROM active
export const SLOTC3ROM = 0xc017;
// W SLOTC3ROMOFF Enable main ROM from $C300-$C3FF
export const SLOTC3ROMOFF = 0xc00a;
// W SLOTC3ROMON Enable slot ROM from $C300-$C3FF
export const SLOTC3ROMON = 0xc00b;

// W Enable main memory from $0000-$01FF & $D000-$FFFF
export const ALTZPOFF = 0xc008;
// W Enable aux memory from $0000-$01FF & $D000-$FFFF
export const ALTZPON = 0xc009;
// R7 ALTZP 1=aux $0000-$1FF+auxBSR 0=main available
export const ALTZP = 0xc016;

// R7 RAMRD 0=main $0200-$BFFF active reads 1=aux active
export const RAMRD = 0xc013;
// R7 RAMWRT 0=main $0200-$BFFF active writes 1=aux writes
export const RAMWRT = 0xc014;

// R7 RDLCBNK2 1=bank2 available 0=bank1 available
export const RDLCBNK2 = 0xc011;
// R7 BSRREADRAM 1=LC active for read 0=ROM active
export const RDLCRAM = 0xc012;

// LC BANK2

// R  LCRAMIN2 Read RAM bank 2; no write
export const LCRAMIN2 = 0xc080;
// RR ROMIN2 Read ROM; write RAM bank 2
export const ROMIN2 = 0xc081;
// R  LCROMIN2 Read ROM; no write
export const LCROMIN2 = 0xc082;
// RR LCBANK2 Read/write RAM bank 2
export const LCBANK2 = 0xc083;
// echoes of C080-C083
export const LC_C084 = 0xc084;
export const LC_C085 = 0xc085;
export const LC_C086 = 0xc086;
export const LC_C087 = 0xc087;

// LC BANK1

// R LC RAM bank1, Read and WR-protect RAM
export const LCRAMIN1 = 0xc088;
// RR LC RAM bank1, Read ROM instead of RAM,
// ;two or more successive reads WR-enables RAM
export const ROMIN1 = 0xc089;
// R LC RAM bank1, Read ROM instead of RAM,
// ;WR-protect RAM
export const LCROMIN1 = 0xc08a;
// RR LCBANK1 ;LC RAM bank1, Read RAM
// two or more successive reads WR-enables RAM
export const LCBANK1 = 0xc08b;
// echoes of C088-C08B
export const LC_C08C = 0xc08c;
export const LC_C08D = 0xc08d;
export const LC_C08E = 0xc08e;
export const LC_C08F = 0xc08f;

export const BANKSEL = 0xc073;

// R7 =1 open apple is pressed
export const PB0 = 0xc061;
// R7 =1 solid apple is pressed
export const PB1 = 0xc062;

export const PADDL0 = 0xc064;
export const PADDL1 = 0xc065;
export const PADDL2 = 0xc066;
export const PADDL3 = 0xc067;
export const PTRIG = 0xc070;

export const SLOT7F1 = 0xc0f1;

export const SLOT7FF = 0xc0ff;

// Slot 3 I/O
export const SLOT3_00 = 0xc0b0;
export const SLOT3_01 = 0xc0b1;
export const SLOT3_02 = 0xc0b2;
export const SLOT3_03 = 0xc0b3;
export const SLOT3_04 = 0xc0b4;
export const SLOT3_05 = 0xc0b5;
export const SLOT3_06 = 0xc0b6;
export const SLOT3_07 = 0xc0b7;
export const SLOT3_08 = 0xc0b8;
export const SLOT3_09 = 0xc0b9;
export const SLOT3_0A = 0xc0ba;
export const SLOT3_0B = 0xc0bb;
export const SLOT3_0C = 0xc0bc;
export const SLOT3_0D = 0xc0bd;
export const SLOT3_0E = 0xc0be;
export const SLOT3_0F = 0xc0bf;
