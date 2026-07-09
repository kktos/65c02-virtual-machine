import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
// import { createRequire } from "node:module";

// const require = createRequire(import.meta.url);

// https://vite.dev/config/
export default defineConfig({
	assetsInclude: ["**/*.woff", "**/*.woff2", "**/*.ttf", "**/*.otf"],
	plugins: [
		vue({
			// script: {
			// 	fs: require("node:fs"),
			// },
		}),
		tailwindcss(),
	],
	worker: {
		format: "es",
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
	},
});
