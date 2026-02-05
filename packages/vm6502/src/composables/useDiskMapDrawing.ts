export function useDiskMapDrawing() {
	// Constants for map visualization
	const FLOPPY_SIZE_LIMIT = 3200 * 512; // ~1.6MB
	const FLOPPY_COLS = 40;
	const FLOPPY_BLOCK_SIZE = 8;
	const HD_COLS = 256;
	const HD_BLOCK_SIZE = 1;
	const COLOR_BG = "#1f2937"; // gray-800
	const COLOR_READ = "#34d399"; // emerald-400

	const drawMap = (canvas: HTMLCanvasElement | null, fileSize: number, logs: { block: number }[]) => {
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		if (fileSize <= 0) {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			return;
		}

		const totalBlocks = Math.ceil(fileSize / 512);

		// Auto-scale grid based on disk size
		let cols = HD_COLS;
		let blockSize = HD_BLOCK_SIZE;

		if (fileSize <= FLOPPY_SIZE_LIMIT) {
			cols = FLOPPY_COLS;
			blockSize = FLOPPY_BLOCK_SIZE;
		}

		canvas.width = cols * blockSize;
		const rows = Math.ceil(totalBlocks / cols);
		canvas.height = rows * blockSize;

		ctx.fillStyle = COLOR_BG;
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		ctx.fillStyle = COLOR_READ;
		const uniqueBlocks = new Set(logs.map((l) => l.block));
		const gap = blockSize > 2 ? 1 : 0;

		uniqueBlocks.forEach((block) => {
			const r = Math.floor(block / cols);
			const c = block % cols;
			ctx.fillRect(c * blockSize, r * blockSize, blockSize - gap, blockSize - gap);
		});
	};

	return {
		drawMap,
	};
}
