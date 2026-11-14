// The disk formats, by the id a machine's config names them with (`disk.formats`): what its drive takes and the
// editor reads.

import type { DiskFormat } from "../diskFormat.type";
import { apple2Format } from "./apple2/apple2.format";
import { cbmFormat } from "./cbm/cbm.format";

export const DISK_FORMATS: Record<string, DiskFormat> = {
	[apple2Format.id]: apple2Format,
	[cbmFormat.id]: cbmFormat,
};

/** The image files of the formats (".po"…), in their order; an unknown id has none. */
export const formatExtensions = (ids: readonly string[]) => [
	...new Set(ids.flatMap((id) => DISK_FORMATS[id]?.extensions ?? [])),
];
