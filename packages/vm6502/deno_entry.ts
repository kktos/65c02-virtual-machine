/// <reference lib="deno.ns" />
import { serveDir } from "@std/http/file-server";

Deno.serve((req) => {
	return serveDir(req, {
		fsRoot: "./dist",
		enableCors: true,
		// headers: ["Cross-Origin-Opener-Policy: same-origin", "Cross-Origin-Embedder-Policy: require-corp"],
	});
});
