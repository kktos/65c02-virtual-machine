import { KeyboardJoystick } from "./keyboardJoystick";

const kbdElements = new Set<string>(["INPUT", "TEXTAREA", "SELECT"]);

/** Typing in a field of the page: the key is the page's, not the machine's. */
const isPageInput = (event: Event) => {
	const target = event.target as HTMLElement | null;
	return !!target && (kbdElements.has(target.tagName) || target.isContentEditable);
};

const logShortcutError = (e: unknown) => console.error("Debugger shortcut:", e);

/** What the host keyboard drives: the machine's keyboard (`post`), the debugger shortcuts, the joystick inputs. */
export interface InputHost {
	readonly isRunning: boolean;
	play(): void;
	pause(): void;
	step(): Promise<unknown>;
	stepOver(through: boolean): Promise<unknown>;
	stepOut(through: boolean): Promise<unknown>;
	typeText(text: string): Promise<unknown>;
	setAnalogInput(index: number, value: number): void;
	setInputButton(index: number, pressed: boolean): void;
}

/**
 * The page's keyboard and clipboard, to the machine: keys down / up to its keyboard (or its keyboard joystick),
 * the debugger shortcuts (F5, F10, F11), a paste typed in. Listens on `window` between `attach` and `detach`.
 */
export class InputController {
	/** Host keys as the joystick (off unless the user turned it on) */
	readonly joystick: KeyboardJoystick;
	// The keys whose keydown went to the machine: their keyup goes too, whatever the keyboard joystick does with it
	private keysSentDown = new Set<string>();

	constructor(
		private host: InputHost,
		private post: (message: object) => void,
	) {
		this.joystick = new KeyboardJoystick(host);
	}

	attach() {
		window.addEventListener("keydown", this.onKeyDown);
		window.addEventListener("keyup", this.onKeyUp);
		window.addEventListener("paste", this.onPaste);
		window.addEventListener("blur", this.onBlur);
	}

	detach() {
		window.removeEventListener("keydown", this.onKeyDown);
		window.removeEventListener("keyup", this.onKeyUp);
		window.removeEventListener("paste", this.onPaste);
		window.removeEventListener("blur", this.onBlur);
	}

	private onKeyDown = (event: KeyboardEvent) => {
		if (isPageInput(event)) return;

		// Debugger Shortcuts; with Alt, step over / out go through the breakpoints
		if (event.code === "F10") {
			event.preventDefault();
			this.host.stepOver(event.altKey).catch(logShortcutError);
			return;
		}
		if (event.code === "F11") {
			event.preventDefault();
			(event.shiftKey ? this.host.stepOut(event.altKey) : this.host.step()).catch(logShortcutError);
			return;
		}
		if (event.code === "F5") {
			event.preventDefault();
			if (this.host.isRunning) this.host.pause();
			else this.host.play();
			return;
		}

		// A key of the keyboard joystick: the joystick's, not the machine keyboard's (shortcuts still pass)
		if (!event.ctrlKey && !event.metaKey && this.joystick.handleKey(event.code, true)) {
			event.preventDefault();
			return;
		}

		this.keysSentDown.add(event.code);
		this.post({
			command: "keydown",
			key: event.key,
			code: event.code,
			ctrl: event.ctrlKey,
			shift: event.shiftKey,
			alt: event.altKey,
			meta: event.metaKey,
		});

		// Prevent default browser actions for handled keys (except F-keys, etc)
		if (!event.metaKey && (!event.altKey || event.key === "Alt")) {
			if (
				event.key.length === 1 ||
				["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace", "Enter"].includes(event.key)
			) {
				event.preventDefault();
			}
		}
	};

	private onKeyUp = (event: KeyboardEvent) => {
		if (isPageInput(event)) return;

		// A joystick key pressed with Ctrl / Cmd went down on the machine's keyboard: it goes up there too
		const joystickKey = this.joystick.handleKey(event.code, false);
		const sentDown = this.keysSentDown.delete(event.code);
		if (joystickKey && !sentDown) return;
		this.post({ command: "keyup", key: event.key, code: event.code });
	};

	private onPaste = (event: ClipboardEvent) => {
		if (isPageInput(event)) return;

		const text = event.clipboardData?.getData("text");
		if (text) {
			event.preventDefault();
			this.host.typeText(text).catch((e) => console.error("Paste:", e));
		}
	};

	// The page loses the focus: the keyup of the keys down won't come
	private onBlur = () => {
		this.joystick.releaseAll();
		this.keysSentDown.clear();
		this.post({ command: "keyup" });
	};
}
