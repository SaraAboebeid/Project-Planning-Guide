import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";

// Absolute path to the standalone map HTML (lives outside the frontend folder)
const MAP_FILE = path.resolve(__dirname, "../assets/gothenburg_3d.html");

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
