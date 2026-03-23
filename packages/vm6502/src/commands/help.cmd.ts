import { defineCommand, isParamListItemIdentifier } from "@/composables/useCommands";
import type { Command, CommandDef } from "@/types/command";
import { COMMANDDEF_LIST } from ".";

function typedKeys<T extends object>(obj: T): (keyof T)[] {
	return Object.keys(obj) as (keyof T)[];
}

export const cmdHelp = defineCommand({
	description:
		"Lists all available commands.\n" +
		"Can search for a command (HELP search).\n" +
		"Can be filtered by group name (HELP --group cons).",
	paramDef: ["name?|string?"],
	options: [{ name: "group" }] as const,
	group: "Console",
	fn: ({ params, opts }) => {
		const groups: Record<string, { key: string; cmd: Command | CommandDef; aliases: string[] }[]> = {};
		const commandAliases: Record<string, string[]> = {};

		let groupFilter: string | undefined;
		let cmdFilter: string | undefined;
		let output = "";

		const parm = (
			isParamListItemIdentifier(params[0]) ? params[0].text : ((params[0] ?? "") as string)
		).toUpperCase();

		if (opts.group) {
			groupFilter = parm;
		} else cmdFilter = parm;

		// First pass: find all aliases and the commands they refer to.
		typedKeys(COMMANDDEF_LIST).forEach((key) => {
			const cmdOrAlias = COMMANDDEF_LIST[key];
			if (typeof cmdOrAlias === "string") {
				if (!commandAliases[cmdOrAlias]) commandAliases[cmdOrAlias] = [];
				commandAliases[cmdOrAlias]!.push(key);
			}
		});

		typedKeys(COMMANDDEF_LIST)
			.sort()
			.forEach((key) => {
				const cmd = COMMANDDEF_LIST[key];
				// Skip aliases, they will be handled with their main command.
				if (typeof cmd === "string") return;

				const groupName = cmd.group ?? "General";
				if (!groups[groupName]) groups[groupName] = [];

				// Sort aliases alphabetically
				const aliases = commandAliases[key]?.sort() || [];
				groups[groupName]!.push({ key, cmd, aliases });
			});

		let sortedGroupNames = Object.keys(groups).sort();
		if (groupFilter)
			sortedGroupNames = sortedGroupNames.filter((name) => name.toUpperCase().startsWith(groupFilter));

		for (const groupName of sortedGroupNames) {
			let commandsInGroup = groups[groupName]!;
			commandsInGroup.sort((a, b) => a.key.localeCompare(b.key));
			if (cmdFilter)
				commandsInGroup = commandsInGroup.filter((cmd) => cmd.key.toUpperCase().startsWith(cmdFilter));

			if (commandsInGroup.length === 0) continue;

			output += `\n## ${groupName}\n\n| Command(s) | Parameters | Description |\n|---|---|---|\n`;
			const commandHelp = commandsInGroup
				.map(({ key, cmd, aliases }) => {
					const allNames = [key, ...aliases].sort().join(", ");
					const params = ("params" in cmd ? cmd.params : cmd.paramDef) as string[];
					const allParams = params?.map((p) => `${p.replaceAll("|", "\\|")}`).join(" ") || "";
					const description = cmd.description?.replaceAll("|", "\\|").replace(/\n/g, "<br/>") || "";
					return `| ${allNames} | ${allParams} | ${description} |`;
				})
				.join("\n");
			output += commandHelp;
		}

		return { content: output, format: "markdown" };
	},
});
