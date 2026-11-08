// Files on the agent's machine. A page can't read them, so a tool marks a string property of its input
// schema with `"x-vm6502-host-file": true` (`HOST_FILE_KEY` in vm6502's tools.ts): the agent passes a path,
// and the relay reads the file and passes `{ name, path, size, data }` (data in base64) in its place.

import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import type { ToolDescriptor } from "./bridge.ts";

export const HOST_FILE_KEY = "x-vm6502-host-file";
export const HOST_FILE_MAX_BYTES = 64 * 1024 * 1024;

export type HostFile = { name: string; path: string; size: number; data: string };

/** `~` is the home directory; a relative path is relative to the relay's working directory. */
export const resolveHostPath = (path: string, cwd = process.cwd()) =>
	resolve(cwd, path === "~" || path.startsWith("~/") ? homedir() + path.slice(1) : path);

export const readHostFile = async (path: string, field: string, cwd?: string): Promise<HostFile> => {
	if (!path.trim()) throw new Error(`${field}: file path expected`);
	const full = resolveHostPath(path, cwd);
	const info = await stat(full).catch((e: NodeJS.ErrnoException) => {
		throw new Error(`${field}: ${e.code === "ENOENT" ? "no such file" : e.message}: ${full}`);
	});
	if (!info.isFile()) throw new Error(`${field}: not a file: ${full}`);
	if (info.size > HOST_FILE_MAX_BYTES)
		throw new Error(`${field}: ${full} is ${info.size} bytes, at most ${HOST_FILE_MAX_BYTES}`);
	const bytes = await readFile(full);
	return { name: basename(full), path: full, size: bytes.length, data: bytes.toString("base64") };
};

/** The tool's arguments with each host file property (a path) replaced by the file. */
export const readHostFiles = async (
	tool: ToolDescriptor | undefined,
	args: Record<string, unknown>,
	cwd?: string,
): Promise<Record<string, unknown>> => {
	const properties = (tool?.inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
	const out = { ...args };
	for (const [name, schema] of Object.entries(properties)) {
		if (schema?.[HOST_FILE_KEY] !== true || out[name] === undefined) continue;
		if (typeof out[name] !== "string") throw new Error(`${name}: file path expected`);
		out[name] = await readHostFile(out[name], name, cwd);
	}
	return out;
};
