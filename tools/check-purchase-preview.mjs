import { build } from "vite";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { spawn } from "node:child_process";
const root = process.cwd();
const evidence = resolve(
  process.env.SETL8_PURCHASE_EVIDENCE_DIR ||
    "artifacts/purchase-consumer-correction",
);
const out = resolve(evidence, "preview-build");
await build({
  configFile: resolve(root, "vite.config.ts"),
  build: {
    outDir: out,
    emptyOutDir: true,
    rollupOptions: { input: resolve(root, "purchase-preview.html") },
  },
});
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  try {
    const path = resolve(
      out,
      "." + new URL(req.url, "http://127.0.0.1").pathname,
    );
    if (!path.startsWith(out + sep) || !(await stat(path)).isFile())
      throw Error("missing");
    res.setHeader(
      "Content-Type",
      types[extname(path)] || "application/octet-stream",
    );
    res.end(await readFile(path));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((done, reject) => {
  server.once("error", reject);
  server.listen(5175, "127.0.0.1", done);
});
try {
  const code = await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [
        resolve(root, "node_modules/@playwright/test/cli.js"),
        "test",
        "--config",
        "playwright.purchase.config.ts",
      ],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          SETL8_EVIDENCE_DIR: resolve(evidence, "compiled-browser"),
        },
      },
    );
    child.once("error", reject);
    child.once("exit", done);
  });
  if (code !== 0) process.exitCode = code || 1;
} finally {
  await new Promise((done) => server.close(done));
}
