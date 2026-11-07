import { defineCommand } from "@/composables/useCommands";
import { useFormatting } from "@/composables/useDataFormattings";
import { useNotes } from "@/composables/useNotes";
import { useSymbols } from "@/composables/useSymbols";
import { importLegacyMetadata, LEGACY_DB_NAME } from "@/lib/legacyMetadataImport";

export const importLegacyCmd = defineCommand({
	description:
		`Copy the symbols, data formattings and notes saved by previous versions of the app (${LEGACY_DB_NAME}), ` +
		"for all machines and disks. The old data is only read, never modified. Existing entries are kept.",
	paramDef: [],
	group: "Symbols",
	fn: async () => {
		const report = await importLegacyMetadata();
		if (!report.found) return `No legacy data found (${LEGACY_DB_NAME}).`;

		await Promise.all([useSymbols().reloadSymbols(), useFormatting().reloadFormats(), useNotes().reloadNotes()]);

		const { symbols, formats, notes } = report.added;
		const skipped = report.skipped ? `, ${report.skipped} skipped (already present)` : "";
		return (
			`Imported ${symbols} symbols, ${formats} formattings, ${notes} notes` +
			` from ${report.disks} disk entries of ${report.machines.join(", ")}${skipped}.`
		);
	},
});
