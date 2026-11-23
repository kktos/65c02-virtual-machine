// Bundles a benchmark as the browser build would (no vitest import rewriting), then runs it.
//   pnpm bench:cpu [seconds]                    the CPU core alone (Klaus 65C02 test, flat bus)
//   pnpm bench:cpu apple <disk.po> [seconds]    an Apple //e booting that disk
// Node flags after `--`, e.g. `pnpm bench:cpu 5 -- --cpu-prof`.
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const sep = args.indexOf("--");
const nodeFlags = sep < 0 ? [] : args.slice(sep + 1);
const benchArgs = sep < 0 ? args : args.slice(0, sep);
const name = benchArgs[0] === "apple" ? "apple" : "cpu";
if (benchArgs[1] && name === "apple") benchArgs[1] = path.resolve(process.env.INIT_CWD ?? process.cwd(), benchArgs[1]);

const outDir = mkdtempSync(path.join(tmpdir(), "vm6502-bench-"));
await build({
	configFile: false,
	logLevel: "warn",
	root,
	resolve: { alias: { "@": path.join(root, "src") } },
	build: { ssr: `src/virtualmachine/cpu/bench/${name}.bench.ts`, outDir, minify: false, emptyOutDir: true },
});
const { status } = spawnSync(process.execPath, [...nodeFlags, path.join(outDir, `${name}.bench.js`), ...benchArgs], {
	stdio: "inherit",
});
process.exit(status ?? 1);
