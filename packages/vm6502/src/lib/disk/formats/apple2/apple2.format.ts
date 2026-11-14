// Apple II disks (.dsk / .do / .po / .2mg / .hdv): a 5.25" floppy (35 tracks x 16 sectors, in DOS or ProDOS
// order) or a bigger image (blocks only), with DOS 3.3, ProDOS or no file system found (a custom DOS: raw
// sectors only). `analyzeDisk` finds out which; this shows it to the editor.

import { toHex } from "@/lib/hex.utils";
import { analyzeDisk, type DiskAnalysis } from "./analyzeDisk";
import type {
	DiskDirectory,
	DiskEditorView,
	DiskEntry,
	DiskFile,
	DiskFormat,
	DiskLayout,
	DiskLink,
	DiskVolume,
	OpenedDisk,
} from "../../diskFormat.type";
import { tsLink } from "../../diskLayout.utils";
import { BLOCK_SIZE, type DiskImage, type SectorOrder, SECTORS_PER_TRACK, TRACKS } from "./diskImage";
import { DOS33_TYPE_NAMES, type Dos33Catalog, readFile as readDosFile, sectorOwners, VTOC } from "./dos33";
import {
	blockOwners,
	fileTypeName,
	isDirectory,
	type ProdosDirectory,
	type ProdosEntry,
	readBitmap,
	readDirectory,
	readFile as readProdosFile,
	STORAGE_TYPES,
} from "./prodos";

const CATALOG_ID = "catalog";
const MAX_DEPTH = 16;

const orderName = (order: SectorOrder) => (order === "dos" ? "DOS order" : "ProDOS order");

const blockLink = (block: number): DiskLink =>
	block ? { label: String(block), view: { kind: "block", block } } : { label: "sparse", view: null };

function layoutOf(image: DiskImage): DiskLayout {
	return {
		tracks: image.hasTracks
			? {
					first: 0,
					count: TRACKS,
					sectors: () => SECTORS_PER_TRACK,
					hex: true,
					title: "DOS 3.3 sectors: 35 tracks x 16 sectors x 256 bytes",
				}
			: undefined,
		blocks: { count: image.blockCount, size: BLOCK_SIZE, title: "ProDOS blocks: 512 bytes" },
		readSector: (track, sector) => image.readSector(track, sector),
		sectorOffset: (track, sector) => image.sectorOffset(track, sector),
		readBlock: (block) => image.readBlock(block),
		blockOffset: (block) => {
			if (image.order === "prodos" || !image.hasTracks) return block * BLOCK_SIZE;
			const [first] = image.blockSectors(block);
			return image.sectorOffset(first.track, first.sector);
		},
		sectorBlock: image.hasTracks ? (track, sector) => image.sectorBlock(track, sector) : undefined,
		blockSectors: image.hasTracks ? (block) => image.blockSectors(block) : undefined,
	};
}

/** DOS 3.3: the catalog (the root, flat), files by catalog index */
function dos33(image: DiskImage, catalog: Dos33Catalog, layout: DiskLayout) {
	const owners = (() => {
		let map: Map<number, string> | undefined;
		return () => {
			map ??= sectorOwners(image, catalog);
			return map;
		};
	})();
	const ownerOfSector = (track: number, sector: number) => owners().get(track * SECTORS_PER_TRACK + sector);

	const readDir = (): DiskDirectory => ({
		title: `Catalog · ${catalog.files.filter((f) => !f.deleted).length} files`,
		where: { label: "sectors", links: catalog.sectors.map((ts) => tsLink(layout, ts)) },
		error: catalog.error,
		columns: [
			{ label: "", cls: "w-4 text-amber-400" },
			{ label: "Type", cls: "w-6 font-mono" },
			{ label: "Sectors", cls: "w-12 text-right tabular-nums" },
			{ label: "Name", cls: "font-mono text-gray-100 whitespace-pre" },
			{ label: "T/S list", cls: "w-20 font-mono text-gray-500" },
		],
		entries: catalog.files.map((file, index): DiskEntry => ({
			id: String(index),
			isDir: false,
			name: file.name,
			type: file.type,
			title: file.deleted ? "Deleted" : DOS33_TYPE_NAMES[file.type],
			locked: file.locked,
			deleted: file.deleted,
			cells: [
				file.locked ? "*" : "",
				file.type,
				String(file.sectorCount),
				file.name,
				tsLink(layout, file.tsList).label,
			],
		})),
	});

	const readFile = (id: string): DiskFile | null => {
		const f = catalog.files[Number(id)];
		if (!f) return null;
		const c = readDosFile(image, f);
		const fields: [string, string][] = [
			["Catalog", `T${toHex(f.entry.track)} S${toHex(f.entry.sector, 1)} #${f.entry.index}`],
			["Sectors", String(f.sectorCount)],
		];
		if (c.address !== undefined) fields.push(["Address", `$${toHex(c.address, 4)}`]);
		if (c.length !== undefined) fields.push(["Length", `$${toHex(c.length, 4)} (${c.length})`]);
		const isBinary = f.type.toUpperCase() === "B" && c.address !== undefined && c.length !== undefined;
		return {
			name: f.name,
			typeLabel: `${f.type} · ${DOS33_TYPE_NAMES[f.type] ?? `$${toHex(f.typeByte)}`}`,
			locked: f.locked,
			deleted: f.deleted,
			fields,
			error: c.error,
			data: c.data,
			// B: 4 bytes of address and length, then the bytes loaded there
			loaded: isBinary ? { address: c.address!, bytes: c.data.subarray(4, 4 + c.length!) } : null,
			groups: [
				{ label: "T/S list", kind: "index", items: c.tsListSectors.map((ts) => tsLink(layout, ts)) },
				{ label: "Data", kind: "data", items: c.dataSectors.map((ts) => tsLink(layout, ts)) },
			],
		};
	};

	const vtoc = catalog.vtoc;
	const readVolume = (): DiskVolume => ({
		title: "VTOC",
		titleLink: tsLink(layout, VTOC),
		fields: [
			{ label: "Catalog", links: [tsLink(layout, vtoc.catalog)] },
			{ label: "DOS release", value: String(vtoc.dosVersion) },
			{ label: "Volume", value: `${vtoc.volume} ($${toHex(vtoc.volume)})` },
			{ label: "T/S pairs a list", value: String(vtoc.maxTsPairs) },
			{
				label: "Last track allocated",
				value: `$${toHex(vtoc.lastTrackAllocated)} (${vtoc.direction > 0 ? "+1" : vtoc.direction})`,
			},
			{
				label: "Geometry",
				value: `${vtoc.tracks} tracks x ${vtoc.sectorsPerTrack} sectors x ${vtoc.bytesPerSector} bytes`,
			},
			{
				label: "Free",
				value: `${vtoc.freeSectors} sectors (${((vtoc.freeSectors * 256) / 1024).toFixed(1)} KB)`,
			},
		],
		map: { kind: "tracks", free: (track, sector) => vtoc.free[track]?.[sector] ?? false },
	});

	return {
		root: { id: CATALOG_ID, label: "Catalog" },
		volume: { label: "VTOC · sector map", read: readVolume },
		home: { kind: "dir", id: CATALOG_ID } as DiskEditorView,
		readDir,
		readFile,
		ownerOfSector,
		ownerOfBlock: (block: number) => {
			const names = image.blockSectors(block).map(({ track, sector }) => ownerOfSector(track, sector) ?? "free");
			return names[0] === names[1] ? names[0] : names.join(" / ");
		},
	};
}

/** ProDOS: directories and files by path ("/VOLUME/DIR/FILE") */
function prodos(image: DiskImage, volume: ProdosDirectory) {
	const rootId = `/${volume.name}`;
	const owners = (() => {
		let map: Map<number, string> | undefined;
		return () => {
			map ??= blockOwners(image, volume);
			return map;
		};
	})();
	const ownerOfBlock = (block: number) => owners().get(block);

	const readDirAt = (keyBlock: number): ProdosDirectory => {
		if (keyBlock === volume.keyBlock) return volume;
		try {
			return readDirectory(image, keyBlock);
		} catch (e) {
			return { ...volume, isVolume: false, keyBlock, blocks: [], entries: [], error: (e as Error).message };
		}
	};

	/** The directory a path names, walking down from the volume directory; null: no such directory */
	const findDir = (path: string): ProdosDirectory | null => {
		if (path === rootId) return volume;
		const names = path.slice(rootId.length + 1).split("/");
		if (!path.startsWith(`${rootId}/`) || names.length > MAX_DEPTH) return null;
		let dir = volume;
		for (const name of names) {
			const entry = dir.entries.find((e) => e.name === name && isDirectory(e));
			if (!entry) return null;
			dir = readDirAt(entry.keyPointer);
		}
		return dir;
	};

	const findEntry = (path: string): ProdosEntry | null => {
		const at = path.lastIndexOf("/");
		const dir = at > 0 ? findDir(path.slice(0, at)) : null;
		return dir?.entries.find((e) => e.name === path.slice(at + 1)) ?? null;
	};

	const readDir = (id: string): DiskDirectory => {
		const dir = findDir(id);
		const columns = [
			{ label: "", cls: "w-4 text-amber-400" },
			{ label: "Name", cls: "font-mono text-gray-100" },
			{ label: "Type", cls: "w-10 font-mono" },
			{ label: "Aux", cls: "w-14 font-mono text-gray-400" },
			{ label: "Storage", cls: "w-20 text-gray-400" },
			{ label: "Blocks", cls: "w-12 text-right tabular-nums" },
			{ label: "EOF", cls: "w-16 text-right tabular-nums" },
			{ label: "Modified", cls: "w-28 text-gray-400 tabular-nums whitespace-nowrap" },
			{ label: "Key", cls: "w-12 text-right tabular-nums text-gray-500" },
		];
		if (!dir)
			return { title: id, where: { label: "", links: [] }, error: "No such directory", columns, entries: [] };
		return {
			title: id,
			where: { label: `${dir.entries.length} entries · blocks`, links: dir.blocks.map(blockLink) },
			error: dir.error,
			columns,
			entries: dir.entries.map((entry) => ({
				id: `${id}/${entry.name}`,
				isDir: isDirectory(entry),
				name: entry.name,
				type: fileTypeName(entry.fileType),
				title: `${fileTypeName(entry.fileType)} · ${entry.eof.toLocaleString()} bytes`,
				locked: (entry.access & 0xc2) !== 0xc2,
				cells: [
					(entry.access & 0xc2) !== 0xc2 ? "*" : "",
					`${entry.name}${isDirectory(entry) ? "/" : ""}`,
					fileTypeName(entry.fileType),
					`$${toHex(entry.auxType, 4)}`,
					STORAGE_TYPES[entry.storageType] ?? String(entry.storageType),
					String(entry.blocksUsed),
					entry.eof.toLocaleString(),
					entry.modified ?? "-",
					String(entry.keyPointer),
				],
			})),
		};
	};

	const readFile = (id: string): DiskFile | null => {
		const e = findEntry(id);
		if (!e || isDirectory(e)) return null;
		const c = readProdosFile(image, e);
		const groups: DiskFile["groups"] = [
			{ label: "Index", kind: "index", items: c.indexBlocks.map(blockLink) },
			{ label: "Data", kind: "data", items: c.dataBlocks.map(blockLink) },
		];
		if (c.resourceBlocks)
			groups.push({ label: "Resource fork", kind: "index", items: c.resourceBlocks.map(blockLink) });
		// BIN and SYS: the aux type is the load address
		const loadAddress = e.fileType === 0x06 ? e.auxType : e.fileType === 0xff ? 0x2000 : null;
		return {
			name: id,
			typeLabel: `${fileTypeName(e.fileType)} · ${STORAGE_TYPES[e.storageType] ?? e.storageType}`,
			locked: (e.access & 0xc2) !== 0xc2,
			deleted: false,
			fields: [
				["Aux", `$${toHex(e.auxType, 4)}`],
				["EOF", `$${toHex(e.eof, 4)} (${e.eof})`],
				["Blocks", String(e.blocksUsed)],
				["Key", String(e.keyPointer)],
				["Access", `$${toHex(e.access)}`],
				["Created", e.created ?? "-"],
				["Modified", e.modified ?? "-"],
			],
			error: c.error,
			data: c.data,
			loaded: loadAddress !== null ? { address: loadAddress, bytes: c.data } : null,
			groups: groups.filter((g) => g.items.length),
		};
	};

	const readVolume = (): DiskVolume => {
		const bitmap = readBitmap(image, volume);
		const total = volume.totalBlocks ?? 0;
		return {
			title: `Volume /${volume.name}`,
			titleLink: { label: `block ${volume.keyBlock}`, view: { kind: "block", block: volume.keyBlock } },
			fields: [
				{ label: "Created", value: volume.created ?? "-" },
				{ label: "Files", value: `${volume.fileCount} in the volume directory` },
				{ label: "Blocks", value: `${total} (${(total / 2).toFixed(0)} KB)` },
				{
					label: "Bitmap",
					links: (bitmap?.blocks ?? []).map((b) => ({
						label: `block ${b}`,
						view: { kind: "block", block: b },
					})),
				},
				{
					label: "Free",
					value: bitmap
						? `${bitmap.freeBlocks} blocks (${(bitmap.freeBlocks / 2).toFixed(1)} KB)`
						: "no bitmap",
				},
			],
			// A 5.25" floppy: a row a track (8 blocks) is too narrow, 2 tracks a row
			map: bitmap
				? {
						kind: "blocks",
						count: bitmap.free.length,
						columns: bitmap.free.length <= 280 ? 16 : 32,
						free: (block) => bitmap.free[block] ?? false,
					}
				: null,
		};
	};

	return {
		root: { id: rootId, label: rootId },
		volume: { label: "Volume · block map", read: readVolume },
		home: { kind: "dir", id: rootId } as DiskEditorView,
		readDir,
		readFile,
		ownerOfBlock,
		ownerOfSector: (track: number, sector: number) => ownerOfBlock(image.sectorBlock(track, sector).block),
	};
}

const BADGES: Record<DiskAnalysis["format"], OpenedDisk["badge"]> = {
	dos33: { label: "DOS 3.3", tone: "green" },
	prodos: { label: "ProDOS", tone: "blue" },
	unknown: { label: "Unknown format", tone: "gray" },
};

export const apple2Format: DiskFormat = {
	id: "apple2",
	name: "Apple II",
	open(file, name, reading) {
		const order = reading === "dos" || reading === "prodos" ? reading : undefined;
		const disk = analyzeDisk(file, name, order);
		const { image } = disk;
		const layout = layoutOf(image);

		const fileSystem = disk.dos33
			? dos33(image, disk.dos33, layout)
			: disk.prodos
				? prodos(image, disk.prodos)
				: null;

		const raw = {
			home: (image.hasTracks
				? { kind: "sector", track: 0, sector: 0 }
				: { kind: "block", block: 0 }) as DiskEditorView,
			readDir: (id: string): DiskDirectory => ({
				title: id,
				where: { label: "", links: [] },
				error: "No file system",
				columns: [],
				entries: [],
			}),
			readFile: () => null,
			ownerOfSector: () => undefined,
			ownerOfBlock: () => undefined,
		};

		return {
			badge: BADGES[disk.format],
			size: image.hasTracks
				? "35 tracks x 16 sectors · 280 blocks"
				: `${image.blockCount.toLocaleString()} blocks (${(image.data.length / 1024).toLocaleString()} KB)`,
			warnings: disk.warnings,
			reading: image.hasTracks
				? {
						title: "Sector order of the image: .dsk / .do are usually DOS order, .po ProDOS order",
						autoLabel: order ? "Auto" : `Auto: ${orderName(image.order)} (${disk.orderSource})`,
						choices: [
							{ value: "dos", label: "DOS order (.do)" },
							{ value: "prodos", label: "ProDOS order (.po)" },
						],
					}
				: undefined,
			charset: "apple",
			layout,
			...(fileSystem ?? raw),
			/** Track 0 sector 0 / block 0: the boot code, loaded at $0800 (its first byte: how many sectors to load) */
			bootCode: (v) =>
				(v.kind === "sector" && v.track === 0 && v.sector === 0) || (v.kind === "block" && v.block === 0)
					? { base: 0x800, skip: 1 }
					: null,
		};
	},
};
