import { toast } from "vue-sonner";
import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import type { CommandContext } from "@/types/command";

/** The toasts on screen: the BRK ones stay until closed. */
const activeToasts = () => toast.getToasts().filter((t) => !("dismiss" in t && t.dismiss));

const describeToast = (t: ReturnType<typeof activeToasts>[number]) => {
	const title = "title" in t && typeof t.title === "string" ? t.title : "(no text)";
	const type = "type" in t && t.type && t.type !== "default" ? `[${t.type}] ` : "";
	return `${type}${title}`;
};

export const toastsCmd = defineCommand({
	description:
		"Notifications (toasts) on screen: no argument lists them, `clear` closes them all (a BRK's stays until closed).",
	paramDef: ["name?"],
	paramHelp: "[clear]",
	group: "Console",
	fn: ({ params }: CommandContext) => {
		const arg = params[0];
		const toasts = activeToasts();
		if (arg !== undefined) {
			if (!isParamListItemIdentifier(arg) || arg.text.toUpperCase() !== "CLEAR")
				throw new Error("Expected `clear`.");
			// By id: `dismiss()` without one closes them on screen but leaves them listed until the Toaster's next pass
			for (const t of toasts) toast.dismiss(t.id);
			return toasts.length ? `${toasts.length} toast(s) cleared.` : "No toasts.";
		}
		return toasts.length ? toasts.map(describeToast).join("\n") : "No toasts.";
	},
});
