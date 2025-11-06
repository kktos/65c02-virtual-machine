import { assemble } from "../../assets/libs/libasm6502.js";
// import { assemble } from "../6502assembler/6502assembler.js";
import * as utils from "../utils.js";
import MemViewer from "./mem.js";

// Some attempt at making prevInstruction more accurate; score the sequence of instructions leading
// up to the target by counting all "common" instructions as a point. The highest-scoring run of
// instructions is picked as the most likely, and the previous from that is used. Common instructions
// here mean loads, stores, branches, compares, arithmetic and carry-set/clear that don't use "unusual"
// indexing modes like abs,X, abs,Y and (zp,X).
// Good test cases:
//   Repton 2 @ 2cbb
//   MOS @ cfc8
// also, just starting from the back of ROM and going up...
// const commonInstructions= /(RTS|B..|JMP|JSR|LD[AXY]|ST[AXY]|TA[XY]|T[XY]A|AD[DC]|SUB|SBC|CLC|SEC|CMP|EOR|ORR|AND|INC|DEC).*/;
// const uncommonInstrucions= /.*,\s*([XY]|X\))$/;

const id = "65x02 Machine Emulator";
export default class Debugger {
	constructor(vm, memory) {
		this.vm = vm;
		this.memory = new Uint8Array(memory);
		this.mem = null;
		// this.disassembler= new Disassembler(vm, memory);

		this.stepCount = Number.POSITIVE_INFINITY;
		this.stopOnOpcode = 0;

		this.lastCPUstate = {};
		this.disasmLinecount = 0;
		this.stackLinecount = 0;

		this.setup();

		window.STOP = () => {
			const cycles_count = vm.waitMessage("stop");
			console.log("STOPPED:", cycles_count);
			vm.isRunning = false;
			this.updateBtns(true);
			this.update();
		};

		window.DBG = this;

		const refresh = () => {
			this.mem?.update();
			setTimeout(refresh, 1000);
		};

		setTimeout(refresh, 1000);
	}

	async setup() {
		const bps = JSON.parse(localStorage.getItem(`${id}-bps`));
		this.breakpoints = bps && Array.isArray(bps) ? bps : [];

		await this.vm.waitMessage("initBP", { list: this.breakpoints });
	}

	addWidget(grid, widget, id) {
		const el = grid.addWidget(widget);
		el.id = `${id}Widget`;

		const content = el.querySelector(".grid-stack-item-content");
		content.appendChild(
			document.querySelector(`#${id}Tmpl`).content.cloneNode(true),
		);
		const closeBtn = content.querySelector("#close");
		closeBtn?.addEventListener("click", () => {
			grid.removeWidget(el);
			if (widget.onClose) {
				widget.onClose();
			}
		});
		return content.clientHeight;
	}

	setupUI() {
		this.uiroot = document.querySelector("BODY");

		this.grid = document.querySelector(".grid-stack").gridstack;

		this.grid.on("change", (_, items) => {
			const el = items[0].el;
			const height = el.querySelector(".grid-stack-item-content").clientHeight;
			switch (el.id) {
				case "memWidget": {
					this.mem.resize(Math.floor(height / 11));
					break;
				}
				case "disasmWidget": {
					this.disasmLinecount = Math.floor(height / 11);
					this.updateDisasm(this.lastCPUstate);
					break;
				}
				case "stackWidget": {
					this.stackLinecount = Math.floor(height / 8);
					this.updateStack(this.lastCPUstate);
					break;
				}
			}
		});

		// setupConsole(document.querySelector(".log"));

		this.editValueDlg = document.querySelector("#editValueDlg");

		this.diskName = document.querySelector("#btns #diskname");

		let height;

		height = this.addWidget(this.grid, { x: 7, y: 1, w: 3, h: 5 }, "disasm");
		this.disasmLinecount = Math.floor(height / 11);
		this.UIdisasm = document.querySelector("#disasm");
		this.UIdisasm.addEventListener("click", (e) => this.onClickDisasm(e));

		height = this.addWidget(this.grid, { x: 10, y: 3, w: 1, h: 4 }, "stack");
		this.stackLinecount = Math.floor(height / 8);
		this.UIstack = document.querySelector("#stack");

		this.addWidget(
			this.grid,
			{ x: 10, y: 0, w: 1, h: 1, noResize: true },
			"bps",
		);
		this.UIbps = document.querySelector("#bps");

		this.addWidget(
			this.grid,
			{ x: 10, y: 0, w: 1, h: 1, noResize: true },
			"registers",
		);
		this.registers = {
			pc: document.querySelector("#registers #PC"),
			a: document.querySelector("#registers #A"),
			x: document.querySelector("#registers #X"),
			y: document.querySelector("#registers #Y"),
			sp: document.querySelector("#registers #SP"),
			p: document.querySelector("#registers #P"),
		};
		document
			.querySelector("#registers")
			.addEventListener("click", (e) => this.onClickRegister(e));

		this.addWidget(
			this.grid,
			{ x: 7, y: 0, w: 3, h: 1, noResize: true },
			"btns",
		);

		this.UIbps.addEventListener("click", (e) => this.onClickBreakpoints(e));

		for (const btn of document.querySelectorAll(".btn")) {
			btn.addEventListener("click", (e) => this.onClickBtn(e));
		}

		for (const btn of document.querySelectorAll("INPUT")) {
			btn.addEventListener("change", (e) => this.onChange(e));
		}

		this.updateBtns(false);
		this.update();
		// this.uiroot.style.visibility = "visible";
	}

	onChange(e) {
		switch (e.target.id) {
			case "speed":
				this.vm.setSpeed(e.target.value);
				break;
		}
	}

	getValueDlg() {
		this.editValueDlg.showModal();
	}

	// async handleDirectoryEntry( dirHandle, out ) {
	// 	for await (const entry of dirHandle.values()) {
	// 	  if (entry.kind === "file"){
	// 		const file = await entry.getFile();
	// 		out[ file.name ] = file;
	// 	  }
	// 	  if (entry.kind === "directory") {
	// 		const newOut = out[ entry.name ] = {};
	// 		await this.handleDirectoryEntry( entry, newOut );
	// 	  }
	// 	}
	// }

	async onClickBtn(e) {
		switch (e.target.id) {
			case "close": {
				console.log(e.target);
				break;
			}

			case "asm-start": {
				document.querySelector("#asm").style.visibility = "visible";
				break;
			}

			case "asm-open": {
				const [fileHandle] = await showOpenFilePicker();
				const file = await fileHandle.getFile();
				document.getElementById("editor").innerText = await file.text();

				// const out = {};
				// const dirHandle = await showDirectoryPicker();
				// await this.handleDirectoryEntry( dirHandle, out );
				// console.log( out );
				break;
			}

			case "asm-asm": {
				const src = document.getElementById("editor").innerText;
				const opts = {
					readFile: () => ({ path: "", content: src }),
				};
				try {
					const obj = assemble("", opts);
					this.storeInMem(obj);
				} catch (e) {
					console.log(e.message);
				}
				break;
			}

			case "boot-disk": {
				const [fileHandle] = await showOpenFilePicker();
				const file = await fileHandle.getFile();
				this.vm.setDisk(0, new Uint8Array(await file.arrayBuffer()));
				this.diskName.textContent = fileHandle.name;
				break;
			}

			case "memEditor": {
				if (this.mem) break;
				const widget = {
					x: 7,
					y: 6,
					w: 4,
					h: 4,
					onClose: () => {
						this.mem = null;
					},
				};
				const height = this.addWidget(this.grid, widget, "mem");
				const memoryPanel = document.querySelector("#mem");
				this.mem = new MemViewer(this, memoryPanel, Math.floor(height / 11));
				break;
			}

			case "reset":
				this.vm.reset();
				break;

			case "play":
				this.updateBtns(false);
				setTimeout(() => this.vm.play(), 0);
				break;

			case "pause":
				this.pause();
				break;

			case "step_out":
				this.vm.stepOut();
				break;

			case "step_over":
				this.vm.stepOver().then(() => this.update());
				break;

			case "step_into": {
				performance.clearMarks();
				performance.clearMeasures();
				performance.mark("step");
				this.vm.step().then(() => {
					// performance.measure("STEP", "step");

					this.update();

					performance.measure("TOTAL", "step");

					for (const entry of performance.getEntriesByType("measure")) {
						console.log(`${entry.name}:${entry.duration}`);
					}
				});
				break;
			}

			case "clear-log":
				console.clear();
				break;
		}
	}

	pause() {
		console.log("debugger pause()");
		this.updateBtns(true);
		this.vm.pause();
		this.update();
	}

	storeInMem(obj) {
		let addr = obj.segments.CODE.start;
		for (const value of obj.obj.CODE) {
			this.memory[addr++] = value;
		}
	}

	updateBtns(isPaused) {
		const btnList = document.querySelectorAll(".btn");
		for (const btn of btnList) {
			if (!isPaused) {
				btn.classList.add("running");
			} else {
				btn.classList.remove("running");
			}
		}
	}

	onClickDisasm(e) {
		const instructionID = e.target.parentElement.id;
		const bank = Number.parseInt(
			document.querySelector(`#${instructionID} .bank`).attributes["data-bank"]
				?.value,
			16,
		);
		const addr = Number.parseInt(
			document.querySelector(`#${instructionID} .addr`).attributes["data-addr"]
				?.value,
			16,
		);

		if (!Number.isNaN(bank) && !Number.isNaN(addr))
			this.toggleBreakpoint(bank * 0x10000 + addr);
	}

	onClickRegister(e) {
		if (e.target.className === "register") {
			const value = prompt(`Hexa value for register ${e.target.id}`);
			this.vm.updateCPUregister(e.target.id, Number.parseInt(value, 16));
		} else {
			const target = e.target.parentElement;
			if (target.className !== "status") return;
			this.vm.updateCPUregister(
				target.id,
				1 - target.querySelector(".flag").innerText,
			);
		}
		this.update();
	}

	onClickBreakpoints(e) {
		const bpIdx = e.target.parentElement.id;
		switch (e.target.className) {
			case "bpn": {
				if (bpIdx < this.breakpoints.length) {
					this.toggleBreakpoint(this.breakpoints[bpIdx]);
				}
				break;
			}
			case "bpa": {
				const currentValue =
					bpIdx < this.breakpoints.length ? this.breakpoints[bpIdx] : null;
				let value = prompt(
					"Enter Breakpoint address",
					currentValue ? utils.hexword(currentValue) : "",
				);
				value = Number.parseInt(value, 16);
				if (!Number.isNaN(value) && value !== currentValue) {
					if (currentValue) this.toggleBreakpoint(currentValue);
					this.toggleBreakpoint(value);
				}
				break;
			}
		}
	}

	async bload(bank, addr) {
		const [fileHandle] = await showOpenFilePicker();
		const file = await fileHandle.getFile();
		this.vm.memWriteBin(bank, addr, new Uint8Array(await file.arrayBuffer()));
	}

	toggleBreakpoint(addr) {
		const idx = this.breakpoints.indexOf(addr);
		if (idx >= 0) {
			this.vm.sendMessage("removeBP", { addr });
			this.breakpoints.splice(idx, 1);
		} else {
			this.vm.sendMessage("addBP", { addr });
			this.breakpoints.push(addr);
		}
		localStorage.setItem(`${id}-bps`, JSON.stringify(this.breakpoints));
		this.updateBreakpoints();
	}

	stop() {
		this.stopOnOpcode = 0;
		this.update();
	}

	async prevInstruction(cpuState, addr) {
		let address = addr;
		address &= 0xffff;
		let bestAddr = address - 1;
		let bestScore = 0;
		for (
			let startingPoint = address - 20;
			startingPoint !== address;
			startingPoint++
		) {
			let score = 0;
			let startAddr = startingPoint & 0xffff;
			while (startAddr < address) {
				const result = await this.disassembler.disassemble(
					this.mem.dumpMemBank,
					startAddr,
					cpuState,
				);
				if (result[0] === cpuState.PC) score += 10; // huge boost if this instruction was executed
				if (
					result[0].match(commonInstructions) &&
					!result[0].match(uncommonInstrucions)
				) {
					score++;
				}
				if (result[1] === address) {
					if (score > bestScore) {
						bestScore = score;
						bestAddr = startAddr;
						break;
					}
				}
				startAddr = result[1];
			}
		}
		return bestAddr;
	}

	// TODO : test syntax.js -> https://github.com/williamtroup/Syntax.js/tree/main
	async updateDisasm(cpuState) {
		const buildLine = ({ _lineID, label, addr, disasm, comment, selected }) => {
			const bank = utils.hexbyte(this.mem?.dumpMemBank);
			addr = utils.hexword(addr);
			return `
			<div class="line ${selected ? "selected" : ""}">
			${label ? `<div class="label">${label}</div>` : ""}
					<div class="instruction">
						<div class="bank" data-bank="${bank}"></div>
						<div class="addr" data-addr="${addr}"></div>
						<div class="disasm">${disasm}</div>
					</div>${comment ? `<div class="comment">${comment}</div>` : ""}</div>`;
		};

		this.vm
			.waitMessage("disasm", {
				bank: this.mem?.dumpMemBank,
				addr: cpuState.PC,
				lineCount: this.disasmLinecount - 1,
			})
			.then((lines) => {
				let disasmStr = "";
				for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
					disasmStr += buildLine(lines[lineIdx]);
				}
				this.UIdisasm.innerHTML = disasmStr;
			});
	}

	updateStack(cpuState) {
		let dumpStr = "";
		const stackAddr = cpuState.SP - this.stackLinecount / 2;
		const currentSP = 0x100 | cpuState.SP;
		for (let line = 0; line < this.stackLinecount; line++) {
			const addr = 0x100 | (stackAddr + line);
			dumpStr += `<div class="${addr === currentSP ? "selected" : ""}">
							${utils.hexword(addr)}: ${utils.hexbyte(this.memory[addr])}
						</div>`;
		}
		this.UIstack.innerHTML = dumpStr;
	}

	updateBreakpoints() {
		let dumpStr = "";
		for (let line = 0; line < 10; line++) {
			dumpStr += `<div id="${line}">
							<div class="bpn">BP${line}</div>
							<div class="bpa">${line < this.breakpoints.length ? utils.hexword(this.breakpoints[line]) : ""}</div>
						</div>`;
		}
		this.UIbps.innerHTML = dumpStr;
	}

	updateRegisters(cpuState) {
		this.registers.pc.innerHTML = utils.hexword(cpuState.PC);
		this.registers.a.innerHTML = utils.hexbyte(cpuState.A);
		this.registers.x.innerHTML = utils.hexbyte(cpuState.X);
		this.registers.y.innerHTML = utils.hexbyte(cpuState.Y);
		this.registers.sp.innerHTML = utils.hexword(0x100 | cpuState.SP);
		// this.registers.p.innerHTML= utils.hexbyte(cpuState.p.asByte());

		for (const el of document.querySelectorAll(".p.register .status")) {
			el.querySelector(".flag").innerHTML = cpuState.P[el.id] ? 1 : 0;
		}
	}

	async update() {
		this.vm.getCPUstate().then((cpuState) => {
			this.lastCPUstate = cpuState;

			this.updateStack(cpuState);
			this.updateRegisters(cpuState);
			this.updateDisasm(cpuState);
		});
		this.updateBreakpoints();
		this.mem?.update();

		console.flush ? console.flush() : console.clear();
	}
}
