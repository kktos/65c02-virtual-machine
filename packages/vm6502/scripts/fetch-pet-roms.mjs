#!/usr/bin/env node
/**
 * Downloads the Commodore PET 3032 (BASIC 2) ROMs from the VICE source tree into public/roms/pet/.
 * They are Commodore's: not committed (public/roms/ is git-ignored), fetched by each checkout.
 *
 *   npm run roms:pet
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VICE_PET = "https://raw.githubusercontent.com/VICE-Team/svn-mirror/main/vice/data/PET";
const ROMS = [
	{ file: "basic-2.901465-01-02.bin", size: 8192 },
	{ file: "edit-2-n.901447-24.bin", size: 2048 },
	{ file: "kernal-2.901465-03.bin", size: 4096 },
	{ file: "characters-2.901447-10.bin", size: 2048 },
];

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "roms", "pet");
await mkdir(dir, { recursive: true });

for (const { file, size } of ROMS) {
	const path = join(dir, file);
	const exists = await access(path).then(
		() => true,
		() => false,
	);
	if (exists) {
		console.log(`ok       ${file}`);
		continue;
	}
	const response = await fetch(`${VICE_PET}/${file}`);
	if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
	const data = new Uint8Array(await response.arrayBuffer());
	if (data.length !== size) throw new Error(`${file}: ${data.length} bytes, expected ${size}`);
	await writeFile(path, data);
	console.log(`fetched  ${file}`);
}
