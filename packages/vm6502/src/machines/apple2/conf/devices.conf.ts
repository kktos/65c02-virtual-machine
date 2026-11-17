import type { DeviceConfig } from "@/types/machine.interface";
import type { AppleDeviceWiring } from "../devices/device.interface";

/** The IMU ID the timer drives (the slots take 1-7). */
export const TIMER_IMU_ID = 8;
/** Its registers: slot 3's I/O space after the IMU's (see IMU.md). */
export const TIMER_IO = 0xc0b8;

/** `count` addresses from `start`. */
const addresses = (start: number, count: number) => Array.from({ length: count }, (_, index) => start + index);

/** The //e's keyboard: any read of $C000-$C00F is the latch (their writes are the memory switches), $C010 AKD. */
const keyboardWiring: AppleDeviceWiring = { switches: { read: addresses(0xc000, 0x11), write: [0xc010] } };
const timerWiring: AppleDeviceWiring = { io: { address: TIMER_IO, size: 8 }, irq: TIMER_IMU_ID };

/** The //e's devices besides the slot cards, built and wired by AppleBus.installDevices. */
export const devicesConfig: DeviceConfig[] = [
	{
		id: "keyboard",
		label: "Keyboard",
		class: "AppleKeyboard",
		path: "apple2/devices/keyboard.device",
		options: { ...keyboardWiring },
	},
	{
		id: "timer",
		label: "Timer",
		class: "AppleTimer",
		path: "apple2/devices/timer.device",
		options: { ...timerWiring },
	},
];
