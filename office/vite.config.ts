import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  root: ".",
  base: "/office/",
  resolve: {
    alias: {
      // Allow frontend to import shared types from the backend src/types directory.
      // Usage in frontend: import type { Task } from "@shared/task"
      "@shared": resolve(__dirname, "../src/types"),
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../dist-office",
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: ["white.local"],
    proxy: {
      "/api": "http://white.local:3456",
      "/ws": { target: "ws://white.local:3456", ws: true },
    },
  },
});
