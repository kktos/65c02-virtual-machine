import type { VideoConfig } from "@/machines/machine.interface";
import type { Video } from "@/video/video.interface";
import type { IBus } from "../bus.interface";

// Vite-specific way to handle dynamic imports in workers.
const videoModules = import.meta.glob("../../machines/*/*.video.ts");
const BASE_PATH = "../../machines";

export async function loadVideo(videoConfig: VideoConfig, bus: IBus) {
	// const videoBufferOffset = MEMORY_OFFSET + machine.memory.size;
	// videoView = new Uint8Array(sharedBuffer, videoBufferOffset, machine.video.size);
	if (!(videoConfig.buffer instanceof SharedArrayBuffer)) {
		console.error("Worker: Did not receive a video SharedArrayBuffer.");
		return null;
	}

	const videoModuleKey = `${BASE_PATH}/${videoConfig.path}.ts`;
	const videoModuleLoader = videoModules[videoModuleKey];
	if (!videoModuleLoader) {
		console.error(`Worker: Could not find a video module loader for key: ${videoModuleKey}`);
		return null;
	}
	const VideoModule = await videoModuleLoader();
	const exportedVideoEntry = Object.entries(VideoModule as object).find(([name]) => name === videoConfig?.class);
	if (!exportedVideoEntry) {
		console.error(`Worker: Could not find class ${videoConfig.class} for module ${videoModuleKey}`);
		return null;
	}
	const [, VideoClass]: [
		string,
		new (parent: typeof self, mem: Uint8Array, width: number, height: number, bus: IBus, payload?: unknown) => Video,
	] = exportedVideoEntry;

	const videoMemory = new Uint8Array(videoConfig.buffer, 0, videoConfig.width * videoConfig.height);
	return new VideoClass(self, videoMemory, videoConfig.width, videoConfig.height, bus, videoConfig.payload);
}
