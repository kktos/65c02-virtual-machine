import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ToolDescriptor } from "./bridge.ts";
import { HOST_FILE_KEY, readHostFiles, resolveHostPath } from "./hostFiles.ts";

const dir = mkdtempSync(join(tmpdir(), "vm6502-mcp-"));
writeFileSync(join(dir, "game.po"), Buffer.from([1, 2, 3, 0xff]));

const loadDisk: ToolDescriptor = {
	name: "load_disk",
	description: "",
	inputSchema: {
		type: "object",
		properties: { disk: { type: "string" }, path: { type: "string", [HOST_FILE_KEY]: true }, boot: {} },
	},
};

test("resolveHostPath: ~ and relative paths", () => {
	assert.equal(resolveHostPath("~/a.po", "/x"), join(homedir(), "a.po"));
	assert.equal(resolveHostPath("d/a.po", "/x"), "/x/d/a.po");
	assert.equal(resolveHostPath("/abs/a.po", "/x"), "/abs/a.po");
});

test("readHostFiles: a host file property becomes the file", async () => {
	const args = await readHostFiles(loadDisk, { path: "game.po", boot: true }, dir);
	assert.deepEqual(args, {
		path: { name: "game.po", path: join(dir, "game.po"), size: 4, data: "AQID/w==" },
		boot: true,
	});
});

test("readHostFiles: other properties and tools are left alone", async () => {
	assert.deepEqual(await readHostFiles(loadDisk, { disk: "game.po" }, dir), { disk: "game.po" });
	assert.deepEqual(await readHostFiles(undefined, { path: "game.po" }, dir), { path: "game.po" });
});

test("readHostFiles: errors", async () => {
	await assert.rejects(readHostFiles(loadDisk, { path: "nope.po" }, dir), /path: no such file/);
	await assert.rejects(readHostFiles(loadDisk, { path: "." }, dir), /path: not a file/);
	await assert.rejects(readHostFiles(loadDisk, { path: 42 }, dir), /path: file path expected/);
	await assert.rejects(readHostFiles(loadDisk, { path: " " }, dir), /path: file path expected/);
});
