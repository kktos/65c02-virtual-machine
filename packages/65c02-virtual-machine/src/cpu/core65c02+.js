export const core = {
	bus: null,
	PC: 0,
	A: 0,
	X: 0,
	Y: 0,
	SP: 0xff,
	FlagC: 0,
	FlagZ: 0,
	FlagI: 1, //Off
	FlagD: 0,
	FlagB: 1, //Always set?
	FlagV: 0,
	FlagN: 0,
	cycle_count: 0,
	calcAddress: -1,
	running: 0,
	debuggerOnBRK: true,
	mhz: 0,
};

let cycle_penalty = 0;

function memADDRESS() {
	core.calcAddress = core.bus.read(core.PC++);
	core.calcAddress += 0x100 * core.bus.read(core.PC++);
	return core.bus.read(core.calcAddress);
}
function memADDRESSX() {
	core.calcAddress = core.bus.read(core.PC++);
	core.calcAddress += 0x100 * core.bus.read(core.PC++);
	const high_byte = core.calcAddress & 0xff00;
	core.calcAddress += core.X;
	cycle_penalty = (high_byte !== (core.calcAddress & 0xff00)) | 0;
	core.calcAddress &= 0xffff;
	return core.bus.read(core.calcAddress);
}
function memADDRESSY() {
	core.calcAddress = core.bus.read(core.PC++);
	core.calcAddress += 0x100 * core.bus.read(core.PC++);
	const high_byte = core.calcAddress & 0xff00;
	core.calcAddress += core.Y;
	cycle_penalty = (high_byte !== (core.calcAddress & 0xff00)) | 0;
	core.calcAddress &= 0xffff;
	return core.bus.read(core.calcAddress);
}
function memIMMED() {
	return core.bus.read(core.PC++);
}
function memIX() {
	//No banking for pointer since always in ZP
	const t0 = (core.bus.read(core.PC++) + core.X) & 0xff;
	core.calcAddress = (core.bus.read(t0) + (core.bus.read(t0 + 1) << 8)) & 0xffff;
	return core.bus.read(core.calcAddress);
}
function memIY() {
	//No banking for pointer since always in ZP
	const t0 = core.bus.read(core.PC++);
	core.calcAddress = core.bus.read(t0) + (core.bus.read((t0 + 1) & 0xff) << 8);
	const high_byte = core.calcAddress & 0xff00;
	core.calcAddress += core.Y;
	cycle_penalty = (high_byte !== (core.calcAddress & 0xff00)) | 0;
	core.calcAddress &= 0xffff;
	return core.bus.read(core.calcAddress);
}
function memIZP() {
	//No banking for pointer since always in ZP
	const t0 = core.bus.read(core.PC++);
	//core.calcAddress=core.bus.read(t0)+(core.bus.read(t0+1)<<8);
	core.calcAddress = core.bus.read(t0) + (core.bus.read((t0 + 1) & 0xff) << 8);
	return core.bus.read(core.calcAddress);
}
function memZP() {
	//No banking since always in ZP
	core.calcAddress = core.bus.read(core.PC++);
	return core.bus.read(core.calcAddress);
}
function memZPX() {
	//No banking since always in ZP
	core.calcAddress = (core.bus.read(core.PC++) + core.X) & 0xff;
	return core.bus.read(core.calcAddress);
}
function memZPY() {
	//No banking since always in ZP
	core.calcAddress = (core.bus.read(core.PC++) + core.Y) & 0xff;
	return core.bus.read(core.calcAddress);
}

//***********************
//*EMULATED INSTRUCTIONS*
//***********************
function readString(start) {
	let str = "";
	let c;
	let end = start;
	do {
		c = core.bus.read(end++);
		if (c) str += String.fromCharCode(c);
	} while (c);
	return { str, len: end - start };
}

function doOUT() {
	const parms = [];
	const { str: fmt, len } = readString(core.PC);
	core.PC += len;
	const parmCount = core.bus.read(core.PC++);
	for (let idx = 0; idx < parmCount; idx++) {
		const val = core.bus.read(core.PC++) + 0x100 * core.bus.read(core.PC++);
		parms[idx] = val;
	}

	let outStr = "";
	let curPos = 0;
	let curParm = 0;
	let match;
	const regex1 = /%./g;
	let W = 0;
	let H = 0;
	// biome-ignore lint/suspicious/noAssignInExpressions: shortcut
	while ((match = regex1.exec(fmt)) !== null) {
		outStr += fmt.slice(curPos, match.index);
		curPos = regex1.lastIndex;
		switch (match[0]) {
			case "%y":
				outStr += hexbyte(core.Y);
				break;
			case "%a":
				outStr += hexbyte(core.A);
				break;
			case "%x":
				outStr += hexbyte(core.X);
				break;
			case "%w": {
				const v = core.bus.read(parms[curParm]) + 0x100 * core.bus.read(parms[curParm] + 1);
				outStr += hexword(v);
				curParm++;
				break;
			}
			case "%b":
				outStr += hexbyte(core.bus.read(parms[curParm]));
				curParm++;
				break;
			case "%W":
				W = core.bus.read(parms[curParm]);
				outStr += hexbyte(W);
				curParm++;
				break;
			case "%H":
				H = core.bus.read(parms[curParm]);
				outStr += hexbyte(H);
				curParm++;
				break;
			case "%D":
				{
					const len = W * H;
					const addr = core.bus.read(parms[curParm]) + 0x100 * core.bus.read(parms[curParm] + 1);
					outStr += `\n[${hexword(addr)}.${hexword(addr + len - 1)}]`;
					outStr += `\n${hexword(addr)}: `;
					let curW = 0;
					for (let offset = 0; offset < len; offset++) {
						if (curW === W) {
							curW = 0;
							outStr += `\n${hexword(addr + offset)}: `;
						}
						outStr += `${hexbyte(core.bus.read(addr + offset))} `;
						curW++;
					}
					curParm++;
				}
				break;
		}
	}

	console.log(outStr, { fmt, parms });

	// self.postMessage({cmd:"log", data: {
	// 	fmt,
	// 	parms
	// }});
}

function setZN(value) {
	core.FlagZ = (value === 0) | 0;
	core.FlagN = (value & 0x80) >> 7;
}

function doDISK_READ_FILE() {
	const addr = core.bus.read(core.PC++) + 0x100 * core.bus.read(core.PC++);
	const { str: filename } = readString(addr);
	self.postMessage({
		cmd: "disk",
		data: {
			cmd: "read_file",
			filename,
			diskID: 0,
		},
	});
}

function doDISK_READ() {
	const sector = core.bus.read(core.PC++);
	const track = core.bus.read(core.PC++);
	const addr = core.bus.read(core.PC++) + 0x100 * core.bus.read(core.PC++);
	const length = core.bus.read(core.PC++) + 0x100 * core.bus.read(core.PC++);

	self.postMessage({
		cmd: "disk",
		data: {
			cmd: "read",
			track,
			sector,
			addr,
			length,
			diskID: 0,
		},
	});
}

function hexbyte(value) {
	return (((value >>> 4) & 0xf).toString(16) + (value & 0xf).toString(16)).toUpperCase();
}
function hexword(value) {
	return hexbyte(value >>> 8) + hexbyte(value & 0xff);
}

function doMVPw() {
	const src = core.bus.read(core.PC++) + 0x100 * core.bus.read(core.PC++);
	const dst = core.bus.read(core.PC++) + 0x100 * core.bus.read(core.PC++);
	const len = core.bus.read(core.PC++) + 0x100 * core.bus.read(core.PC++);
	for (let idx = 0; idx < len; idx++) {
		core.bus.write((dst + idx) & 0xffff, core.bus.read((src + idx) & 0xffff));
	}
	// console.log("MVPw", hexword(src), hexword(dst), hexword(len), " LC:",core.bus.lcSelected, " WE:",core.bus.lcWriteEnabled);
}

function doADC(oper) {
	let tempResult;
	const operand = oper;
	if (core.FlagD === 1) {
		tempResult = (core.A & 0xf) + (operand & 0xf) + core.FlagC;
		if (tempResult > 9) tempResult += 6;
		tempResult += (core.A & 0xf0) + (operand & 0xf0);
		if (tempResult >= 0xa0) tempResult += 0x60;
		core.cycle_count++;
	} else tempResult = core.A + operand + core.FlagC;
	if (tempResult >= 0x100) {
		tempResult &= 0xff;
		core.FlagC = 1;
	} else core.FlagC = 0;
	if (core.A < 0x80 && operand < 0x80 && tempResult >= 0x80) core.FlagV = 1;
	else if (core.A >= 0x80 && operand >= 0x80 && tempResult < 0x80) core.FlagV = 1;
	else core.FlagV = 0;
	core.A = tempResult;
	setZN(core.A);
}
function doAND(oper) {
	core.A &= oper;
	setZN(core.A);
}
function doASL(oper) {
	let result = oper << 1;
	core.FlagC = (result > 0xff) | 0;
	result &= 0xff;
	core.FlagZ = (result === 0) | 0;
	core.FlagN = (result & 0x80) >> 7;
	core.bus.write(core.calcAddress, result);
}
function doBBR(oper) {
	if ((memZP() & oper) === 0) {
		const t0 = memIMMED();
		if (t0 >= 0x80) core.PC -= 0x100 - t0;
		else core.PC += t0;
	} else core.PC++;
}
function doBBS(oper) {
	if ((memZP() & oper) !== 0) {
		const t0 = memIMMED();
		if (t0 >= 0x80) core.PC -= 0x100 - t0;
		else core.PC += t0;
	} else core.PC++;
}
function doBIT(oper) {
	core.FlagZ = ((core.A & oper) === 0) | 0;
	core.FlagN = (oper & 0x80) >> 7;
	core.FlagV = (oper & 0x40) >> 6;
}
function doCMP(oper) {
	const temp = core.A - oper;
	core.FlagC = (temp >= 0) | 0;
	const temp8 = temp & 0xff;
	setZN(temp8);
}
function doCPX(oper) {
	const temp = core.X - oper;
	core.FlagC = (temp >= 0) | 0;
	const temp8 = temp & 0xff;
	setZN(temp8);
}
function doCPY(oper) {
	const temp = core.Y - oper;
	core.FlagC = (temp >= 0) | 0;
	const temp8 = temp & 0xff;
	setZN(temp8);
}
function doDEC(oper) {
	const newValue = (oper - 1) & 0xff;
	setZN(newValue);
	core.bus.write(core.calcAddress, newValue);
}
function doEOR(oper) {
	core.A ^= oper;
	setZN(core.A);
}
function doINC(oper) {
	const newValue = (oper + 1) & 0xff;
	setZN(newValue);
	core.bus.write(core.calcAddress, newValue);
}
function doLDA(oper) {
	core.A = oper;
	setZN(core.A);
}
function doLDX(oper) {
	core.X = oper;
	setZN(core.X);
}
function doLDY(oper) {
	core.Y = oper;
	core.FlagZ = (core.Y === 0) | 0;
	core.FlagN = (core.Y & 0x80) >> 7;
}
function doLSR(oper) {
	core.FlagC = oper & 1;
	const result = oper >> 1;
	core.FlagZ = (result === 0) | 0;
	core.FlagN = 0;
	core.bus.write(core.calcAddress, result);
}
function doORA(oper) {
	core.A |= oper;
	setZN(core.A);
	//debugflag+="\nFlagN: "+core.FlagN;
}
function doRMB(oper) {
	//No banking since zero page
	core.calcAddress = core.bus.read(core.PC++);
	core.bus.write(core.calcAddress, core.bus.read(core.calcAddress) & oper);
}
function doROL(oper) {
	let newValue = (oper << 1) + core.FlagC;
	core.FlagC = (newValue > 0xff) | 0;
	newValue &= 0xff;
	setZN(newValue);
	core.bus.write(core.calcAddress, newValue);
}
function doROR(oper) {
	const t0 = oper & 1;
	let newValue = oper >> 1;
	if (core.FlagC) newValue |= 0x80;
	core.FlagC = t0;
	core.FlagZ = (newValue === 0) | 0;
	setZN(newValue);
}
function doSBC(oper) {
	let t1;
	if (core.FlagD === 1) {
		if (oper === 0 && core.FlagC === 0) {
			oper = 1;
			core.FlagC = 1;
		}
		t1 = (core.A & 0xf) + (9 - (oper & 0xf) + core.FlagC);
		if (t1 > 9) t1 += 6;
		t1 += (core.A & 0xf0) + (0x90 - (oper & 0xf0));
		if (t1 > 0x99) t1 += 0x60;
		if (t1 >= 0x100) {
			t1 -= 0x100;
			core.FlagC = 1;
		} else core.FlagC = 0;
		//May happen if oper is not valid BCD
		if (t1 < 0) t1 = 0;
		core.cycle_count++;
	} else {
		t1 = core.A - oper - 1 + core.FlagC;
		if (t1 < 0) {
			t1 += 0x100;
			core.FlagC = 0;
		} else core.FlagC = 1;
	}
	if (core.A < 0x80 && oper >= 0x80 && t1 >= 0x80) core.FlagV = 1;
	else if (core.A >= 0x80 && oper < 0x80 && t1 < 0x80) core.FlagV = 1;
	else core.FlagV = 0;
	core.A = t1;
	setZN(core.A);
}
function doSMB(oper) {
	//No banking since zero page
	core.calcAddress = core.bus.read(core.PC++);
	core.bus.write(core.calcAddress, core.bus.read(core.calcAddress) | oper);
}
function doSTA() {
	core.bus.write(core.calcAddress, core.A);
}
function doSTX() {
	core.bus.write(core.calcAddress, core.X);
}
function doSTY() {
	core.bus.write(core.calcAddress, core.Y);
}
function doSTZ() {
	core.bus.write(core.calcAddress, 0);
}
function doTRB(oper) {
	core.FlagZ = ((core.A & oper) === 0) | 0;
	core.bus.write(core.calcAddress, (core.A ^ 0xff) & oper);
}
function doTSB(oper) {
	core.FlagZ = ((core.A & oper) === 0) | 0;
	core.bus.write(core.calcAddress, core.A | oper);
}

function opBRK() {
	//0x00
	//core.FlagB=0;
	//core.PC--;

	if (core.debuggerOnBRK && core.running) {
		core.running = 0;
		core.PC -= 1;
		self.postMessage({ cmd: "stopped", op: "BRK", PC: core.PC });
		return;
	}

	core.cycle_count += 7;
	core.PC++;

	core.bus.write(core.SP + 0x100, core.PC >> 8);
	core.SP = (core.SP - 1) & 0xff;
	core.bus.write(core.SP + 0x100, core.PC & 0xff);
	core.SP = (core.SP - 1) & 0xff;
	let v = core.FlagN << 7;
	v |= core.FlagV << 6;
	v |= 3 << 4;
	v |= core.FlagD << 3;
	v |= core.FlagI << 2;
	v |= core.FlagZ << 1;
	v |= core.FlagC;
	core.bus.write(core.SP + 0x100, v);
	core.SP = (core.SP - 1) & 0xff;
	core.FlagI = 1;
	core.FlagD = 0;
	core.PC = (core.bus.read(0xffff) << 8) | core.bus.read(0xfffe);
	// this.cycles += 5;
}
function opORA_IX() {
	doORA(memIX());
	core.cycle_count += 6;
} //0x01
function opNOP_IMMED() {
	core.PC++;
	core.cycle_count += 2;
} //0x02
function opNOP() {
	core.cycle_count += 2;
} //0x03
function opTSB_ZP() {
	doTSB(memZP());
	core.cycle_count += 5;
} //0x04
function opORA_ZP() {
	doORA(memZP());
	core.cycle_count += 3;
} //0x05
function opASL_ZP() {
	doASL(memZP());
	core.cycle_count += 5;
} //0x06
function opRMB0() {
	doRMB(0xfe);
	core.cycle_count += 5;
} //0x07
function opPHP() {
	//0x08
	core.bus.write(
		0x100 + core.SP,
		core.FlagC +
			core.FlagZ * 2 +
			core.FlagI * 4 +
			core.FlagD * 8 +
			core.FlagB * 16 +
			32 +
			core.FlagV * 64 +
			core.FlagN * 128,
	);
	if (core.SP === 0) core.SP = 0xff;
	else core.SP--;
	core.cycle_count += 3;
}
function opORA_IMMED() {
	doORA(memIMMED());
	core.cycle_count += 2;
} //0x09
function opASL() {
	//0x0A
	core.A <<= 1;
	core.FlagC = (core.A > 0xff) | 0;
	core.A &= 0xff;
	setZN(core.A);
	core.cycle_count += 2;
}
//function opNOP()													//0x0B
function opTSB_ADDRESS() {
	doTSB(memADDRESS());
	core.cycle_count += 6;
} //0x0C
function opORA_ADDRESS() {
	doORA(memADDRESS());
	core.cycle_count += 4;
} //0x0D
function opASL_ADDRESS() {
	doASL(memADDRESS());
	core.cycle_count += 6;
} //0x0E
function opBBR0() {
	doBBR(0x01);
	core.cycle_count += 5;
} //0x0F
function opBPL() {
	//0x10
	if (core.FlagN === 0) {
		//const high_byte=core.PC&0xFF00;
		const t0 = memIMMED();
		const high_byte = core.PC & 0xff00;
		if (t0 >= 0x80) core.PC -= 0x100 - t0;
		else core.PC += t0;
		if (high_byte !== (core.PC & 0xff00)) core.cycle_count++;
		core.cycle_count++;
	} else core.PC++;
	core.cycle_count += 2;
}
function opORA_IY() {
	doORA(memIY());
	core.cycle_count += 5;
} //0x11
function opORA_IZP() {
	doORA(memIZP());
	core.cycle_count += 5;
} //0x12
//function opNOP()													//0x13
function opTRB_ZP() {
	doTRB(memZP());
	core.cycle_count += 5;
} //0x14
function opORA_ZPX() {
	doORA(memZPX());
	core.cycle_count += 4;
} //0x15
function opASL_ZPX() {
	doASL(memZPX());
	core.cycle_count += 6;
} //0x16
function opRMB1() {
	doRMB(0xfd);
	core.cycle_count += 5;
} //0x17
function opCLC() {
	core.FlagC = 0;
	core.cycle_count += 2;
} //0x18
function opORA_ADDRESSY() {
	doORA(memADDRESSY());
	core.cycle_count += 4;
} //0x19
function opINC() {
	//0x1A
	core.A = (core.A + 1) & 0xff;
	setZN(core.A);
	core.cycle_count += 2;
}
//function opNOP()													//0x1B
function opTRB_ADDRESS() {
	doTRB(memADDRESS());
	core.cycle_count += 6;
} //0x1C
function opORA_ADDRESSX() {
	doORA(memADDRESSX());
	core.cycle_count += 4 + cycle_penalty;
}
function opASL_ADDRESSX() {
	doASL(memADDRESSX());
	core.cycle_count += 6;
} //0x1E
function opBBR1() {
	doBBR(0x02);
	core.cycle_count += 5;
} //0x1F
function opJSR() {
	//0x20
	core.bus.write(0x100 + core.SP, (core.PC + 1) >> 8);
	if (core.SP === 0) core.SP = 0xff;
	else core.SP--;
	core.bus.write(0x100 + core.SP, (core.PC + 1) & 0xff);
	if (core.SP === 0) core.SP = 0xff;
	else core.SP--;
	core.PC = core.bus.read(core.PC) + 0x100 * core.bus.read(core.PC + 1);
	core.cycle_count += 6;
}
function opAND_IX() {
	doAND(memIX());
	core.cycle_count += 6;
} //0x21
//function opNOP_IMMED()											//0x22
//function opNOP()													//0x23
function opBIT_ZP() {
	doBIT(memZP());
	core.cycle_count += 3;
} //0x24
function opAND_ZP() {
	doAND(memZP());
	core.cycle_count += 3;
} //0x25
function opROL_ZP() {
	doROL(memZP());
	core.cycle_count += 5;
} //0x26
function opRMB2() {
	doRMB(0xfb);
	core.cycle_count += 5;
} //0x27
function opPLP() {
	//0x28
	core.SP = (core.SP + 1) & 0xff;
	const t0 = core.bus.read(0x100 + core.SP);
	core.FlagC = t0 & 1;
	core.FlagZ = (t0 & 2) >> 1;
	core.FlagI = (t0 & 4) >> 2;
	core.FlagD = (t0 & 8) >> 3;
	core.FlagB = 1;
	core.FlagV = (t0 & 64) >> 6;
	core.FlagN = (t0 & 128) >> 7;
	core.cycle_count += 4;
}
function opAND_IMMED() {
	doAND(memIMMED());
	core.cycle_count += 2;
} //0x29
function opROL() {
	//0x2A
	core.A = (core.A << 1) + core.FlagC;
	core.FlagC = (core.A > 0xff) | 0;
	core.A &= 0xff;
	setZN(core.A);
	core.cycle_count += 2;
}
//function opNOP()													//0x2B
function opBIT_ADDRESS() {
	doBIT(memADDRESS());
	core.cycle_count += 4;
} //0x2C
function opAND_ADDRESS() {
	doAND(memADDRESS());
	core.cycle_count += 4;
} //0x2D
function opROL_ADDRESS() {
	doROL(memADDRESS());
	core.cycle_count += 6;
} //0x2E
function opBBR2() {
	doBBR(0x04);
	core.cycle_count += 5;
} //0x2F
function opBMI() {
	//0x30
	if (core.FlagN === 1) {
		//const high_byte=core.PC&0xFF00;
		const t0 = memIMMED();
		const high_byte = core.PC & 0xff00;
		if (t0 >= 0x80) core.PC -= 0x100 - t0;
		else core.PC += t0;
		if (high_byte !== (core.PC & 0xff00)) core.cycle_count++;
		core.cycle_count++;
	} else core.PC++;
	core.cycle_count += 2;
}
function opAND_IY() {
	doAND(memIY());
	core.cycle_count += 5;
} //0x31
function opAND_IZP() {
	doAND(memIZP());
	core.cycle_count += 5;
} //0x32
//function opNOP()													//0x33
function opBIT_ZPX() {
	doBIT(memZPX());
	core.cycle_count += 4;
} //0x34
function opAND_ZPX() {
	doAND(memZPX());
	core.cycle_count += 4;
} //0x35
function opROL_ZPX() {
	doROL(memZPX());
	core.cycle_count += 6;
} //0x36
function opRMB3() {
	doRMB(0xf7);
	core.cycle_count += 5;
} //0x37
function opSEC() {
	core.FlagC = 1;
	core.cycle_count += 2;
} //0x38
function opAND_ADDRESSY() {
	doAND(memADDRESSY());
	core.cycle_count += 4;
} //0x39
function opDEC() {
	//0x3A
	core.A = (core.A - 1) & 0xff;
	setZN(core.A);
	core.cycle_count += 2;
}
//function opNOP()													//0x3B
function opBIT_ADDRESSX() {
	doBIT(memADDRESSX());
	core.cycle_count += 4;
} //0x3C
function opAND_ADDRESSX() {
	doAND(memADDRESSX());
	core.cycle_count += 4;
} //0x3D
function opROL_ADDRESSX() {
	doROL(memADDRESSX());
	core.cycle_count += 6;
} //0x3E
function opBBR3() {
	doBBR(0x08);
	core.cycle_count += 5;
} //0x3F
function opRTI() {
	//0x40
	opPLP(); //4 cycles
	opRTS(); //6 cycles
	core.PC--; //interrupt pushes core.PC, not core.PC-1
	core.cycle_count -= 5; //should be +5 overall
}
function opEOR_IX() {
	doEOR(memIX());
	core.cycle_count += 6;
} //0x41
function opWDM_EXTENDED() {
	//0x42
	core.cycle_count += 2;
	switch (memIMMED()) {
		case 0x01: // DISK_READ
			doDISK_READ();
			break;
		case 0x11: // DISK_READ_FILE
			doDISK_READ_FILE();
			break;
		case 0x44: // MVP.w src.w dst.w len.w
			doMVPw();
			break;
		case 0xff: // OUT string
			doOUT();
			break;
		default:
			opBRK();
	}
}
//function opNOP()													//0x43
function opNOP_ZP() {
	core.PC++;
	core.cycle_count += 3;
} //0x44
function opEOR_ZP() {
	doEOR(memZP());
	core.cycle_count += 3;
} //0x45
function opLSR_ZP() {
	doLSR(memZP());
	core.cycle_count += 5;
} //0x46
function opRMB4() {
	doRMB(0xef);
	core.cycle_count += 5;
} //0x47
function opPHA() {
	//0x48
	core.bus.write(0x100 + core.SP, core.A);
	if (core.SP === 0) core.SP = 0xff;
	else core.SP--;
	core.cycle_count += 3;
}
function opEOR_IMMED() {
	doEOR(memIMMED());
	core.cycle_count += 2;
} //0x49
function opLSR() {
	//0x4A
	core.FlagC = core.A & 1;
	core.A >>= 1;
	core.FlagZ = (core.A === 0) | 0;
	core.FlagN = 0;
	core.cycle_count += 2;
}
//function opNOP()													//0x4B
function opJMP_ADDRESS() {
	//0x4C
	core.PC = core.bus.read(core.PC) + 0x100 * core.bus.read(core.PC + 1);
	core.cycle_count += 3;
}
function opEOR_ADDRESS() {
	doEOR(memADDRESS());
	core.cycle_count += 4;
} //0x4D
function opLSR_ADDRESS() {
	doLSR(memADDRESS());
	core.cycle_count += 6;
} //0x4E

function opBBR4() {
	doBBR(0x10);
	core.cycle_count += 5;
} //0x4F
function opBVC() {
	//0x50
	if (core.FlagV === 0) {
		//const high_byte=core.PC&0xFF00;
		const t0 = memIMMED();
		const high_byte = core.PC & 0xff00;
		if (t0 >= 0x80) core.PC -= 0x100 - t0;
		else core.PC += t0;
		if (high_byte !== (core.PC & 0xff00)) core.cycle_count++;
		core.cycle_count++;
	} else core.PC++;
	core.cycle_count += 2;
}
function opEOR_IY() {
	doEOR(memIY());
	core.cycle_count += 5;
} //0x51
function opEOR_IZP() {
	doEOR(memIZP());
	core.cycle_count += 5;
} //0x52
//function opNOP()													//0x53
function opNOP_ZPX() {
	core.PC++;
	core.cycle_count += 4;
} //0x54
function opEOR_ZPX() {
	doEOR(memZPX());
	core.cycle_count += 4;
} //0x55
function opLSR_ZPX() {
	doLSR(memZPX());
	core.cycle_count += 6;
} //0x56
function opRMB5() {
	doRMB(0xdf);
	core.cycle_count += 5;
} //0x57
function opCLI() {
	core.FlagI = 0;
	core.cycle_count += 2;
} //0x58
function opEOR_ADDRESSY() {
	doEOR(memADDRESSY());
	core.cycle_count += 4;
} //0x59
function opPHY() {
	//0x5A
	core.bus.write(0x100 + core.SP, core.Y);
	if (core.SP === 0) core.SP = 0xff;
	else core.SP--;
	core.cycle_count += 3;
}
//function opNOP()													//0x5B
function opNOP_ADDRESS() {
	core.PC += 2;
	core.cycle_count += 8;
} //0x5C
function opEOR_ADDRESSX() {
	doEOR(memADDRESSX());
	core.cycle_count += 4;
} //0x5D
function opLSR_ADDRESSX() {
	doLSR(memADDRESSX());
	core.cycle_count += 6;
} //0x5E
function opBBR5() {
	doBBR(0x20);
	core.cycle_count += 5;
} //0x5F
function opRTS() {
	//0x60
	if (core.SP === 0xff) core.SP = 0;
	else core.SP++;
	core.PC = core.bus.read(0x100 + core.SP);
	if (core.SP === 0xff) core.SP = 0;
	else core.SP++;
	core.PC += core.bus.read(0x100 + core.SP) * 0x100 + 1;
	core.cycle_count += 6;
}
function opADC_IX() {
	doADC(memIX());
	core.cycle_count += 6;
} //0x61
//function opNOP_IMMED()											//0x62
//function opNOP()													//0x63
function opSTZ_ZP() {
	memZP();
	doSTZ();
	core.cycle_count += 3;
} //0x64
function opADC_ZP() {
	doADC(memZP());
	core.cycle_count += 3;
} //0x65
function opROR_ZP() {
	doROR(memZP());
	core.cycle_count += 5;
} //0x66
function opRMB6() {
	doRMB(0xbf);
	core.cycle_count += 5;
} //0x67
function opPLA() {
	//0x68
	core.SP = (core.SP + 1) & 0xff;
	core.A = core.bus.read(0x100 + core.SP);
	setZN(core.A);
	core.cycle_count += 4;
}
function opADC_IMMED() {
	doADC(memIMMED());
	core.cycle_count += 2;
} //0x69
function opROR() {
	//0x6A
	const t0 = core.A & 1;
	core.A >>= 1;
	if (core.FlagC) core.A |= 0x80;
	core.FlagC = t0;
	setZN(core.A);
	core.cycle_count += 2;
}
//function opNOP()													//0x6B
function opJMP_I() {
	//0x6C
	// if ((NMOS_mode)&&(core.bus.read(core.PC)==0xFF))
	// {
	// 	//Keep core.PC on this instruction for debugging
	// 	core.PC--;

	// 	if(core.running) {
	// 		core.running= 0;
	// 		self.postMessage({cmd:"stopped"});
	// 	}

	// 	self.postMessage({cmd:"msgbox",msg:"Trapped: JMP (xxFF) in NMOS mode!"});
	// }
	// else
	// {
	const t0 = core.bus.read(core.PC) + 0x100 * core.bus.read(core.PC + 1);
	core.PC = core.bus.read(t0) + 0x100 * core.bus.read(t0 + 1);
	// }
	core.cycle_count += 6;
}
function opADC_ADDRESS() {
	doADC(memADDRESS());
	core.cycle_count += 4;
} //0x6D
function opROR_ADDRESS() {
	doROR(memADDRESS());
	core.cycle_count += 6;
} //0x6E
function opBBR6() {
	doBBR(0x40);
	core.cycle_count += 5;
} //0x6F
function opBVS() {
	//0x70
	if (core.FlagV === 1) {
		//const high_byte=core.PC&0xFF00;
		const t0 = memIMMED();
		const high_byte = core.PC & 0xff00;
		if (t0 >= 0x80) core.PC -= 0x100 - t0;
		else core.PC += t0;
		if (high_byte !== (core.PC & 0xff00)) core.cycle_count++;
		core.cycle_count++;
	} else core.PC++;
	core.cycle_count += 2;
}
function opADC_IY() {
	doADC(memIY());
	core.cycle_count += 5;
} //0x71
function opADC_IZP() {
	doADC(memIZP());
	core.cycle_count += 5;
} //0x72
//function opNOP()													//0x73
function opSTZ_ZPX() {
	memZPX();
	doSTZ();
	core.cycle_count += 4;
} //0x74
function opADC_ZPX() {
	doADC(memZPX());
	core.cycle_count += 4;
} //0x75
function opROR_ZPX() {
	doROR(memZPX());
	core.cycle_count += 6;
} //0x76
function opRMB7() {
	doRMB(0x7f);
	core.cycle_count += 5;
} //0x77
function opSEI() {
	core.FlagI = 1;
	core.cycle_count += 2;
} //0x78
function opADC_ADDRESSY() {
	doADC(memADDRESSY());
	core.cycle_count += 4;
} //0x79
function opPLY() {
	//0x7A
	core.SP = (core.SP + 1) & 0xff;
	core.Y = core.bus.read(0x100 + core.SP);
	setZN(core.Y);
	core.cycle_count += 4;
}
//function opNOP()													//0x7B
function opJMP_IADDRESSX() {
	//0x7C
	const t0 = core.bus.read(core.PC) + 0x100 * core.bus.read(core.PC + 1) + core.X;
	core.PC = core.bus.read(t0) + 0x100 * core.bus.read(t0 + 1);
	core.cycle_count += 6;
}
function opADC_ADDRESSX() {
	doADC(memADDRESSX());
	core.cycle_count += 4;
} //0x7D
function opROR_ADDRESSX() {
	doROR(memADDRESSX());
	core.cycle_count += 6;
} //0x7E
function opBBR7() {
	doBBR(0x80);
	core.cycle_count += 5;
} //0x7F
function opBRA() {
	//0x80
	const t0 = memIMMED();
	const high_byte = core.PC & 0xff00;
	if (t0 >= 0x80) core.PC -= 0x100 - t0;
	else core.PC += t0;
	if (high_byte !== (core.PC & 0xff00)) core.cycle_count++;
	core.cycle_count += 3;
}
function opSTA_IX() {
	memIX();
	doSTA();
	core.cycle_count += 6;
} //0x81
//function opNOP_IMMED()											//0x82
//function opNOP()													//0x83
function opSTY_ZP() {
	memZP();
	doSTY();
	core.cycle_count += 3;
} //0x84
function opSTA_ZP() {
	memZP();
	doSTA();
	core.cycle_count += 3;
} //0x85
function opSTX_ZP() {
	memZP();
	doSTX();
	core.cycle_count += 3;
} //0x86
function opSMB0() {
	doSMB(0x01);
	core.cycle_count += 5;
} //0x87
function opDEY() {
	//0x88
	core.Y = (core.Y - 1) & 0xff;
	setZN(core.Y);
	core.cycle_count += 2;
}
function opBIT_IMMED() {
	//0x89
	core.FlagZ = ((core.A & memIMMED()) === 0) | 0;
	core.cycle_count += 2;
}
function opTXA() {
	//0x8A
	core.A = core.X;
	setZN(core.A);
	core.cycle_count += 2;
}
//function opNOP()													//0x8B
function opSTY_ADDRESS() {
	memADDRESS();
	doSTY();
	core.cycle_count += 4;
} //0x8C
function opSTA_ADDRESS() {
	memADDRESS();
	doSTA();
	core.cycle_count += 4;
} //0x8D
function opSTX_ADDRESS() {
	memADDRESS();
	doSTX();
	core.cycle_count += 4;
} //0x8E
function opBBS0() {
	doBBS(0x01);
	core.cycle_count += 5;
} //0x8F
function opBCC() {
	//0x90
	if (core.FlagC === 0) {
		//const high_byte=core.PC&0xFF00;
		const t0 = memIMMED();
		const high_byte = core.PC & 0xff00;
		if (t0 >= 0x80) core.PC -= 0x100 - t0;
		else core.PC += t0;
		if (high_byte !== (core.PC & 0xff00)) core.cycle_count++;
		core.cycle_count++;
	} else core.PC++;
	core.cycle_count += 2;
}
function opSTA_IY() {
	//0x91
	memIY();
	doSTA();
	core.cycle_count += 6 - cycle_penalty; //no cycle penalty
}
function opSTA_IZP() {
	memIZP();
	doSTA();
	core.cycle_count += 5;
} //0x92
//function opNOP()													//0x93
function opSTY_ZPX() {
	memZPX();
	doSTY();
	core.cycle_count += 4;
} //0x94
function opSTA_ZPX() {
	memZPX();
	doSTA();
	core.cycle_count += 4;
} //0x95
function opSTX_ZPY() {
	memZPY();
	doSTX();
	core.cycle_count += 4;
} //0x96
function opSMB1() {
	doSMB(0x02);
	core.cycle_count += 5;
} //0x97
function opTYA() {
	//0x98
	core.A = core.Y;
	setZN(core.A);
	core.cycle_count += 2;
}
function opSTA_ADDRESSY() {
	//0x99
	memADDRESSY();
	doSTA();
	//debugMsg("STA_ADDRESSY: " + core.calcAddress);
	core.cycle_count += 5 - cycle_penalty; //no cycle penalty
}
function opTXS() {
	//0x9A
	core.SP = core.X;
	//Don't set flags!
	//if (core.SP==0) core.FlagZ=1;else core.FlagZ=0;
	//if (core.SP>=0x80) core.FlagN=1;else core.FlagN=0;
	core.cycle_count += 2;
}
//function opNOP()													//0x9B
function opSTZ_ADDRESS() {
	memADDRESS();
	doSTZ();
	core.cycle_count += 4;
} //0x9C
function opSTA_ADDRESSX() {
	//0x9D
	memADDRESSX();
	doSTA();
	core.cycle_count += 5 - cycle_penalty;
} //no cycle penalty
function opSTZ_ADDRESSX() {
	memADDRESSX();
	doSTZ();
	core.cycle_count += 5;
} //0x9E
function opBBS1() {
	doBBS(0x02);
	core.cycle_count += 5;
} //0x9F
function opLDY_IMMED() {
	doLDY(memIMMED());
	core.cycle_count += 2;
} //0xA0
function opLDA_IX() {
	doLDA(memIX());
	core.cycle_count += 6;
} //0xA1
function opLDX_IMMED() {
	doLDX(memIMMED());
	core.cycle_count += 2;
} //0xA2
//function opNOP()													//0xA3
function opLDY_ZP() {
	doLDY(memZP());
	core.cycle_count += 3;
} //0xA4
function opLDA_ZP() {
	doLDA(memZP());
	core.cycle_count += 3;
} //0xA5
function opLDX_ZP() {
	doLDX(memZP());
	core.cycle_count += 3;
} //0xA6
function opSMB2_ZP() {
	doSMB(0x04);
	core.cycle_count += 5;
} //0xA7
function opTAY() {
	//0xA8
	core.Y = core.A;
	setZN(core.Y);
	core.cycle_count += 2;
}
function opLDA_IMMED() {
	doLDA(memIMMED());
	core.cycle_count += 2;
} //0xA9
function opTAX() {
	//0xAA
	core.X = core.A;
	setZN(core.X);
	core.cycle_count += 2;
}
//function opNOP()													//0xAB
function opLDY_ADDRESS() {
	doLDY(memADDRESS());
	core.cycle_count += 4;
} //0xAC
function opLDA_ADDRESS() {
	doLDA(memADDRESS());
	core.cycle_count += 4;
} //0xAD
function opLDX_ADDRESS() {
	doLDX(memADDRESS());
	core.cycle_count += 4;
} //0xAE
function opBBS2() {
	doBBS(0x04);
	core.cycle_count += 5;
} //0xAF
function opBCS() {
	//0xB0
	if (core.FlagC === 1) {
		//const high_byte=core.PC&0xFF00;
		const t0 = memIMMED();
		const high_byte = core.PC & 0xff00;
		if (t0 >= 0x80) core.PC -= 0x100 - t0;
		else core.PC += t0;
		if (high_byte !== (core.PC & 0xff00)) core.cycle_count++;
		core.cycle_count++;
	} else core.PC++;
	core.cycle_count += 2;
}
function opLDA_IY() {
	doLDA(memIY());
	core.cycle_count += 5;
} //0xB1
function opLDA_IZP() {
	doLDA(memIZP());
	core.cycle_count += 5;
} //0xB2
//function opNOP()													//0xB3
function opLDY_ZPX() {
	doLDY(memZPX());
	core.cycle_count += 4;
} //0xB4
function opLDA_ZPX() {
	doLDA(memZPX());
	core.cycle_count += 4;
} //0xB5
function opLDX_ZPY() {
	doLDX(memZPY());
	core.cycle_count += 4;
} //0xB6
function opSMB3() {
	doSMB(0x08);
	core.cycle_count += 5;
} //0xB7
function opCLV() {
	core.FlagV = 0;
	core.cycle_count += 2;
} //0xB8
function opLDA_ADDRESSY() {
	doLDA(memADDRESSY());
	core.cycle_count += 4;
} //0xB9
function opTSX() {
	//0xBA
	core.X = core.SP;
	setZN(core.X);
	core.cycle_count += 2;
}
//function opNOP()													//0xBB
function opLDY_ADDRESSX() {
	doLDY(memADDRESSX());
	core.cycle_count += 4;
} //0xBC
function opLDA_ADDRESSX() {
	doLDA(memADDRESSX());
	core.cycle_count += 4;
} //0xBD
function opLDX_ADDRESSY() {
	doLDX(memADDRESSY());
	core.cycle_count += 4;
} //0xBE
function opBBS3() {
	doBBS(0x08);
	core.cycle_count += 5;
} //0xBF
function opCPY_IMMED() {
	doCPY(memIMMED());
	core.cycle_count += 2;
} //0xC0
function opCMP_IX() {
	doCMP(memIX());
	core.cycle_count += 6;
} //0xC1
//function opNOP_IMMED()											//0xC2
//function opNOP()													//0xC3
function opCPY_ZP() {
	doCPY(memZP());
	core.cycle_count += 3;
} //0xC4
function opCMP_ZP() {
	doCMP(memZP());
	core.cycle_count += 3;
} //0xC5
function opDEC_ZP() {
	doDEC(memZP());
	core.cycle_count += 5;
} //0xC6
function opSMB4() {
	doSMB(0x10);
	core.cycle_count += 5;
} //0xC7
function opINY() {
	//0xC8
	core.Y = (core.Y + 1) & 0xff;
	setZN(core.Y);
	core.cycle_count += 2;
}
function opCMP_IMMED() {
	doCMP(memIMMED());
	core.cycle_count += 2;
} //0xC9
function opDEX() {
	//0xCA
	core.X = (core.X - 1) & 0xff;
	setZN(core.X);
	core.cycle_count += 2;
}
function opWAI() {
	core.running = 0;
	core.cycle_count += 3;
} //0xCB
function opCPY_ADDRESS() {
	doCPY(memADDRESS());
	core.cycle_count += 4;
} //0xCC
function opCMP_ADDRESS() {
	doCMP(memADDRESS());
	core.cycle_count += 4;
} //0xCD
function opDEC_ADDRESS() {
	doDEC(memADDRESS());
	core.cycle_count += 6;
} //0xCE
function opBBS4() {
	doBBS(0x10);
	core.cycle_count += 5;
} //0xCF
function opBNE() {
	//0xD0
	if (core.FlagZ === 0) {
		//const high_byte=core.PC&0xFF00;
		const t0 = memIMMED();
		const high_byte = core.PC & 0xff00;
		if (t0 >= 0x80) core.PC -= 0x100 - t0;
		else core.PC += t0;
		if (high_byte !== (core.PC & 0xff00)) core.cycle_count++;
		core.cycle_count++;
	} else core.PC++;
	core.cycle_count += 2;
}
function opCMP_IY() {
	doCMP(memIY());
	core.cycle_count += 5;
} //0xD1
function opCMP_IZP() {
	doCMP(memIZP());
	core.cycle_count += 5;
} //0xD2
//function opNOP()													//0xD3
//function opNOP_ZPX()												//0xD4
function opCMP_ZPX() {
	doCMP(memZPX());
	core.cycle_count += 4;
} //0xD5
function opDEC_ZPX() {
	doDEC(memZPX());
	core.cycle_count += 6;
} //0xD6
function opSMB5() {
	doSMB(0x20);
	core.cycle_count += 5;
} //0xD7													//0xD7
function opCLD() {
	core.FlagD = 0;
	core.cycle_count += 2;
} //0xD8
function opCMP_ADDRESSY() {
	doCMP(memADDRESSY());
	core.cycle_count += 4;
} //0xD9
function opPHX() {
	//0xDA
	core.bus.write(0x100 + core.SP, core.X);
	if (core.SP === 0) core.SP = 0xff;
	else core.SP--;
	core.cycle_count += 3;
}
function opSTP() {
	core.running = 0;
	core.cycle_count += 3;
} //0xDB
//function opNOP_ADDRESS()											//0xDC
function opCMP_ADDRESSX() {
	doCMP(memADDRESSX());
	core.cycle_count += 4;
} //0xDD
function opDEC_ADDRESSX() {
	//0xDE
	doDEC(memADDRESSX());
	core.cycle_count += 7 - cycle_penalty; //no cycle penalty
}
function opBBS5() {
	doBBS(0x20);
	core.cycle_count += 5;
} //0xDF
function opCPX_IMMED() {
	doCPX(memIMMED());
	core.cycle_count += 2;
} //0xE0
function opSBC_IX() {
	doSBC(memIX());
	core.cycle_count += 6;
} //0xE1
//function opNOP_IMMED()											//0xE2
//function opNOP()													//0xE3
function opCPX_ZP() {
	doCPX(memZP());
	core.cycle_count += 3;
} //0xE4
function opSBC_ZP() {
	doSBC(memZP());
	core.cycle_count += 3;
} //0xE5
function opINC_ZP() {
	doINC(memZP());
	core.cycle_count += 5;
} //0xE6
function opSMB6() {
	doSMB(0x40);
	core.cycle_count += 5;
} //0xE7
function opINX() {
	//0xE8
	core.X = (core.X + 1) & 0xff;
	setZN(core.X);
	core.cycle_count += 2;
}
function opSBC_IMMED() {
	doSBC(memIMMED());
	core.cycle_count += 2;
} //0xE9
//function opNOP()													//0xEA
//function opNOP()													//0xEB
function opCPX_ADDRESS() {
	doCPX(memADDRESS());
	core.cycle_count += 4;
} //0xEC
function opSBC_ADDRESS() {
	doSBC(memADDRESS());
	core.cycle_count += 4;
} //0xED
function opINC_ADDRESS() {
	doINC(memADDRESS());
	core.cycle_count += 5;
} //0xEE
function opBBS6() {
	doBBS(0x40);
	core.cycle_count += 5;
} //0xEF
function opBEQ() {
	//0xF0
	if (core.FlagZ === 1) {
		//const high_byte=core.PC&0xFF00;
		const t0 = memIMMED();
		const high_byte = core.PC & 0xff00;
		if (t0 >= 0x80) core.PC -= 0x100 - t0;
		else core.PC += t0;
		if (high_byte !== (core.PC & 0xff00)) core.cycle_count++;
		core.cycle_count++;
	} else core.PC++;
	core.cycle_count += 2;
}
function opSBC_IY() {
	doSBC(memIY());
	core.cycle_count += 5;
} //0xF1
function opSBC_IZP() {
	doSBC(memIZP());
	core.cycle_count += 5;
} //0xF2
//function opNOP()													//0xF3
//function opNOP_ZPX()												//0xF4
function opSBC_ZPX() {
	doSBC(memZPX());
	core.cycle_count += 4;
} //0xF5
function opINC_ZPX() {
	doINC(memZPX());
	core.cycle_count += 6;
} //0xF6
function opSMB7() {
	doSMB(0x80);
	core.cycle_count += 5;
} //0xF7
function opSED() {
	core.FlagD = 1;
	core.cycle_count += 2;
} //0xF8
function opSBC_ADDRESSY() {
	doSBC(memADDRESSY());
	core.cycle_count += 4;
} //0xF9
function opPLX() {
	//0xFA
	core.SP = (core.SP + 1) & 0xff;
	core.X = core.bus.read(0x100 + core.SP);
	setZN(core.X);
	core.cycle_count += 4;
}
//function opNOP()													//0xFB
//function opNOP_ADDRESS()											//0xFC
function opSBC_ADDRESSX() {
	doSBC(memADDRESSX());
	core.cycle_count += 4;
} //0xFD
function opINC_ADDRESSX() {
	//0xFE
	doINC(memADDRESSX());
	core.cycle_count += 7 - cycle_penalty; //no cycle penalty
}
function opBBS7() {
	doBBS(0x80);
	core.cycle_count += 5;
} //0xFF

const _opLens = [
	2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3, 3, 2, 2, 1, 2, 2, 2,
	2, 1, 2, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3, 1, 2, 2, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3,
	3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3, 1, 2, 2, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2,
	2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 1, 1,
	3, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3, 2, 2, 2,
	1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2,
	1, 1, 3, 3, 3, 3, 2, 2, 2, 1, 3, 2, 2, 2, 1, 3, 1, 1, 3, 3, 3, 3,
];

export const opcodes = [
	opBRK, //0x00
	opORA_IX, //0x01
	opNOP_IMMED, //0x02
	opNOP, //0x03
	opTSB_ZP, //0x04
	opORA_ZP, //0x05
	opASL_ZP, //0x06
	opRMB0, //0x07
	opPHP, //0x08
	opORA_IMMED, //0x09
	opASL, //0x0A
	opNOP, //0x0B
	opTSB_ADDRESS, //0x0C
	opORA_ADDRESS, //0x0D
	opASL_ADDRESS, //0x0E
	opBBR0, //0x0F
	opBPL, //0x10
	opORA_IY, //0x11
	opORA_IZP, //0x12
	opNOP, //0x13
	opTRB_ZP, //0x14
	opORA_ZPX, //0x15
	opASL_ZPX, //0x16
	opRMB1, //0x17
	opCLC, //0x18
	opORA_ADDRESSY, //0x19
	opINC, //0x1A
	opNOP, //0x1B
	opTRB_ADDRESS, //0x1C
	opORA_ADDRESSX, //0x1D
	opASL_ADDRESSX, //0x1E
	opBBR1, //0x1F
	opJSR, //0x20
	opAND_IX, //0x21
	opNOP_IMMED, //0x22 65816: JSL addr - jsr long
	opNOP, //0x23
	opBIT_ZP, //0x24
	opAND_ZP, //0x25
	opROL_ZP, //0x26
	opRMB2, //0x27
	opPLP, //0x28
	opAND_IMMED, //0x29
	opROL, //0x2A
	opNOP, //0x2B
	opBIT_ADDRESS, //0x2C
	opAND_ADDRESS, //0x2D
	opROL_ADDRESS, //0x2E
	opBBR2, //0x2F
	opBMI, //0x30
	opAND_IY, //0x31
	opAND_IZP, //0x32
	opNOP, //0x33
	opBIT_ZPX, //0x34
	opAND_ZPX, //0x35
	opROL_ZPX, //0x36
	opRMB3, //0x37
	opSEC, //0x38
	opAND_ADDRESSY, //0x39
	opDEC, //0x3A
	opNOP, //0x3B
	opBIT_ADDRESSX, //0x3C
	opAND_ADDRESSX, //0x3D
	opROL_ADDRESSX, //0x3E
	opBBR3, //0x3F
	opRTI, //0x40
	opEOR_IX, //0x41

	opWDM_EXTENDED, //0x42 here: extended instruction 65816: WDM
	// opNOP_IMMED, //0x42

	opNOP, //0x43
	opNOP_ZP, //0x44
	opEOR_ZP, //0x45
	opLSR_ZP, //0x46
	opRMB4, //0x47
	opPHA, //0x48
	opEOR_IMMED, //0x49
	opLSR, //0x4A
	opNOP, //0x4B
	opJMP_ADDRESS, //0x4C
	opEOR_ADDRESS, //0x4D
	opLSR_ADDRESS, //0x4E
	opBBR4, //0x4F
	opBVC, //0x50
	opEOR_IY, //0x51
	opEOR_IZP, //0x52
	opNOP, //0x53
	opNOP_ZPX, //0x54
	opEOR_ZPX, //0x55
	opLSR_ZPX, //0x56
	opRMB5, //0x57
	opCLI, //0x58
	opEOR_ADDRESSY, //0x59
	opPHY, //0x5A
	opNOP, //0x5B
	opNOP_ADDRESS, //0x5C 65816: JML addr - jmp long
	opEOR_ADDRESSX, //0x5D
	opLSR_ADDRESSX, //0x5E
	opBBR5, //0x5F
	opRTS, //0x60
	opADC_IX, //0x61
	opNOP_IMMED, //0x62
	opNOP, //0x63
	opSTZ_ZP, //0x64
	opADC_ZP, //0x65
	opROR_ZP, //0x66
	opRMB6, //0x67
	opPLA, //0x68
	opADC_IMMED, //0x69
	opROR, //0x6A
	opNOP, //0x6B
	opJMP_I, //0x6C
	opADC_ADDRESS, //0x6D
	opROR_ADDRESS, //0x6E
	opBBR6, //0x6F
	opBVS, //0x70
	opADC_IY, //0x71
	opADC_IZP, //0x72
	opNOP, //0x73
	opSTZ_ZPX, //0x74
	opADC_ZPX, //0x75
	opROR_ZPX, //0x76
	opRMB7, //0x77
	opSEI, //0x78
	opADC_ADDRESSY, //0x79
	opPLY, //0x7A
	opNOP, //0x7B
	opJMP_IADDRESSX, //0x7C
	opADC_ADDRESSX, //0x7D
	opROR_ADDRESSX, //0x7E
	opBBR7, //0x7F
	opBRA, //0x80
	opSTA_IX, //0x81
	opNOP_IMMED, //0x82
	opNOP, //0x83
	opSTY_ZP, //0x84
	opSTA_ZP, //0x85
	opSTX_ZP, //0x86
	opSMB0, //0x87
	opDEY, //0x88
	opBIT_IMMED, //0x89
	opTXA, //0x8A
	opNOP, //0x8B
	opSTY_ADDRESS, //0x8C
	opSTA_ADDRESS, //0x8D
	opSTX_ADDRESS, //0x8E
	opBBS0, //0x8F
	opBCC, //0x90
	opSTA_IY, //0x91
	opSTA_IZP, //0x92
	opNOP, //0x93
	opSTY_ZPX, //0x94
	opSTA_ZPX, //0x95
	opSTX_ZPY, //0x96
	opSMB1, //0x97
	opTYA, //0x98
	opSTA_ADDRESSY, //0x99
	opTXS, //0x9A
	opNOP, //0x9B
	opSTZ_ADDRESS, //0x9C
	opSTA_ADDRESSX, //0x9D
	opSTZ_ADDRESSX, //0x9E
	opBBS1, //0x9F
	opLDY_IMMED, //0xA0
	opLDA_IX, //0xA1
	opLDX_IMMED, //0xA2
	opNOP, //0xA3
	opLDY_ZP, //0xA4
	opLDA_ZP, //0xA5
	opLDX_ZP, //0xA6
	opSMB2_ZP, //0xA7
	opTAY, //0xA8
	opLDA_IMMED, //0xA9
	opTAX, //0xAA
	opNOP, //0xAB
	opLDY_ADDRESS, //0xAC
	opLDA_ADDRESS, //0xAD
	opLDX_ADDRESS, //0xAE
	opBBS2, //0xAF
	opBCS, //0xB0
	opLDA_IY, //0xB1
	opLDA_IZP, //0xB2
	opNOP, //0xB3
	opLDY_ZPX, //0xB4
	opLDA_ZPX, //0xB5
	opLDX_ZPY, //0xB6
	opSMB3, //0xB7
	opCLV, //0xB8
	opLDA_ADDRESSY, //0xB9
	opTSX, //0xBA
	opNOP, //0xBB
	opLDY_ADDRESSX, //0xBC
	opLDA_ADDRESSX, //0xBD
	opLDX_ADDRESSY, //0xBE
	opBBS3, //0xBF
	opCPY_IMMED, //0xC0
	opCMP_IX, //0xC1
	opNOP_IMMED, //0xC2 65816: REP #immed - reset status bits
	opNOP, //0xC3
	opCPY_ZP, //0xC4
	opCMP_ZP, //0xC5
	opDEC_ZP, //0xC6
	opSMB4, //0xC7
	opINY, //0xC8
	opCMP_IMMED, //0xC9
	opDEX, //0xCA
	opWAI, //0xCB
	opCPY_ADDRESS, //0xCC
	opCMP_ADDRESS, //0xCD
	opDEC_ADDRESS, //0xCE
	opBBS4, //0xCF
	opBNE, //0xD0
	opCMP_IY, //0xD1
	opCMP_IZP, //0xD2
	opNOP, //0xD3
	opNOP_ZPX, //0xD4
	opCMP_ZPX, //0xD5
	opDEC_ZPX, //0xD6
	opSMB5, //0xD7
	opCLD, //0xD8
	opCMP_ADDRESSY, //0xD9
	opPHX, //0xDA
	opSTP, //0xDB
	opNOP_ADDRESS, //0xDC
	opCMP_ADDRESSX, //0xDD
	opDEC_ADDRESSX, //0xDE
	opBBS5, //0xDF
	opCPX_IMMED, //0xE0
	opSBC_IX, //0xE1
	opNOP_IMMED, //0xE2 65816: SEP #immed - set status bits
	opNOP, //0xE3
	opCPX_ZP, //0xE4
	opSBC_ZP, //0xE5
	opINC_ZP, //0xE6
	opSMB6, //0xE7
	opINX, //0xE8
	opSBC_IMMED, //0xE9
	opNOP, //0xEA
	opNOP, //0xEB
	opCPX_ADDRESS, //0xEC
	opSBC_ADDRESS, //0xED
	opINC_ADDRESS, //0xEE
	opBBS6, //0xEF
	opBEQ, //0xF0
	opSBC_IY, //0xF1
	opSBC_IZP, //0xF2
	opNOP, //0xF3
	opNOP_ZPX, //0xF4
	opSBC_ZPX, //0xF5
	opINC_ZPX, //0xF6
	opSMB7, //0xF7
	opSED, //0xF8
	opSBC_ADDRESSY, //0xF9
	opPLX, //0xFA
	opNOP, //0xFB
	opNOP_ADDRESS, //0xFC
	opSBC_ADDRESSX, //0xFD
	opINC_ADDRESSX, //0xFE
	opBBS7, //0xFF
];
