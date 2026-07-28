import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Proxy API calls to the backend gateway so the browser hits same-origin.
    proxy: {
      "/api": { target: process.env.VITE_API_URL ?? "http://localhost:4000", changeOrigin: true },
    },
  },
});
