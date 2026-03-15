import { computed, ref, watch, type Ref } from "vue";

export function usePagination<T>(items: Ref<T[]>, itemsPerPage: Ref<number> | (() => number)) {
	const currentPage = ref(1);

	const _itemsPerPage = computed(() => {
		return typeof itemsPerPage === "function" ? itemsPerPage() : itemsPerPage.value;
	});

	const totalPages = computed(() => {
		const ipp = _itemsPerPage.value;
		if (ipp <= 0) return 1;
		return Math.ceil((items.value?.length || 0) / ipp);
	});

	watch(totalPages, (newTotal) => {
		if (currentPage.value > newTotal) {
			currentPage.value = Math.max(1, newTotal);
		}
	});

	const paginatedItems = computed(() => {
		const ipp = _itemsPerPage.value;
		if (ipp <= 0) return items.value;
		const start = (currentPage.value - 1) * ipp;
		const end = start + ipp;
		return items.value.slice(start, end);
	});

	const nextPage = () => {
		if (currentPage.value < totalPages.value) {
			currentPage.value++;
		}
	};

	const prevPage = () => {
		if (currentPage.value > 1) {
			currentPage.value--;
		}
	};

	return {
		currentPage,
		totalPages,
		paginatedItems,
		nextPage,
		prevPage,
	};
}
