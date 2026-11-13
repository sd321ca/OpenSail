import path from "node:path";
import { defineConfig } from "vite";

/**
 * The dashboard is served by the FastAPI app from ``web/``. Vite only builds
 * the client bundle: sources live in ``web/src`` and the output keeps the
 * stable ``/assets/app.js`` URL that ``web/index.html`` already references, so
 * neither ``index.html`` nor ``comfyui_ui/server.py`` needs to change.
 */
const projectRoot = process.cwd();
const webRoot = path.join(projectRoot, "web");
const backend = "http://127.0.0.1:7860";

export default defineConfig({
  root: webRoot,
  publicDir: false,
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/free": backend,
      "/history": backend,
      "/favicon.ico": backend,
    },
  },
  plugins: [
    {
      // In dev, ``web/index.html`` still points at the built bundle. Rewrite it
      // to the TypeScript entry so the dev server compiles straight from source.
      name: "opensail-dev-entry",
      apply: "serve",
      transformIndexHtml: (html) =>
        html.replace('src="/assets/app.js"', 'src="/src/app.ts"'),
    },
  ],
  build: {
    outDir: path.join(webRoot, "assets"),
    emptyOutDir: false,
    target: "es2022",
    minify: "oxc",
    sourcemap: true,
    rollupOptions: {
      input: path.join(webRoot, "src", "app.ts"),
      output: {
        entryFileNames: "app.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "media/[name]-[hash][extname]",
      },
    },
  },
});
