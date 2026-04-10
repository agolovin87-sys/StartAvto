import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** HTTPS в dev: микрофон (getUserMedia) в Safari/Chrome не работает по http://IP в LAN. */
export default defineConfig({
  plugins: [react(), basicSsl()],
  /** Явно тянем firebase в pre-bundle, чтобы не залипала старая версия в node_modules/.vite/deps. */
  optimizeDeps: {
    include: [
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "firebase/storage",
    ],
  },
  server: {
    host: true,
  },
  /** Preview production build: HTTPS (самоподписанный), как dev — для микрофона и тестов по LAN. */
  preview: {
    host: true,
    port: 4173,
    https: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
