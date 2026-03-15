import { ref } from "vue";

export function useTableSort<T extends string>(defaultKey: T, defaultDirection: "asc" | "desc" = "asc") {
	const sortKey = ref<T>(defaultKey);
	const sortDirection = ref<"asc" | "desc">(defaultDirection);

	const handleSort = (key: T) => {
		if (sortKey.value === key) {
			sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
		} else {
			sortKey.value = key;
			sortDirection.value = "asc";
		}
	};

	const compare = (a: string | number, b: string | number) => {
		const modifier = sortDirection.value === "asc" ? 1 : -1;
		if (a > b) return modifier;
		if (a < b) return -modifier;
		return 0;
	};

	const resolveAndCompare = <U>(a: U, b: U, resolver: (item: U, key: T) => string | number) => {
		const valA = resolver(a, sortKey.value);
		const valB = resolver(b, sortKey.value);
		return compare(valA, valB);
	};

	return {
		sortKey,
		sortDirection,
		handleSort,
		compare,
		resolveAndCompare,
	};
}
