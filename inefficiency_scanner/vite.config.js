import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4180,
    strictPort: true,
    proxy: {
      "/api/gamma": {
        target: "https://gamma-api.polymarket.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/gamma/, ""),
      },
      "/api/clob": {
        target: "https://clob.polymarket.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/clob/, ""),
      },
    },
  },
});
