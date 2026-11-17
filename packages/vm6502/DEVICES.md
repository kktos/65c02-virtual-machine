# Machine devices

Status: the loading is implemented (branch `feat/machine-devices`); the //e's register window is **proposed, not
implemented**. Notes from the design discussion of 2026-11-17.

## Why

The bus builds its slot cards from the machine's config (`slots.conf.ts`, `CARD_FACTORIES` in `apple.bus.ts`).
Devices that aren't cards (the //e timer, and whatever comes next) were hard-wired in the bus. They now come from
the config too, and since the bus can't know them beforehand, their class is loaded at run time like the bus's and
the video's (`class` + `path`).

## Implemented

- `MachineConfig.devices: DeviceConfig[]` (`types/machine.interface.ts`): `id` (its name in the save states),
  `label` (the Interrupts window's source), `class`, `path` (relative to `src/machines`, the file a `*.device.ts`),
  `options` (machine-specific: the wiring and the device's own settings).
- `loadDevices` / `installDevices` (`virtualmachine/cpu/loaders/device.loader.ts`): `import.meta.glob` of
  `machines/**/*.device.ts`, on both threads (worker `init`, `VirtualMachine.loadBus`). A module or class not found
  is logged and left out.
- `IBus.installDevices(devices)`: a separate step right after the constructor, as the loading is async.
- //e: `AppleDevice` (`devices/device.interface.ts`: `read` / `write` at an offset, `tick`, `reset`, `snapshot` /
  `restoreSnapshot`, all optional), built with `{ bus, setIrq, options }`. `AppleTimer` moved to
  `devices/timer.device.ts`, declared in `conf/devices.conf.ts`. Wiring today: `options.io: { address, size }` and
  `options.irq` (IMU ID 8–15), checked against the IMU's registers, the cards' slots and the other devices.
- Save state: `devices: { [id]: state }`; a state from before restores the timer from its old `timer` field.
- Tests: `tests/timer.test.ts` ("//e devices").

### The keyboard (2026-11-17)

The keyboard was hard-wired in the bus (`bus/apple.keyboard.ts`, `$C000` / `$C010` in `apple.switches.ts`, the host
keys mapped in `AppleBus.pressKey`, Open / Solid Apple in `kbd_pb0` / `kbd_pb1`). It is now a device
(`devices/keyboard.device.ts`, `AppleKeyboard`, first in `conf/devices.conf.ts`), so a machine can get another one
(a ][+'s, uppercase and no AKD; an ADB-like one with an IRQ…).

- **A device can take over the //e's own soft switches**: `options.switches: { read?: number[]; write?: number[] }`,
  addresses in `$C000`–`$C08F`, by access; a read calls `readSwitch(address)`, a write `writeSwitch(address, value)`.
  The machine's handler there is replaced. `io` stays for register blocks in the slots' space (`$C090`–`$C0FF`).
  Checked: in range, and no address (per access) another device took, by its `io` or its `switches`.
- The keyboard takes the reads of `$C000`–`$C00F` (all the latch on a //e; their writes stay the memory switches:
  before, only `$C000` was mapped) and `$C010` both ways.
- **The keyboard role**: a device implementing `AppleKeyboardDevice` (`isKeyboardDevice`: it has `getKeyboardState`)
  is `bus.keyboard`, at most one (a second is refused). The bus forwards it the host's keys (`pressKey`,
  `releaseKey`) and the typing calls (`typeText`, `holdKey`, `clearKeys`, `setKeyDelay`, `getKeyboardState`), reads
  its `latch` for `$C011`–`$C01F`, ORs its `openApple` / `solidApple` with the joystick's buttons (`$C061` / `$C062`).
  The host → //e key mapping is the device's.
- No keyboard: `$C000`–`$C010` read 0 silently (the ROM polls `$C000`), host keys are lost, the typing calls throw
  "This machine has no keyboard" (the worker's `keyboard` command answers with it).
- Save state: `devices.keyboard` (latch, strobe, Apple keys, queue…). A state from before restores it from the bus's
  old `lastKey` / `keyStrobe` / `kbd_pb0` / `kbd_pb1` fields and the old top-level `keyboard`.
- The joystick's buttons stay the bus's (`joy_pb*`), until the joystick is a device too.
- Tests: `tests/keyboard.test.ts` ("the keyboard device on the //e"), `tests/timer.test.ts` (switch wiring).

## The question: an address, or only an IMU ID?

First thought: a device only needs its IMU ID, to raise an interrupt. Not enough: the program has to **talk** to the
device (the timer's handler acknowledges it at `$C0B9`, the program sets its period and starts it). The ID only
says who interrupted. And a device can have registers without an interrupt (a clock).

So the devices are **virtual slots**, and they need I/O space. The only free space is slot 3's (`$C0B0`–`$C0BF`, see
IMU.md "//e placement of the registers"): `$C000`–`$C08F` has only scattered holes, an empty slot's space can get a
card later.

- The IMU uses 4 ports (`$C0B0`–`$C0B3`: INDEX, DATA LO, DATA HI, CURRENT / EOI). `$C0B4`–`$C0B7` is only
  "reserved" headroom, used by nothing, and the IMU grows through its indexed registers, not ports.
- So **12 bytes** are free (`$C0B4`–`$C0BF`), not 8. Not enough to give each of 8 devices its own registers: a
  selector, as the IMU does.

## Proposal

**The device number is its IMU ID (8–15).** One number for the interrupt and the registers: 8 virtual slots. A
device that never interrupts still takes an ID, never asserted.

**A select register and a direct window** (not index + data: one select, then plain `LDA` / `STA`):

| Addr | Role |
|---|---|
| `$C0B0`–`$C0B3` | IMU (unchanged) |
| `$C0B4` | SELECT: the device number (8–15). Readable, for save / restore |
| `$C0B5`–`$C0BF` | the selected device's registers 0–10 |

A device needing more than 11 registers puts its own index / data pair in its window. Slot 3's I/O space is then
fully used: a new IMU port would take one from the window (shouldn't happen).

The timer would become: select 8, then CTRL `$C0B5`, ACK `$C0B6`, PERIOD `$C0B7`.

### Interrupts and the selection

The main program selects device 9, the timer fires, its handler selects 8 to acknowledge it and returns: the main
program now talks to the wrong device. (The IMU avoids it for its hot path: CURRENT / EOI have their own port, a
handler never touches INDEX. A handler that programs IMU registers has the same problem.)

1. **Manual**: SELECT is readable, the handler saves / restores it (`LDA $C0B4 / PHA … PLA / STA $C0B4`), about 4
   instructions.
2. **Automatic**: the IMU already tracks each frame and matches its RTI (`onRti`). On a vectored IRQ for ID n it
   saves SELECT and sets it to n, the matching RTI restores it: the handler just does `STA $C0B6` to acknowledge.
   Vectored IRQs only: a handler reached through `$FFFE` / `$3FE` selects by hand. The same could save / restore
   the IMU's INDEX.

Leaning towards both: SELECT readable (1 always works), and 2 for the vectored handlers.

### What it changes

- `AppleDeviceWiring` becomes just the ID: no `io` / `size` (the address comes from the ID, the register count is
  the device's). The overlap checks go away, only "ID free, 8–15" stays.
- The bus decodes `$C0B4`–`$C0BF` itself (SELECT, then the window to the selected device), instead of mapping each
  device's range over the I/O handlers.
- Save state: SELECT (and the per-frame saved SELECTs if automatic).
- `examples/imu-timer.asm`, `tests/timer.test.ts`, IMU.md (the //e placement, the timer's table, the port table's
  "4–15 reserved").

## Open questions

1. Device number = IMU ID, so at most 8 devices: fine?
2. Direct window (select + 11 registers), or select + index + data?
3. Auto-select on a vectored IRQ and restore on RTI, or manual only?
4. In `feat/machine-devices` before its first commit (the timer's addresses can still change freely), or after?
