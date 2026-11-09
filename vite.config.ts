import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    allowedHosts: ["localhost", "127.0.0.1"],
  },
  preview: { host: "127.0.0.1", port: 3000, strictPort: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes("/node_modules/lightweight-charts/")
            ? "chart"
            : id.includes("/node_modules/react/") ||
                id.includes("/node_modules/react-dom/") ||
                id.includes("/node_modules/react-router")
              ? "react-vendor"
              : undefined,
      },
    },
  },
});
