import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// L'API FastAPI tourne sur 127.0.0.1:8000 : on la proxifie sous /api (pas de CORS à gérer).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true, timeout: 0, proxyTimeout: 0 },
    },
  },
  preview: {
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
