import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// Poseidon renovation planner: a separate front end on its own port. It talks
// to the SAME FastAPI backend as the main planner (/api), and serves the
// Gothenburg 3D viewer straight from ../assets (as frontend/vite.config.ts
// does). Nothing here changes the main planner.
const API = process.env.VITE_API_PROXY_TARGET || "http://localhost:8000";
// The viewer and its data layers (buildings.json, boplats_data.json, terrain…)
// live in assets/ and frontend/public/; look there for anything Poseidon's own
// app doesn't serve.
const DATA_ROOTS = [
  path.resolve(process.cwd(), "public"),   // Poseidon's own files (logo.png) win
  path.resolve(process.cwd(), "..", "assets"),
  path.resolve(process.cwd(), "..", "frontend", "public"),
];

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

function serveViewer(): Plugin {
  return {
    name: "poseidon-serve-viewer",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || "").split("?")[0]);
        const ext = path.extname(url);
        // Never shadow Poseidon's own page or Vite's module paths.
        if (url === "/" || url === "/index.html" || /^\/(@|src\/|node_modules\/)/.test(url) || !TYPES[ext]) return next();
        if (ext === ".html" && url !== "/gothenburg_3d.html") return next();
        for (const root of DATA_ROOTS) {
          const file = path.join(root, url);
          if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) {
            res.setHeader("Content-Type", TYPES[ext]);
            res.setHeader("Cache-Control", "no-cache");
            fs.createReadStream(file).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveViewer()],
  server: {
    port: 5174,
    strictPort: true,
    // Native file events were missed on this Windows setup (an edited module kept
    // being served stale while its neighbours updated). Polling is cheap for an
    // app this size and never misses a change.
    watch: { usePolling: true, interval: 400 },
    fs: { strict: false },
    proxy: {
      "/api": { target: API, changeOrigin: true },
    },
  },
});
