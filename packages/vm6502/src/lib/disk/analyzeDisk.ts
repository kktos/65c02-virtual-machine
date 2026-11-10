// What a disk image is: its sector order (from the .2mg header, from what is found on it, or from its extension)
// and its file system (DOS 3.3, ProDOS, or none: a custom DOS / a game, raw tracks and sectors only).

import { DiskImage, FLOPPY_SIZE, parse2mgHeader, type Header2mg, type SectorOrder } from "./diskImage";
import { type Dos33Catalog, readCatalog, readVtoc } from "./dos33";
import { isProdosVolume, type ProdosDirectory, readDirectory } from "./prodos";

export type DiskFormat = "dos33" | "prodos" | "unknown";

export type DiskAnalysis = {
	image: DiskImage;
	format: DiskFormat;
	/** Where the sector order comes from */
	orderSource: "2mg header" | "detected" | "extension" | "forced";
	header2mg: Header2mg | null;
	dos33?: Dos33Catalog;
	prodos?: ProdosDirectory;
	/** The image size isn't a whole number of blocks / a floppy, or other oddities */
	warnings: string[];
};

const extension = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

/** The order the file name says: .po / .hdv / .2mg are ProDOS order, .dsk / .do DOS order. */
export const orderFromExtension = (name: string): SectorOrder =>
	["dsk", "do"].includes(extension(name)) ? "dos" : "prodos";

const detect = (image: DiskImage): DiskFormat => {
	if (readVtoc(image)) return "dos33";
	if (isProdosVolume(image)) return "prodos";
	return "unknown";
};

export function analyzeDisk(file: Uint8Array, name: string, forcedOrder?: SectorOrder): DiskAnalysis {
	const warnings: string[] = [];
	const header2mg = extension(name) === "2mg" || file.length % 256 !== 0 ? parse2mgHeader(file) : null;
	let data = file;
	if (header2mg) {
		data = file.subarray(header2mg.dataOffset, header2mg.dataOffset + header2mg.dataLength);
		if (header2mg.format === 2) warnings.push("Nibble image (.2mg format 2): shown as raw bytes");
	}
	if (data.length !== FLOPPY_SIZE && data.length % 512 !== 0)
		warnings.push(`${data.length} bytes: not a whole number of blocks`);

	let order: SectorOrder;
	let orderSource: DiskAnalysis["orderSource"];
	let format: DiskFormat;

	if (forcedOrder) {
		order = forcedOrder;
		orderSource = "forced";
		format = detect(new DiskImage(data, order));
	} else if (data.length !== FLOPPY_SIZE) {
		// Not a floppy: blocks only, nothing to reorder
		order = "prodos";
		orderSource = header2mg ? "2mg header" : "extension";
		format = detect(new DiskImage(data, order));
	} else if (header2mg && header2mg.format < 2) {
		order = header2mg.format === 0 ? "dos" : "prodos";
		orderSource = "2mg header";
		format = detect(new DiskImage(data, order));
	} else {
		// A floppy: the order a file system is found in, the extension's first (a .dsk is often ProDOS-ordered)
		const preferred = orderFromExtension(name);
		const other: SectorOrder = preferred === "dos" ? "prodos" : "dos";
		order = preferred;
		orderSource = "extension";
		format = detect(new DiskImage(data, preferred));
		if (format === "unknown") {
			const otherFormat = detect(new DiskImage(data, other));
			if (otherFormat !== "unknown") {
				order = other;
				format = otherFormat;
			}
		}
		if (format !== "unknown") orderSource = "detected";
	}

	const image = new DiskImage(data, order);
	const analysis: DiskAnalysis = { image, format, orderSource, header2mg, warnings };
	if (format === "dos33") {
		const vtoc = readVtoc(image);
		if (vtoc) analysis.dos33 = readCatalog(image, vtoc);
	} else if (format === "prodos") analysis.prodos = readDirectory(image);
	return analysis;
}
