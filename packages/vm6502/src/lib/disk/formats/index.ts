// The disk formats the editor reads, by the id a machine's config names them with (`disk.formats`).

import type { DiskFormat } from "../diskFormat.type";
import { apple2Format } from "./apple2/apple2.format";
import { cbmFormat } from "./cbm/cbm.format";

export const DISK_FORMATS: Record<string, DiskFormat> = {
	[apple2Format.id]: apple2Format,
	[cbmFormat.id]: cbmFormat,
};
