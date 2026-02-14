/** biome-ignore-all lint/complexity/useSimpleNumberKeys: Firmware addr in hex */
import type { MachineConfig, SymbolDict } from "@/types/machine.interface";

const symbols = `
	0200 INPUTBUF

	03f0 BRKV
	03f2 SOFTEV
	03f4 PWREDUP
	03f5 AMPERV
	03f8 USRADR
	03fB NMI
	03fe IRQLOC

	0400 TXT_SCRN_START
	07f8 MSLOT

	[io]
	c000 KBD
	c010 KBDSTRB
	c030 SPKR
	c050 GRAPHICS
	c051 TEXT
	c052 FULLSCR
	c053 MIXED
	c054 PAGE1
	c055 PAGE2
	c056 LORES
	c057 HIRES
	c001 SET80COL
	c002 RDMAINRAM
	c003 RDCARDRAM
	c004 WRMAINRAM
	c005 WRCARDRAM
	c006 SETSLOTCXROM
	c007 SETINTCXROM
	c008 SETSTDZP
	c009 SETALTZP
	c00b SETSLOTC3ROM
	c00c CLR80VID
	c00d SET80VID
	c00e CLRALTCHAR
	c00f SETALTCHAR
	c011 RDLCBNK2
	c012 RDLCRAM
	c013 RDRAMRD
	c014 RDRAMWRT
	c015 RDCXROM
	c018 RD80COL
	c01a RDTEXT
	c01c RDPAGE2
	c01f RD80VID

	c058 SETAN0
	c05a SETAN1
	c05d CLRAN2
	c05f CLRAN3

	c061 BUTN0
	c062 BUTN1
	c064 PADDL0
	c070 PTRIG

	c080 LCBANK2_RW
	c081 ROMIN
	c082 LCROMIN2
	c083 LCBANK2_R
	c088 LCBANK1_RW
	c089 ROMIN1
	c08a LCROMIN1
	c08b LCBANK1_R

	[rom]
	e000 BASIC
	e003 BASIC2

	f800 PLOT
	f819 HLINE
	f828 VLINE
	f832 CLRSCR
	f836 CLRTOP
	f847 GBASCALC
	f85f NXTCOL
	f871 SCRN
	f940 PRNTYX
	f941 PRNTAX
	f944 PRNTX
	f948 PRBLNK
	fa40 IRQ
	fa62 RESET
	fb1e PREAD
	fb2f INIT
	fb40 SETGR
	fb4b SETWND
	fb5b VTAB
	fb60 APPLEII
	fbb4 GOTOCX
	fbc1 BASCALC
	fbe4 BELL2
	fbf4 ADVANCE
	fbfd VIDOUT
	fc10 BS
	fc1a UP
	fc22 VTAB
	fc42 CLREOP
	fc58 HOME
	fc62 CR
	fc66 LF
	fc70 SCROLL
	fc9c CLREOL
	fca8 WAIT
	fcc9 HEADR
	fcd6 WRBIT
	fcdb ZERDLY
	fcec RDBYTE
	fcfa RD2BIT
	fcfd RDBIT
	fd0c RDKEY
	fd1b KEYIN
	fd35 RDCHAR
	fd67 GETLNZ
	fd6a GETLN
	fd8e CROUT
	fd92 PRA1
	fd96 PRYX2
	fda3 XAM8
	fdb3 XAM
	fdc6 XAMPM
	fdda PRBYTE
	fde3 PRHEX
	fded COUT
	fdf0 COUT1
	fe18 SETMODE
	fe2c MOVE
	fe36 VFY
	fe5e LIST
	fe80 SETINV
	fe84 SETNORM
	fe89 SETKBD
	fe93 SETVID
	feb0 XBASIC
	feb3 BASCONT
	feb6 GO
	febf REGZ
	fec2 TRACE
	fec4 STEPZ
	fecd WRITE
	fefd READ
	ff2d PRERR
	ff3a BELL
	ff3f RESTORE
	ff4a SAVE
	ff59 OLDRST
	ff65 MON
	ff69 MONZ
	fce2 INIT_SYSTEM
`;

function parseSymbols(input: string): MachineConfig["symbols"] {
	const result: SymbolDict = {};
	let currentScope = "main";

	for (const line of input.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
			currentScope = trimmed.slice(1, -1);
			continue;
		}

		const [addrStr, label] = trimmed.split(/\s+/);
		if (addrStr && label) {
			const addr = parseInt(addrStr, 16);
			if (!Number.isNaN(addr)) {
				if (!result[addr]) result[addr] = {};
				result[addr].SYSTEM = { label, source: "conf", scope: currentScope };
			}
		}
	}
	return result;
}

export const symbolsConfig: MachineConfig["symbols"] = parseSymbols(symbols);
