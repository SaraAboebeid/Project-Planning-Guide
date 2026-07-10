import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";

// Resolve from frontend/ working directory to avoid stale temp-bundle __dirname paths.
const PROJECT_ROOT = path.resolve(process.cwd(), "..");
const MAP_FILE = path.join(PROJECT_ROOT, "assets", "gothenburg_3d.html");
const MAP_CSS = path.join(PROJECT_ROOT, "assets", "gothenburg_3d.css");
const SIDEBAR_CSS = path.join(PROJECT_ROOT, "assets", "sidebar-theme.css");
const MAP_META_JS = path.join(PROJECT_ROOT, "assets", "gothenburg_3d.meta.js");
const BUILDINGS_JSON = path.join(PROJECT_ROOT, "assets", "buildings.json");
const VIEWER_JS_ROOT = path.join(PROJECT_ROOT, "assets", "viewer", "js");

function serveStaticFile(filePath: string, contentType: string) {
  return (_req: any, res: any) => {
    if (!fs.existsSync(filePath)) {
      res.statusCode = 404;
      res.end(`${path.basename(filePath)} not found`);
      return;
    }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache");
    fs.createReadStream(filePath).pipe(res);
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Custom middleware: stream the large map file directly from disk
    {
      name: "serve-map",
      configureServer(server) {
        server.middlewares.use("/gothenburg_3d.html", (_req, res) => {
          if (!fs.existsSync(MAP_FILE)) {
            res.statusCode = 404;
            res.end("Map file not found");
            return;
          }
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          fs.createReadStream(MAP_FILE).pipe(res);
        });
        // Serve sidebar theme CSS alongside the map — edit assets/sidebar-theme.css directly
        server.middlewares.use("/sidebar-theme.css", (_req, res) => {
          if (!fs.existsSync(SIDEBAR_CSS)) {
            res.statusCode = 404;
            res.end("sidebar-theme.css not found");
            return;
          }
          res.setHeader("Content-Type", "text/css; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          fs.createReadStream(SIDEBAR_CSS).pipe(res);
        });
        server.middlewares.use("/gothenburg_3d.css", serveStaticFile(MAP_CSS, "text/css; charset=utf-8"));
        server.middlewares.use("/gothenburg_3d.meta.js", serveStaticFile(MAP_META_JS, "text/javascript; charset=utf-8"));
        server.middlewares.use("/buildings.json", serveStaticFile(BUILDINGS_JSON, "application/json; charset=utf-8"));
        server.middlewares.use("/viewer/js", (_req, res, next) => {
          const requestPath = (_req.url || "").split("?")[0].replace(/^\/+/, "");
          const relativePath = requestPath.replace(/^viewer\/js\//, "").replace(/^viewer\/js$/, "");
          const filePath = path.join(VIEWER_JS_ROOT, relativePath || "index.js");
          if (!filePath.startsWith(VIEWER_JS_ROOT) || !fs.existsSync(filePath)) {
            next();
            return;
          }
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          fs.createReadStream(filePath).pipe(res);
        });
      },
    },
  ],
  server: {
    port: 5173,
    fs: { strict: false },
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
