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
export const SOFTSWITCHES = {
	// W 80STOREOFF Allow page2 to switch video page1 page2
	"80STOREOFF": 0xc000,
	// W 80STOREON Allow page2 to switch main & aux video memory
	"80STOREON": 0xc001,
	// R7 80STORE 1=page2 switches main/aux 0=page2 video
	"80STORE": 0xc018,

	// W ALTCHARSETOFF Turn off alternate characters
	ALTCHARSETOFF: 0xc00e,
	// W ALTCHARSETON Turn on alternate characters
	ALTCHARSETON: 0xc00f,
	// R7 ALTCHARSET 1=alt character set on 0=alt char set off
	ALTCHARSET: 0xc01e,

	// R7 TEXT 1=text mode is active 0=graphics mode active
	TEXT: 0xc01a,
	// R7 MIXED 1=mixed graphics & text 0=full screen
	MIXED: 0xc01b,
	// R7 HIRES 1=high resolution graphics 0=low resolution
	HIRES: 0xc01d,

	// W RAMRDOFF Read enable main memory from $0200-$BFFF
	RAMRDOFF: 0xc002,
	// W RAMDRON Read enable aux memory from $0200-$BFFF
	RAMDRON: 0xc003,
	// W RAMWRTOFF Write enable main memory from $0200-$BFFF
	RAMWRTOFF: 0xc004,
	// W RAMWRTON Write enable aux memory from $0200-$BFFF
	RAMWRTON: 0xc005,

	// W 80COLOFF Turn off 80 column display
	"80COLOFF": 0xc00c,
	// W 80COLON Turn on 80 column display
	"80COLON": 0xc00d,
	// R7 80COL 1=80 col display on0=80 col display off
	"80COL": 0xc01f,

	// R/W Select graphics mode
	TEXTOFF: 0xc050,
	// R/W Select text mode
	TEXTON: 0xc051,
	// R/W Use full screen for graphics
	MIXEDOFF: 0xc052,
	// R/W Use graphics with 4 lines of text
	MIXEDON: 0xc053,
	// R/W Select low resolution graphics
	HIRESOFF: 0xc056,
	// R/W Select high resolution graphics
	HIRESON: 0xc057,

	// R/W PAGE2OFF Select panel display (or main video memory)
	PAGE2OFF: 0xc054,
	// R/W PAGE2ON Select page2 display (or aux video memory)
	PAGE2ON: 0xc055,
	// R7 PAGE2 1=video page2 selected or aux
	PAGE2: 0xc01c,

	// R/W TBCOLOR IIgs Screen Color: (0-3) Low Nibble is BG, (4-7) High Nibble is Text
	TBCOLOR: 0xc022,

	// W INTCXROMOFF Enable slot ROM from $C100-$C7FF (but $C800-$CFFF depends on INTC8ROM)
	INTCXROMOFF: 0xc006,
	// W INTCXROMON Enable main ROM from $C100-$CFFF
	INTCXROMON: 0xc007,
	// R7 INTCXROM 1=main $C100-$CFFF ROM active 0=slot active
	INTCXROM: 0xc015,

	// R7 SLOTC3ROM 1=slot $C3 ROM active 0=main $C3 ROM active
	SLOTC3ROM: 0xc017,
	// W SLOTC3ROMOFF Enable main ROM from $C300-$C3FF
	SLOTC3ROMOFF: 0xc00a,
	// W SLOTC3ROMON Enable slot ROM from $C300-$C3FF
	SLOTC3ROMON: 0xc00b,

	// W Enable main memory from $0000-$01FF & $D000-$FFFF
	ALZTPOFF: 0xc008,
	// W Enable aux memory from $0000-$01FF & $D000-$FFFF
	ALTZPON: 0xc009,
	// R7 ALTZP 1=aux $0000-$1FF+auxBSR 0=main available
	ALTZP: 0xc016,

	// R7 RDLCBNK2 1=bank2 available 0=bank1 available
	RDLCBNK2: 0xc011,
	// R7 BSRREADRAM 1=LC active for read 0=ROM active
	RDLCRAM: 0xc012,

	// LC BANK2

	// R  LCRAMIN2 Read RAM bank 2; no write
	LCRAMIN2: 0xc080,
	// RR ROMIN2 Read ROM; write RAM bank 2
	ROMIN2: 0xc081,
	// R  LCROMIN2 Read ROM; no write
	LCROMIN2: 0xc082,
	// RR LCBANK2 Read/write RAM bank 2
	LCBANK2: 0xc083,
	// echoes of C080-C083
	LC_C084: 0xc084,
	LC_C085: 0xc085,
	LC_C086: 0xc086,
	LC_C087: 0xc087,

	// LC BANK1

	// R LC RAM bank1, Read and WR-protect RAM
	LCRAMIN1: 0xc088,
	// RR LC RAM bank1, Read ROM instead of RAM,
	// ;two or more successive reads WR-enables RAM
	ROMIN1: 0xc089,
	// R LC RAM bank1, Read ROM instead of RAM,
	// ;WR-protect RAM
	LCROMIN1: 0xc08a,
	// RR LCBANK1 ;LC RAM bank1, Read RAM
	// two or more successive reads WR-enables RAM
	LCBANK1: 0xc08b,
	// echoes of C088-C08B
	LC_C08C: 0xc08c,
	LC_C08D: 0xc08d,
	LC_C08E: 0xc08e,
	LC_C08F: 0xc08f,

	BANKSEL: 0xc073,

	PADDL0: 0xc064,
	PADDL1: 0xc065,
	PADDL2: 0xc066,
	PADDL3: 0xc067,
	PTRIG: 0xc070,

	SLOT7F1: 0xc0f1,

	SLOT7FF: 0xc0ff,

	// Slot 3 I/O
	SLOT3_00: 0xc0b0,
	SLOT3_01: 0xc0b1,
	SLOT3_02: 0xc0b2,
	SLOT3_03: 0xc0b3,
	SLOT3_04: 0xc0b4,
	SLOT3_05: 0xc0b5,
	SLOT3_06: 0xc0b6,
	SLOT3_07: 0xc0b7,
	SLOT3_08: 0xc0b8,
	SLOT3_09: 0xc0b9,
	SLOT3_0A: 0xc0ba,
	SLOT3_0B: 0xc0bb,
	SLOT3_0C: 0xc0bc,
	SLOT3_0D: 0xc0bd,
	SLOT3_0E: 0xc0be,
	SLOT3_0F: 0xc0bf,
};
