# Code Review — `feat/compact-debugger-toolbar`

**Date:** 2026-11-07
**Scope:** `main...feat/compact-debugger-toolbar` (2 commits: `1c116da` compact emulator toolbar, `edbb905` compact debugger toolbar)
**Files:** 11 changed, +173 / −237, all under `packages/vm6502/src`

## Summary

This branch replaces the per-control "card" chrome (each control had its own `bg-gray-800 p-2 rounded-lg border` wrapper and 40px buttons) with one dense toolbar. Two new Tailwind v4 utilities, `toolbar-btn` and `toolbar-sep`, carry the shared styling. Container queries (`@container` / `@[26rem]` / `@[48rem]`) show or hide the text labels as the panel gets wider or narrower. `DebuggerControls` drops the shadcn `Button`/`ButtonGroup` in favour of plain `toolbar-btn` buttons. `SpeedControl` changes from an inline `<select>` plus a "custom" input mode to a single popover.

Overall this is a clean simplification. It deletes more code than it adds, removes the inline SVGs in favour of lucide icons, and makes the toolbar styling consistent. There is one functional regression (custom speed input) and a few small UX and consistency points.

**Checks run**
- `vue-tsc -b --noEmit`: passes
- `vite build`: passes
- Tailwind override ordering: verified in the built CSS. `.toolbar-btn` comes before `.text-gray-400`, `.text-white`, `.hover:bg-red-500` and the other utilities that callers use to override it, so those overrides win as intended.

---

## Findings

### 1. ✅ DONE (`0f26d76`) — [Medium] Clearing the custom speed field sets the clock to 0, which means *unlimited* on the 65C02 core
`src/app/machine/SpeedControl.vue` (`onCustomChange`)

```ts
const value = Number((event.target as HTMLInputElement).value);
if (Number.isFinite(value) && value >= 0) targetSpeed.value = value;
```

`Number("")` is `0`, so if the user empties the field and tabs or clicks away, the speed is set to `0`. In `cpu.65c02.ts:170`, `clockSpeedMhz === 0` switches to free-running mode (`cyclesPerTimeslice = 1000000`), so the emulator suddenly runs flat out. `useEmulatorSpeed` also saves the `0` to `localStorage`, so it comes back on the next load. On the 6502 core, `setClockSpeed` ignores `0`, so the UI and the CPU disagree.

This is a regression. Before, `v-model.number` left an empty field as `""`, and the worker's `typeof speed === "number"` guard dropped it.

**Suggested fix:** ignore empty input and require `> 0` (or make "Max / unlimited" an explicit preset if 0 is meant to be reachable):
```ts
const raw = (event.target as HTMLInputElement).value.trim();
const value = Number(raw);
if (raw !== "" && Number.isFinite(value) && value > 0) targetSpeed.value = value;
else (event.target as HTMLInputElement).value = String(targetSpeed.value);
```

### 2. ✅ DONE (`0f26d76`) — [Low] A rejected custom speed stays in the input
`src/app/machine/SpeedControl.vue`

The input is bound one way (`:value="targetSpeed"`). When `onCustomChange` rejects a value (for example a typed `-3`), `targetSpeed` does not change, so Vue never re-renders the field. The invalid text stays there and looks applied. The `else` branch in the fix for finding 1 also covers this.

### 3. ✅ DONE — [Low / UX] Reset now sits right next to Step Out
`src/app/debugger/DebuggerControls.vue`

Reset ("Reset the CPU and memory") used to be in its own group after BRK and Trace. It is now the fifth button in the execution cluster, immediately after Step Out, at the same size and with no separator. While stepping quickly, one slip of the mouse wipes the machine state, and there is no confirmation. The red tint helps, but I'd suggest one of these:
- Put a `toolbar-sep` before it, or move it to the end of the toolbar.
- Require a confirmation, or a modifier key (for example Shift-click) to reset.

**Resolution:** Reset moved back to its own group after BRK / Trace, with a separator on each side.

### 4. ⏭️ DROPPED (not important) — [Low / UX] The speed trigger shows only the measured speed, not the target
`src/app/machine/SpeedControl.vue`

The old UI showed the measured MHz next to the selected target. The new trigger shows only the measured `speedMhz`, so the target is visible only by opening the popover. Since `isManual` was removed, a custom target also has no indicator: no preset gets a check mark and the trigger looks the same. Consider showing the target in the trigger's `title`, for example `Clock Speed (target: 2.8 MHz)`, or marking the input row when the target isn't a preset.

### 5. ✅ DONE — [Nit] Toggle state is exposed inconsistently
- `DebuggerControls.vue`: BRK and Trace now have `aria-pressed`, which is good. The console toggle (`isConsoleVisible`) does not, and its title still says "Open Command Interface" while the console is open.
- `MemoryMap.vue` and `MouseControl.vue` are also on/off toggles without `aria-pressed`.

Adding `:aria-pressed` to these would make all the toggles behave alike.

**Resolution:** the console, Memory Map and mouse-capture toggles now have `:aria-pressed`; the console title switches between "Open" and "Close Command Interface".

### 6. ✅ DONE — [Nit] Unused `disabled:` classes in `MouseControl.vue`
`class="toolbar-btn group disabled:opacity-50 disabled:cursor-not-allowed"`. The button never gets a `disabled` attribute, and `toolbar-btn` already defines disabled styling (`disabled:opacity-40`). These classes are unused and differ from the shared style. Remove them.

**Resolution:** removed; the button relies on `toolbar-btn` alone.

### 7. ✅ DONE — [Nit] Separators can be left at the end of a wrapped row
`src/app/App.vue`

The toolbar is `flex-wrap`, and the separators show at widths of `@[26rem]` and up. Just above that width, the speed control can wrap to a second row and leave a `toolbar-sep` alone at the end of the first row. This only affects looks. Options are `flex-nowrap` above 26rem, or hiding the separators until a larger breakpoint.

**Resolution:** the toolbar row is `@[26rem]:flex-nowrap` (inside a separate `@container` wrapper, since a container query cannot target the container itself), so it only wraps when the separators are hidden. The widest content fits: about 25rem with icons only (26–48rem), about 40rem with the video and disk labels (48rem and up).

### 8. ✅ DONE — [Nit] The machine selector button styles itself differently from the others
`MachineSelector.vue` adds `bg-gray-700 hover:bg-gray-600` on top of `toolbar-btn`, so it is the only toolbar button with a background when idle. If that is meant to mark it as the main control, fine. If not, drop the extra classes.

**Resolution:** extra classes dropped; it now looks like the other toolbar buttons. The machine name and a chevron (the menu cue) are now inside the trigger, so clicking the name opens the menu too.

---

## Positives
- **Shared utilities:** `@utility toolbar-btn` and `toolbar-sep` replace about ten copies of the same long class string.
- **Labels that collapse with width:** container queries hide them on narrow panels instead of breaking the layout. The labels' content moved into the `title` attributes (machine name, video mode, disk file name), so nothing is lost.
- **Hover fix in `DiskDriveControl`:** the icon used `hover:` where `group-hover:` was needed, so hovering the button didn't recolour it. This is fixed.
- **Lucide icons:** the inline SVGs for clipboard and the hamburger menu are now lucide icons (`ClipboardPaste`, `ChevronDown`, `Check`).
- **Trace overflow:** the warning moved into the button's `title`. Before, it was only on a tiny dot that was hard to hover.
- **Simpler `SpeedControl`:** with `isManual`, `switchToPresets` and `onSelectChange` gone, the component has much less state.
- **Unused imports:** the `Button` and `ButtonGroup` imports were removed. Other components still use them, so nothing else needs cleaning up.

## Verdict
Fix finding 1 (the empty input that switches to unlimited speed) before merging. Everything else is optional polish.
