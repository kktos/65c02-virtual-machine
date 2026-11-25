# Code Review — `VirtualMachine` class

**Date:** 2026-11-25
**Scope:** `src/virtualmachine/virtualmachine.class.ts` (883 lines) at `d0f383b`, with the parts of `cpu.worker.ts`, `cpu.65c02.ts`, `keyboardJoystick.ts` and the callers needed to confirm the findings.

## Summary

`VirtualMachine` is the main-thread side of the emulator. It owns the worker, the shared buffers, video, audio and keyboard input, and it is the API the debugger, the commands and the MCP tools call. The core design is sound: shared memory gives cheap synchronous reads, the request/reply RPC is clean, and video state can arrive in any order.

The weak spots are failure and teardown. A machine that fails to initialize can leave `ready`, and every request after it, pending forever. `terminate()` leaves in-flight requests unanswered. There are also two input and render bugs that are cheap to fix. Beyond those, the class does too much and is tied to Vue.

---

## The good

- **Shared memory design.** Registers, memory, stack metadata and video all live in `SharedArrayBuffer`s. `getRegisters`, `read` and `getSpeed` are synchronous and copy nothing, so the debugger never waits on a message round trip just to show state.
- **Clean request/reply RPC.** `request<T>` matches replies by `id`. The worker queues messages that arrive before `init`, so callers don't have to wait for `ready` to send something.
- **Video state can arrive in any order.** `palette`, `viewRect` and `videoScaling` are kept when they arrive and applied in `initVideo`, so it doesn't matter whether the canvas or the worker's messages come first.
- **`screenshot()` builds the image from the video buffer and the palette, not the canvas.** You get exact pixels whatever the canvas size or CSS scaling.
- **Audio scheduling is solid.** It restarts a little ahead of now after an underrun and drops chunks once more than 150 ms is queued, so the sound never drifts into growing lag.
- **Optional bus features degrade well.** `peek` falls back to `readDebug`, which falls back to `read`. `readDebugRange` falls back to a loop.
- **Small things done right:** `chunkData` catches the dev server answering a missing ROM with `index.html`, `blur` releases held keys, and `lastStop` is recorded before `onmessage` fires. The comments explain why, not what.

---

## The bad (bugs)

### 1. ✅ DONE — [High] A failed init leaves `ready` stuck forever

`virtualmachine.class.ts:277-286` (`loadBus`), `cpu.worker.ts` (`self.onmessage`, `init`)

There are two paths:

- In `loadBus`, a missing bus module or class does `console.error` and `return`. `ready` **resolves** with `bus === undefined`, and the worker never gets `init`.
- When the worker's `init()` returns `false`, it sets `initState = "failed"` but never tells the main thread. `workerReadyPromise` never settles, so `ready` hangs.

In both cases the "could not start" toast in `useMachine.ts:188` never shows. Every `request()` sent after that hangs too, because `notInitialized` drops it without replying. Through MCP this looks like a tool that never returns.

**Suggested fix:** `throw` in `loadBus` instead of returning. Have the worker post `{ type: "initFailed", error }` (and answer queued requests with an error). On the main thread, reject `ready` and every pending request when that message arrives.

### 2. ✅ DONE — [Medium] `terminate()` leaves pending requests hanging

`virtualmachine.class.ts:548-557`, `:870-882`

`requests` is never drained. An MCP `step`, `reset` or `saveState` call that is in flight when the user switches machines never resolves. `request()` also has no timeout, so a reply the worker never sends hangs forever.

**Suggested fix:** store `{ resolve, reject }` in `requests`. In `terminate()`, reject every entry (`"VM terminated"`) and clear the map. An optional timeout per request would cover worker-side gaps too.

### 3. ✅ DONE — [Medium] Ctrl/Cmd plus a joystick key leaves a key stuck on the machine

`virtualmachine.class.ts:436`, `:466`

On keydown, the joystick is skipped when Ctrl or Meta is held, so Ctrl+ArrowLeft goes to the worker as a keydown. On keyup, `keyboardJoystick.handleKey(code, false)` is checked without looking at modifiers and takes the key, so the worker never sees the keyup. Turning the keyboard joystick on while an arrow is held does the same thing. The key stays down on the machine until the page loses focus.

**Suggested fix:** keep a set of codes whose keydown went to the worker, and always send the keyup for those, whatever the joystick does with it.

### 4. ✅ DONE — [Low] `initVideo` can run twice

`virtualmachine.class.ts:354-372`, callers `App.vue:196` and `useMachine.ts:175`

Each call creates a new `VideoOutput` without destroying the previous one, and calls `renderFrame()`, which starts another `requestAnimationFrame` loop. A second call means double rendering and a leaked output.

**Suggested fix:** `this.videoOutput?.destroy()` first, and only call `renderFrame()` when `isRendering` was false.

### 5. ✅ DONE — [Low] The trace overflow check can miss overflows

`virtualmachine.class.ts:502-507`

Overflow is detected by comparing `JSON.stringify(history[0])` between polls. Tight loops write identical JSR entries, so the first entry can look the same even after the ring buffer has wrapped.

**Suggested fix:** have the worker send a running total or sequence number with the trace and compare that.

**Done:** the worker counts the entries logged since the last clear (`getTraceTotal`) and sends that `total` with the trace. The main thread flags an overflow when the entries dropped (`total - history.length`) grew since the previous poll. The first poll after a clear or a restart only sets the baseline, so a poll in flight across the clear can't raise a false one.

---

## The ugly (design and hygiene)

### 6. ✅ DONE — [Design] One class does too much

It handles worker RPC, the audio sink, global DOM keyboard and paste listeners, the joystick, video, trace polling, register editing, memory access and CSS/font loading. A natural split:

- `WorkerClient`: request/reply, the message dispatch, teardown
- `AudioSink`: the `AudioContext` and the scheduling
- `InputController`: keydown/keyup/paste/blur and the keyboard joystick

`VirtualMachine` would then be a thin façade over them.

**Done:** `workerClient.class.ts`, `audioSink.class.ts` and `inputController.class.ts` hold those parts; `VirtualMachine` keeps its public API and delegates. Video, trace and registers stay in it.

### 7. ✅ DONE — [Design] The class depends on Vue and global app state

`traceOverflow` and `videoAspect` are `ref()`s, and the constructor calls `useMemoryMap().clearRegions()`. A domain object shouldn't reset a global composable as a side effect of being created. Expose plain state plus callbacks or events, and let the composable layer (`useMachine`) wire it to Vue.

**Done:** `traceOverflow` and `videoAspect` are plain getters with `onTraceOverflow` / `onVideoAspect` callbacks, and hypercalls go out through `onHypercall`. `useMachine` resets the memory map to the machine's regions, mirrors the two values into refs (`App.vue` and `TraceView` read those), and wires `applyHypercall` (moved from `virtualmachine/hypercall.ts` to `lib/hypercallEffects.ts`). Nothing in `virtualmachine/` imports Vue or a composable any more.

### 8. ✅ DONE — [Design] The audio state is module-level

`audioCtx` and `nextStartTime` (`:61-62`) are shared by every VM instance and outlive `terminate()`. Chunks already scheduled keep playing after teardown, and `nextStartTime` carries over to the next machine. Move them into the instance, or into the `AudioSink` from finding 6.

**Done:** each VM has its own `AudioSink` (schedule and queued sources); `terminate()` stops what it queued. The `AudioContext` itself stays shared: browsers cap them, and once unlocked by a gesture it stays usable for the next machine.

### 9. ✅ DONE — [Design] Register writes are only safe while paused, but the class doesn't enforce it

`updateRegister`, `restoreRegisters`

While the CPU runs, its registers are held in locals (`registersLive` in `cpu.65c02.ts`), so writes to `sharedRegisters` are silently lost. Every caller guards this today (`StatusFlagsView`, the MCP `load_binary` tool, the `JSR` hook). Add a check or at least a doc line in the methods themselves so the next caller doesn't get it wrong.

**Done:** `updateRegister` and `restoreRegisters` throw while the machine runs or is starting (`assertPaused`), and say why in their doc. New `pauseAndWait()`: the worker now answers `pause` when asked, after its `isRunning`. The console's G wrote SP and PC straight into the shared buffer even on a running machine (racy, not guarded as thought). It now pauses and waits first, writes through `updateRegister`, and resumes as before.

### 10. ✅ DONE — [Hygiene] The worker's message protocol mixes two discriminators

`virtualmachine.class.ts:166-219`

The switch uses `type`, but `setPalette` and `setViewRect` arrive with `command` and fall into `default`. The `break` and `breakpointHit` cases (`:199-204`) do exactly what `default` does. Give every worker-to-main message a `type` and drop the redundant cases.

**Done:** the videos (Apple, PET, Klaus) post `setPalette` / `setViewRect` with `type`, which now get their own cases; the `break` / `breakpointHit` cases are gone (`default` forwards them). Klaus's per-frame `{ command: "syncState" }` post is removed: its bus has no `saveState`, so it never fired, and nothing handled it.

### 11. ✅ DONE — [Hygiene] The generic VM hard-codes the Apple font

`virtualmachine.class.ts:262-266`

`loadCSS` checks and loads `"16px PrintChar21"` after every CSS file, whatever the machine, and leaves a `console.log("Font loaded:")` debug line. The fonts to wait for belong in the machine config (or `document.fonts.ready` after all the CSS is in).

**Done:** the font check and its debug log are gone from `loadCSS`. The Apple's bus already waits for its own fonts (`generateApple2Assets`, `document.fonts.load` on PrintChar21 and PRNumber3) once the CSS is in, and its video does the same in the worker.

### 12. [Nit] A doc comment is on the wrong member

`virtualmachine.class.ts:617-618`

"The last `count` instructions recorded" sits above `getInterrupts`, not `getInstructionTrace`.

### 13. [Nit] Smaller cleanups

- `saveRegisters` stores a positional `number[]`; use `readRegisters()` and an object instead.
- `updateRegister("P")` uses the magic number `0x30`, but the flag-mask constants are already imported. The `flagMasks` object is also rebuilt on every call; hoist it.
- `loadBus` does `Object.entries(...).find(...)` where `BusModule[busConfig.class]` would do.
- `keyboardRequest` and `stateRequest` duplicate the same unwrap-or-throw-on-`error` logic; one helper would cover both.
- Some members are arrow-function fields and others are methods, with no clear rule.
- Nearly every field is `public`, including `worker` and `sharedBuffer`.

### 14. [To check] `read()` goes through the main thread's copy of the bus

`virtualmachine.class.ts:699-701`

On the Apple, reading `$C0xx` through `bus.read` can flip the main-thread copy's soft switches. Callers that only want to look at memory (`disassembler.ts`, the expression parser, `hexdump`) probably want `peek()`. Not verified.

---

## Verdict

The core design is good. Fix 1 and 2 first: together they cause most of the hangs that would show up for no apparent reason in MCP sessions. 3 and 4 are small and worth doing at the same time. 6 to 8 are a refactor to plan, not urgent.
