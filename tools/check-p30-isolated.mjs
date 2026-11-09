/** Compiled disabled entry and immutable mapping only. Static test server, never API8791/browser5174. */
import { build } from "vite";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
const root = process.cwd(),
  evidence = resolve("artifacts/p30-isolated-adapter"),
  out = resolve(evidence, "browser-build");
let identityChunk,
  modules = [];
await build({
  configFile: resolve("vite.config.ts"),
  plugins: [
    {
      name: "isolated-evidence",
      generateBundle(_, outputs) {
        for (const x of Object.values(outputs)) {
          if (x.type === "chunk") {
            modules.push(...Object.keys(x.modules));
            if (
              x.facadeModuleId === resolve("src/purchase/isolated/identity.ts")
            )
              identityChunk = x.fileName;
          }
        }
      },
    },
  ],
  build: {
    outDir: out,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        isolated: resolve("p30-isolated.html"),
        identity: resolve("src/purchase/isolated/identity.ts"),
      },
      preserveEntrySignatures: "strict",
    },
  },
});
if (
  !identityChunk ||
  modules.some(
    (m) =>
      m.includes("/node_modules/@setl8/p30-sdk/") ||
      m.endsWith("/purchase/prepareUnsigned.ts"),
  )
)
  throw Error("Unexpected unsigned/SDK runtime in isolated entry");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const p = resolve(out, "." + new URL(req.url, "http://127.0.0.1").pathname);
    if (!p.startsWith(out + sep) || !(await stat(p)).isFile()) throw Error();
    res.setHeader(
      "Content-Type",
      types[extname(p)] || "application/octet-stream",
    );
    res.end(await readFile(p));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((done, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", done);
});
const base = "http://127.0.0.1:" + server.address().port,
  browser = await chromium.launch(),
  results = [];
try {
  await mkdir(resolve(evidence, "screenshots"), { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const page = await context.newPage(),
      requests = [],
      errors = [];
    page.on("request", (r) => {
      if (
        ["fetch", "xhr", "websocket"].includes(r.resourceType()) ||
        !r.url().startsWith(base + "/")
      )
        requests.push(r.url());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) =>
      r
        .request()
        .url()
        .startsWith(base + "/")
        ? r.continue()
        : r.abort(),
    );
    await page.goto(base + "/p30-isolated.html");
    await page
      .getByRole("heading", { name: "Account connection is not enabled." })
      .waitFor();
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    if (audit.violations.length) throw Error(JSON.stringify(audit.violations));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    if (overflow) throw Error("Overflow " + name);
    await page.screenshot({
      path: resolve(evidence, "screenshots/disabled-" + name + ".png"),
      fullPage: true,
    });
    const compiled = await page.evaluate(
      async ({ path, service, prepared }) => {
        const m = await import(path);
        await m.verifyDescriptorBytes();
        m.assertReleaseMapping(service);
        m.assertPreparedRelease(service, prepared);
        let refused = 0;
        for (const x of [
          { ...service, sdk_artifact_sha256: prepared.npm_sha256 },
          { ...service, sdk_profile: "wrong" },
        ]) {
          try {
            m.assertReleaseMapping(x);
          } catch {
            refused++;
          }
        }
        return {
          descriptorHashChecked: true,
          completeMappingChecked: true,
          wrongMappingsRefused: refused,
        };
      },
      {
        path: "/" + identityChunk,
        service: {
          sdk_release: "0.1.0-dev.5",
          sdk_profile: "p30-devnet-2026-10-31-v1",
          sdk_artifact_sha256:
            "b95cd2ccc6351c393e98db4acd069df7df23ee027e155d85b04c5559fec4e84f",
          compatibility: "approved_for_purchase_reads",
        },
        prepared: JSON.parse(
          await readFile(
            resolve(root, "src/purchase/p30-artifact.json"),
            "utf8",
          ),
        ),
      },
    );
    if (compiled.wrongMappingsRefused !== 2 || requests.length || errors.length)
      throw Error(JSON.stringify({ compiled, requests, errors }));
    if (name === "phone") {
      await page.setViewportSize({ width: 320, height: 844 });
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )
      )
        throw Error("320px overflow");
    }
    results.push({
      name,
      viewport: { width, height },
      accessibilityViolations: 0,
      overflow: false,
      serviceRequests: requests,
      pageErrors: errors,
      ...compiled,
    });
    await context.close();
  }
  await writeFile(
    resolve(evidence, "browser-results.json"),
    JSON.stringify(
      {
        purpose:
          "compiled disabled entry and mapping, not actual service integration",
        realServiceUsed: false,
        staticOrigin: base,
        results,
        unsignedRuntimeBundled: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Two compiled disabled-entry/mapping checks passed; no API or wallet operations.",
  );
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
