// What the disk editor knows of a disk, whatever its machine: a format (`DiskFormat`) opens an image into an
// `OpenedDisk`, the editor shows that. Its raw sectors / blocks (`DiskLayout`), its file system as a tree of
// directories and files named by ids the format makes up (a path, a catalog index...), what each sector holds.
// The machine's config names the formats its disks may be in (`disk.formats`); `formats/index.ts` has them all.

export type TrackSector = { track: number; sector: number };

/** Where the editor is */
export type DiskEditorView =
	| { kind: "sector"; track: number; sector: number }
	| { kind: "block"; block: number }
	/** The volume: DOS 3.3 VTOC, ProDOS volume header and bitmap, CBM BAM */
	| { kind: "volume" }
	| { kind: "dir"; id: string }
	| { kind: "file"; id: string };

/** A sector / block to go to; no view: nowhere to go (a hole in a sparse file) */
export type DiskLink = { label: string; view: DiskEditorView | null };

/** The raw image: tracks and sectors (256 bytes), blocks, or both (an Apple floppy: a block is 2 sectors). */
export type DiskLayout = {
	tracks?: {
		/** 0 on an Apple disk, 1 on a CBM one */
		first: number;
		count: number;
		sectors(track: number): number;
		/** Track / sector numbers in hex ($11 / $0F) or decimal (18 / 1) */
		hex: boolean;
		/** What a sector is: the tooltip of the T/S button */
		title: string;
	};
	blocks?: { count: number; size: number; title: string };
	readSector(track: number, sector: number): Uint8Array;
	sectorOffset(track: number, sector: number): number;
	readBlock(block: number): Uint8Array;
	blockOffset(block: number): number;
	/** Both tracks and blocks: the block a sector is half of, the sectors a block is made of */
	sectorBlock?(track: number, sector: number): { block: number; half: 0 | 1 };
	blockSectors?(block: number): TrackSector[];
};

export type DiskEntry = {
	id: string;
	isDir: boolean;
	name: string;
	/** Short, in the tree */
	type: string;
	title?: string;
	locked?: boolean;
	deleted?: boolean;
	/** Its row in the directory table, a cell a column */
	cells: string[];
};

export type DiskDirectory = {
	title: string;
	/** Where the directory is: its sectors / blocks */
	where: { label: string; links: DiskLink[] };
	error?: string;
	/** cls: of the column's cells (width, alignment, colour) */
	columns: { label: string; cls?: string }[];
	entries: DiskEntry[];
};

export type DiskFile = {
	name: string;
	typeLabel: string;
	locked: boolean;
	deleted: boolean;
	fields: [string, string][];
	error?: string;
	data: Uint8Array;
	/** A file with a load address: the bytes loaded there (the header taken out) */
	loaded: { address: number; bytes: Uint8Array } | null;
	/** Its sectors / blocks: the index ones (T/S lists, index blocks) and the data ones */
	groups: { label: string; kind: "index" | "data"; items: DiskLink[] }[];
};

/** The map of the volume: what is free, a cell a sector (tracks across, sectors down) or a block */
export type DiskMap =
	| { kind: "tracks"; free(track: number, sector: number): boolean }
	| { kind: "blocks"; count: number; columns: number; free(block: number): boolean };

export type DiskVolume = {
	title: string;
	titleLink?: DiskLink;
	fields: { label: string; value?: string; links?: DiskLink[] }[];
	map: DiskMap | null;
};

/** A choice in how the image is read (an Apple floppy's sector order): auto (null) or one of the choices */
export type DiskReading = {
	title: string;
	autoLabel: string;
	choices: { value: string; label: string }[];
};

/**
 * A file taken off a disk to go on another: its bytes (a header the file system adds taken out, as a DOS 3.3 B
 * file's address and length) and its type as ProDOS has it, the common ground of the Apple file systems: a format
 * maps its own types to it, and from it.
 */
export type DiskFileCopy = {
	/** Its name on the disk it comes from: the target makes a name of it its file system takes */
	name: string;
	data: Uint8Array;
	fileType: number;
	/** A binary's load address, a BASIC program's start... */
	auxType: number;
	locked: boolean;
};

/** What became of a file copied: the name it got, else why it wasn't */
export type DiskCopyResult = { from: string; to?: string; error?: string };

/** A disk files can be written to: where they can go, writing them (on the bytes given to `DiskFormat.open`) */
export type DiskTarget = {
	dirs(): { id: string; label: string }[];
	addFiles(dirId: string, files: DiskFileCopy[]): DiskCopyResult[];
};

/** A blank disk a format makes */
export type NewDiskKind = { id: string; label: string; extension: string };

export interface OpenedDisk {
	badge: { label: string; tone: "green" | "blue" | "amber" | "gray" };
	size: string;
	warnings: string[];
	reading?: DiskReading;
	/** How the bytes read as text in the hex dump */
	charset: "apple" | "petscii";
	layout: DiskLayout;
	/** A file system was found: the volume, the root directory */
	volume?: { label: string; read(): DiskVolume };
	root?: { id: string; label: string };
	/** Where the disk opens */
	home: DiskEditorView;
	readDir(id: string): DiskDirectory;
	readFile(id: string): DiskFile | null;
	/** What a sector / block holds: a file's name, "VTOC", "BAM"...; nothing for a free one */
	ownerOfSector(track: number, sector: number): string | undefined;
	ownerOfBlock(block: number): string | undefined;
	/** A sector / block the ROM boots from: where its code loads, and the data bytes before the code */
	bootCode?(view: DiskEditorView): { base: number; skip: number } | null;
	/** The file as it is copied to another disk; null: not one that can be (a deleted file, a directory) */
	exportFile?(id: string): DiskFileCopy | null;
	/** Files can be written to it; none: why not (a file system the format doesn't write) */
	target?: DiskTarget;
	readOnlyReason?: string;
}

export interface DiskFormat {
	id: string;
	name: string;
	/**
	 * The image files the format reads (".d64"), lower case: what a drive of the machines whose disks are in this
	 * format takes (the open dialog, the library). The code that reads them decides: one more is code, not config.
	 */
	extensions: string[];
	/** null: not an image of this format. `reading`: a value of `OpenedDisk.reading`, null for auto. */
	open(file: Uint8Array, name: string, reading: string | null): OpenedDisk | null;
	/** The blank disks it makes */
	newDisks?: NewDiskKind[];
	/** A blank disk of a kind of `newDisks`, named `volume`; `boot`: an image whose boot sectors it gets */
	create?(kind: string, volume: string, boot?: { file: Uint8Array; name: string }): Uint8Array;
	/** The volume name as `create` writes it */
	volumeName?(name: string): string;
}
