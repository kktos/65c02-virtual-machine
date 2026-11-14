// Track / sector helpers on a disk's raw layout (`DiskLayout`): a sector's label, a link to it, the sectors
// numbered one after the other.

import { toHex } from "@/lib/hex.utils";
import type { DiskLayout, DiskLink, TrackSector } from "./diskFormat.type";

export const tsLabel = (layout: DiskLayout, track: number, sector: number) =>
	layout.tracks?.hex ? `T${toHex(track)} S${toHex(sector, 1)}` : `T${track} S${sector}`;

export const tsLink = (layout: DiskLayout, ts: TrackSector | null): DiskLink =>
	ts
		? { label: tsLabel(layout, ts.track, ts.sector), view: { kind: "sector", ...ts } }
		: { label: "hole", view: null };

/** The sectors one after the other: track `first` sector 0 is 0 */
export function sectorIndex(layout: DiskLayout) {
	const tracks = layout.tracks;
	const starts: number[] = [];
	let count = 0;
	if (tracks)
		for (let t = 0; t < tracks.count; t++) {
			starts.push(count);
			count += tracks.sectors(tracks.first + t);
		}
	return {
		count,
		toIndex: (track: number, sector: number) => (starts[track - (tracks?.first ?? 0)] ?? 0) + sector,
		fromIndex(index: number): TrackSector {
			let t = starts.length - 1;
			while (t > 0 && (starts[t] as number) > index) t--;
			return { track: t + (tracks?.first ?? 0), sector: index - (starts[t] ?? 0) };
		},
	};
}
