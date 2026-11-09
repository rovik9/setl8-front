import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "p30-read-only-entry",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = new URL(req.url || "/", "http://127.0.0.1:5174")
            .pathname;
          if (req.headers.host !== "127.0.0.1:5174") {
            res.writeHead(403);
            res.end("Wrong frontend profile");
            return;
          }
          if (path === "/") {
            res.writeHead(302, { Location: "/p30-live.html" });
            res.end();
            return;
          }
          if (
            (req.headers.accept?.includes("text/html") ||
              path.endsWith(".html")) &&
            !["/p30-live.html", "/p30-app.html"].includes(path)
          ) {
            res.writeHead(404);
            res.end("Unavailable in read-only profile");
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    origin: "http://127.0.0.1:5174",
    cors: false,
  },
  build: {
    target: "es2022",
    outDir: "artifacts/p30-readonly-live/app-build",
    rollupOptions: { input: ["p30-live.html", "p30-app.html"] },
  },
});
