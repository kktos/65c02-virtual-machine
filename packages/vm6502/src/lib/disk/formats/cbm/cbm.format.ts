// Commodore disks (.d64): CBM DOS, the 1541's and 4040's. Tracks numbered from 1, 17 to 21 sectors a track,
// the BAM and a flat directory on track 18, files as chains of sectors. No blocks but the sectors ("blocks" in
// CBM speak). A PRG's first 2 bytes are its load address.

import { D64_SECTOR_SIZE, D64Image, DIRECTORY_TRACK, petsciiText, sectorsPerTrack } from "./d64";
import type { DiskDirectory, DiskFile, DiskFormat, DiskLayout, DiskVolume, OpenedDisk } from "../../diskFormat.type";
import { tsLabel, tsLink } from "../../diskLayout.utils";

const ROOT_ID = "$";

/** The sizes with an error byte a sector after the sectors */
const ERROR_BYTES_SIZES = [174848 + 683, 196608 + 768];

export const cbmFormat: DiskFormat = {
	id: "cbm",
	name: "Commodore",
	open(file) {
		let image: D64Image;
		try {
			image = new D64Image(file);
		} catch {
			return null;
		}

		let totalSectors = 0;
		for (let track = 1; track <= image.tracks; track++) totalSectors += sectorsPerTrack(track);
		const noSector = () => new Uint8Array();
		const layout: DiskLayout = {
			tracks: {
				first: 1,
				count: image.tracks,
				sectors: sectorsPerTrack,
				hex: false,
				title: "CBM sectors: tracks from 1, 17 to 21 sectors a track, 256 bytes",
			},
			readSector: (track, sector) => image.sector(track, sector) ?? noSector(),
			sectorOffset: (track, sector) => image.sectorOffset(track, sector),
			readBlock: noSector,
			blockOffset: () => 0,
		};

		const entries = image.directory();

		const owners = (() => {
			let map: Map<number, string> | undefined;
			return () => {
				if (map) return map;
				map = new Map<number, string>();
				map.set(image.linearSector(DIRECTORY_TRACK, 0), "BAM");
				for (const ts of image.directorySectors())
					map.set(image.linearSector(ts.track, ts.sector), "Directory");
				for (const entry of entries) {
					const name = petsciiText(entry.name);
					for (const index of image.readChain(entry.track, entry.sector).sectors) map.set(index, name);
				}
				return map;
			};
		})();

		const readDir = (): DiskDirectory => ({
			title: `"${petsciiText(image.diskName)}" · ${entries.length} files · ${image.blocksFree} blocks free`,
			where: { label: "sectors", links: image.directorySectors().map((ts) => tsLink(layout, ts)) },
			columns: [
				{ label: "", cls: "w-4 text-amber-400" },
				{ label: "Blocks", cls: "w-12 text-right tabular-nums" },
				{ label: "Name", cls: "font-mono text-gray-100 whitespace-pre" },
				{ label: "Type", cls: "w-10 font-mono" },
				{ label: "Start", cls: "w-20 font-mono text-gray-500" },
			],
			entries: entries.map((entry, index) => {
				const name = petsciiText(entry.name);
				return {
					id: String(index),
					isDir: false,
					name,
					type: entry.type,
					title: entry.closed ? entry.type : `${entry.type}, not closed (a "*" file: a write never finished)`,
					locked: entry.locked,
					cells: [
						entry.locked ? "<" : "",
						String(entry.blocks),
						name,
						`${entry.closed ? "" : "*"}${entry.type}`,
						tsLabel(layout, entry.track, entry.sector),
					],
				};
			}),
		});

		const readFile = (id: string): DiskFile | null => {
			const entry = entries[Number(id)];
			if (!entry) return null;
			const chain = image.readChain(entry.track, entry.sector);
			const sectors = chain.sectors.map((index) => image.trackSector(index));
			const isPrg = entry.type === "PRG" && chain.data.length >= 2;
			const address = isPrg ? (chain.data[0] as number) | ((chain.data[1] as number) << 8) : 0;
			const fields: [string, string][] = [
				["Directory", `${tsLabel(layout, entry.at.track, entry.at.sector)} #${entry.at.slot}`],
				["Blocks", String(entry.blocks)],
				["Start", tsLabel(layout, entry.track, entry.sector)],
				["Bytes", chain.data.length.toLocaleString()],
			];
			if (isPrg) fields.push(["Load address", `$${address.toString(16).toUpperCase().padStart(4, "0")}`]);
			return {
				name: petsciiText(entry.name),
				typeLabel: entry.closed ? entry.type : `${entry.type} · not closed`,
				locked: entry.locked,
				deleted: false,
				fields,
				error: chain.broken ? "The chain of sectors is broken: it links nowhere, or back to itself" : undefined,
				data: chain.data,
				loaded: isPrg ? { address, bytes: chain.data.subarray(2) } : null,
				groups: [{ label: "Sectors", kind: "data", items: sectors.map((ts) => tsLink(layout, ts)) }],
			};
		};

		const readVolume = (): DiskVolume => {
			const idDos = image.idAndDosType;
			return {
				title: "BAM",
				titleLink: tsLink(layout, { track: DIRECTORY_TRACK, sector: 0 }),
				fields: [
					{ label: "Disk name", value: `"${petsciiText(image.diskName)}"` },
					{ label: "ID", value: petsciiText(idDos.subarray(0, 2)) },
					{ label: "DOS type", value: petsciiText(idDos.subarray(3, 5)) },
					{ label: "Directory", links: image.directorySectors().map((ts) => tsLink(layout, ts)) },
					{ label: "Geometry", value: `${image.tracks} tracks, ${totalSectors} sectors of 256 bytes` },
					{
						label: "Free",
						value: `${image.blocksFree} blocks (${((image.blocksFree * D64_SECTOR_SIZE) / 1024).toFixed(1)} KB)`,
					},
				],
				map: { kind: "tracks", free: (track, sector) => image.isFree(track, sector) ?? false },
			};
		};

		const opened: OpenedDisk = {
			badge: { label: `CBM DOS ${petsciiText(image.idAndDosType.subarray(3, 5))}`, tone: "amber" },
			size: `${image.tracks} tracks · ${totalSectors} sectors`,
			warnings: ERROR_BYTES_SIZES.includes(file.length)
				? ["With the error bytes (a byte a sector, not shown)"]
				: [],
			charset: "petscii",
			layout,
			volume: { label: "BAM · sector map", read: readVolume },
			root: { id: ROOT_ID, label: "Directory" },
			home: { kind: "dir", id: ROOT_ID },
			readDir,
			readFile,
			ownerOfSector: (track, sector) => owners().get(image.linearSector(track, sector)),
			ownerOfBlock: () => undefined,
		};
		return opened;
	},
};
