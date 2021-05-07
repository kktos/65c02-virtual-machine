import Bus from "./cpu/bus.js";
import Cpu6502 from "./cpu/cpu6502.js"

const model= {
	nmos: true
};

let lastTime= 0;
let acc= 0;
let inc= 1/30;
let loopCount= 0;

const FPS= 1 / 30;
const OneMHz= 1_000_000 * FPS | 0;

self.bus= null;
self.cpu= null;
self.isRunning= true;
self.cyclesPerFrame= OneMHz;

function init(gc, buffer) {
	self.bus= new Bus(gc, buffer);
	cpu= new Cpu6502(model, self.bus);
	self.cpu.reset(true);
}

function loop(dt= 0) {
	// loopCount++;
	// if(loopCount%20)
	// console.log(loopCount, self.cpu.pc.toString(16));


	// acc+= (dt - lastTime) / 1000;
	// while(acc > inc) {
		const isStopped= !self.cpu.execute(self.cyclesPerFrame);
		// this.gc.tick++;
		// acc-= inc;
		if(isStopped) {
			self.isRunning= false;
			console.log("cpu stopped !");
			// this.debugger.stop();
			return;
		}
	// }
	// lastTime= dt;
	// self.isRunning && requestAnimationFrame(loop);
	// console.log("requestAnimationFrame",requestAnimationFrame(loop));
	setTimeout(loop, 1000*FPS);

}

function setSpeed(speed) {
	self.cyclesPerFrame= OneMHz * speed;
	console.log("setSpeed", speed, self.cyclesPerFrame);
}

onmessage= (evt) => {

	if(!evt.data || !evt.data.type)
		return;

	console.log("worker.onmessage", evt.data.type);

	switch(evt.data.type) {
		case "init":
			init(evt.data.gc, evt.data.buffer);
			break;

		case "reset":
			self.cpu.reset(true);
			break;

		case "memWrite":
			self.bus.write(evt.data.addr, evt.data.value);
			break;

		case "start":
			loop();
			break;

		case "setSpeed":
			setSpeed(evt.data.speed);
			break;

		case "keydown":
		case "keyup":
			self.bus.keys.set(evt.data.key, evt.data.type == "keydown");
			break;
	}

}
