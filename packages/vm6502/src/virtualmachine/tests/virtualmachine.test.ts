import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MachineConfig } from "@/types/machine.interface";
import { DEFAULT_KEYBOARD_JOYSTICK } from "../keyboardJoystick";

const outputs: { destroyed: boolean }[] = [];
vi.mock("@/virtualmachine/video/video.output", () => ({
	VideoOutput: class {
		destroyed = false;
		constructor() {
			outputs.push(this);
		}
		setPalette() {}
		setViewRect() {}
		setScaling() {}
		render() {}
		destroy() {
			this.destroyed = true;
		}
	},
	cropVideoBuffer: () => new Uint8Array(),
	grayscalePalette: () => new Uint8Array(),
}));

const { VirtualMachine } = await import("../virtualmachine.class");

/** Stands for the CPU worker: keeps what the VM posts, and answers as the worker would. */
class FakeWorker {
	static last: FakeWorker;
	posted: Record<string, unknown>[] = [];
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	constructor() {
		FakeWorker.last = this;
	}
	postMessage(data: Record<string, unknown>) {
		this.posted.push(data);
	}
	terminate() {}
	emit(data: object) {
		this.onmessage?.({ data } as MessageEvent);
	}
	commands = () => this.posted.map((m) => m.command);
	waitFor = (command: string) => vi.waitFor(() => expect(this.commands()).toContain(command));
}

const listeners = new Map<string, (event: unknown) => void>();
let frames = 0;

const machine = (bus = "klaus-test-suite/klaus.bus"): MachineConfig =>
	({
		name: "test",
		bus: { path: bus, class: "Bus" },
		memory: { size: 0x10000 },
		video: { width: 8, height: 8 },
		inputs: [{ type: "joystick", controls: [{ id: "axis_x", label: "X", type: "axis", index: 0 }] }],
	}) as unknown as MachineConfig;

/** Settled within a few ticks? `undefined` while still pending. */
const settled = async (promise: Promise<unknown>) => {
	let state: "resolved" | "rejected" | undefined;
	promise.then(
		() => (state = "resolved"),
		() => (state = "rejected"),
	);
	for (let i = 0; i < 5; i++) await Promise.resolve();
	return state;
};

beforeEach(() => {
	listeners.clear();
	outputs.length = 0;
	frames = 0;
	vi.stubGlobal("Worker", FakeWorker);
	vi.stubGlobal("window", {
		addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
		removeEventListener: (type: string) => listeners.delete(type),
		setInterval,
	});
	vi.stubGlobal("requestAnimationFrame", () => ++frames);
	vi.spyOn(console, "log").mockImplementation(() => undefined);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("VirtualMachine start-up failures", () => {
	it("rejects ready and the requests when the bus module is missing", async () => {
		const vm = new VirtualMachine(machine("nowhere/none.bus"));
		const pending = vm.reset();
		await expect(vm.ready).rejects.toThrow("Could not find the bus module");
		await expect(pending).rejects.toThrow("Could not find the bus module");
		await expect(vm.step()).rejects.toThrow("Could not find the bus module");
		expect(FakeWorker.last.commands()).not.toContain("init");
	});

	it("rejects ready and the requests when the worker can't set the machine up", async () => {
		const vm = new VirtualMachine(machine());
		const worker = FakeWorker.last;
		const pending = vm.reset();
		await worker.waitFor("init");
		worker.emit({ type: "initFailed", error: "no ROM" });
		await expect(vm.ready).rejects.toThrow("no ROM");
		await expect(pending).rejects.toThrow("no ROM");
		await expect(vm.getInterrupts()).rejects.toThrow("no ROM");
	});

	it("rejects ready when the worker fails to load", async () => {
		const vm = new VirtualMachine(machine());
		FakeWorker.last.onerror?.({ message: "syntax error", preventDefault() {} } as ErrorEvent);
		await expect(vm.ready).rejects.toThrow("syntax error");
	});

	it("starts once the worker is ready, and answers the requests", async () => {
		const vm = new VirtualMachine(machine());
		const worker = FakeWorker.last;
		await worker.waitFor("init");
		worker.emit({ type: "ready" });
		await expect(vm.ready).resolves.toBeUndefined();

		const reset = vm.reset();
		const { id } = worker.posted.find((m) => m.command === "reset") as { id: number };
		worker.emit({ type: "reply", id });
		await expect(reset).resolves.toBeUndefined();
		// An error after start-up isn't a failed start
		worker.onerror?.({ message: "late", preventDefault() {} } as ErrorEvent);
		const step = vm.step();
		expect(await settled(step)).toBeUndefined();
	});
});

describe("VirtualMachine.terminate", () => {
	it("rejects the requests under way and the ones after, leaves ready pending", async () => {
		const vm = new VirtualMachine(machine());
		await FakeWorker.last.waitFor("init");
		const pending = vm.step();
		vm.terminate();
		await expect(pending).rejects.toThrow("shut down");
		await expect(vm.reset()).rejects.toThrow("shut down");
		expect(await settled(vm.ready)).toBeUndefined();
	});
});

describe("VirtualMachine keyboard", () => {
	const key = (type: "keydown" | "keyup", code: string, mods: { ctrlKey?: boolean } = {}) =>
		listeners.get(type)?.({
			type,
			code,
			key: code,
			ctrlKey: false,
			metaKey: false,
			altKey: false,
			shiftKey: false,
			target: null,
			preventDefault() {},
			...mods,
		});
	const keyMessages = () =>
		FakeWorker.last.posted.filter((m) => m.command === "keydown" || m.command === "keyup").map((m) => m.command);

	it("sends the keyup of a joystick key that went down with Ctrl", () => {
		const vm = new VirtualMachine(machine());
		vm.setKeyboardJoystick({ ...DEFAULT_KEYBOARD_JOYSTICK, enabled: true });
		key("keydown", "ArrowLeft", { ctrlKey: true });
		key("keyup", "ArrowLeft");
		expect(keyMessages()).toEqual(["keydown", "keyup"]);
	});

	it("keeps a plain joystick key away from the machine keyboard", () => {
		const vm = new VirtualMachine(machine());
		vm.setKeyboardJoystick({ ...DEFAULT_KEYBOARD_JOYSTICK, enabled: true });
		key("keydown", "ArrowLeft");
		key("keyup", "ArrowLeft");
		expect(keyMessages()).toEqual([]);
	});
});

describe("VirtualMachine.initVideo", () => {
	it("called twice: one frame loop, the first output destroyed", () => {
		const vm = new VirtualMachine(machine());
		const canvas = {} as HTMLCanvasElement;
		vm.initVideo(canvas);
		vm.initVideo(canvas);
		expect(frames).toBe(1);
		expect(outputs.map((o) => o.destroyed)).toEqual([true, false]);
	});
});

describe("VirtualMachine state callbacks", () => {
	it("reports the frame's aspect as the view rect changes", () => {
		const vm = new VirtualMachine(machine());
		const aspects: number[] = [];
		vm.onVideoAspect = (aspect) => aspects.push(aspect);
		expect(vm.videoAspect).toBe(1);
		const rect = (width: number, height: number) =>
			FakeWorker.last.emit({ command: "setViewRect", rect: { x: 0, y: 0, width, height } });
		rect(8, 4);
		rect(8, 4);
		rect(0, 0);
		expect(aspects).toEqual([2]);
		expect(vm.videoAspect).toBe(2);
	});

	it("reports a trace overflow, and its end when the trace is cleared", () => {
		const vm = new VirtualMachine(machine());
		const changes: boolean[] = [];
		vm.onTraceOverflow = (overflow) => changes.push(overflow);
		const trace = (source: number) =>
			FakeWorker.last.emit({ type: "trace", history: [{ type: "JSR", source, target: 0 }] });
		trace(1);
		trace(1);
		trace(2);
		expect(vm.traceOverflow).toBe(true);
		vm.clearTrace();
		expect(changes).toEqual([true, false]);
	});

	it("hands the hypercalls to onHypercall", () => {
		const vm = new VirtualMachine(machine());
		const onHypercall = vi.fn();
		vm.onHypercall = onHypercall;
		const call = { cmd: 0x01, address: 0x300, length: 2, stop: false, message: "hi" };
		FakeWorker.last.emit({ type: "hypercall", call });
		expect(onHypercall).toHaveBeenCalledWith(call);
	});
});
