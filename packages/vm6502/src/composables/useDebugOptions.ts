import { inject, type Ref, ref, watch } from "vue";
import type { DebugGroup, DebugOption } from "@/types/machine.interface";
import type { VirtualMachine } from "@/virtualmachine/virtualmachine.class";

/** The value an option has when the user hasn't touched it */
export function defaultValueOf(opt: DebugOption): unknown {
	if (opt.defaultValue !== undefined) return opt.defaultValue;
	if (opt.type === "select" && opt.options?.length) return opt.options[0]?.value;
	if (opt.type === "boolean") return false;
	return undefined;
}

/**
 * The machine's debug options for one category (memory, video...) and the user's current values.
 * Values start at their defaults, then saved values (see saveOptions) are applied on top.
 * Must be called from a component setup (it injects the vm).
 */
export function useDebugOptions(category: string) {
	const vm = inject<Ref<VirtualMachine>>("vm");
	const debugOptions = ref<DebugGroup[]>([]);
	const debugOverrides = ref<Record<string, unknown>>({});
	const defaults = ref<Record<string, unknown>>({});

	const storageKey = `debug-options-${category}`;

	/** Persists the values of the options flagged `savable` */
	const saveOptions = () => {
		const valuesToSave: Record<string, unknown> = {};
		for (const group of debugOptions.value)
			for (const row of group.rows)
				for (const opt of row)
					if (opt.savable && debugOverrides.value[opt.id] !== undefined)
						valuesToSave[opt.id] = debugOverrides.value[opt.id];
		localStorage.setItem(storageKey, JSON.stringify(valuesToSave));
	};

	const loadOptions = () => {
		const saved = localStorage.getItem(storageKey);
		if (!saved) return;
		try {
			debugOverrides.value = { ...debugOverrides.value, ...JSON.parse(saved) };
		} catch (e) {
			console.error(`Failed to load ${category} options`, e);
		}
	};

	const resetOptions = () => {
		debugOverrides.value = { ...defaults.value };
	};

	watch(
		() => vm?.value,
		async (newVm) => {
			if (!newVm) return;
			await newVm.ready;
			debugOptions.value = newVm.getDebugOptions().filter((grp) => grp.category === category);

			const values: Record<string, unknown> = {};
			for (const group of debugOptions.value)
				for (const row of group.rows) for (const opt of row) values[opt.id] = defaultValueOf(opt);
			defaults.value = values;
			debugOverrides.value = { ...values };

			loadOptions();
		},
		{ immediate: true },
	);

	return { debugOptions, debugOverrides, defaults, saveOptions, resetOptions };
}
