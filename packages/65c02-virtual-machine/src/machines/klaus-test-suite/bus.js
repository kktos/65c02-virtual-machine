export default class Bus {
	constructor(controller, buffer) {
		this.controller = controller;
		this.ram = new Uint8Array(buffer);
	}

	reset() {}

	read(addr) {
		return this.ram[addr & 0xffff];
	}

	write(addr, value) {
		this.ram[addr & 0xffff] = value & 0xff;
	}

	writeHexa(_bank, addr, hexString) {
		let newAddr = addr;
		const values = hexString.match(/[0-9a-fA-F]+/g);
		for (let idx = 0; idx < values.length; idx++) this.write(newAddr++, Number.parseInt(values[idx], 16));
		return newAddr;
	}

	writeString(_bank, addr, str) {
		let newAddr = addr;
		for (const c of str) {
			this.write(newAddr++, c.charCodeAt(0));
		}
		return newAddr;
	}
}
