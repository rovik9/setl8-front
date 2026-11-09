/** Local unsigned consumer harness. No app route, API, wallet, RPC, signing or submission. */
import { build } from "vite";
import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { PublicKey, p30Devnet } from "@setl8/p30-sdk";
const root = resolve("artifacts/p30-unsigned"),
  base = "http://127.0.0.1:5173";
const fixtures = JSON.parse(
  await readFile("tests/fixtures/p30-synthetic.json", "utf8"),
);
const descriptor = JSON.parse(
  await readFile(
    "dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json",
    "utf8",
  ),
);
let bundle;
await build({
  configFile: false,
  plugins: [
    {
      name: "consumer-manifest",
      generateBundle(_, outputs) {
        bundle = Object.fromEntries(
          Object.entries(outputs)
            .filter(([, x]) => x.type === "chunk")
            .map(([name, x]) => [
              name,
              {
                bytes: Buffer.byteLength(x.code),
                modules: Object.keys(x.modules),
                imports: x.imports,
                dynamicImports: x.dynamicImports,
              },
            ]),
        );
      },
    },
  ],
  build: {
    target: "es2022",
    outDir: root + "/browser",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve("src/purchase/prepareUnsigned.ts"),
      preserveEntrySignatures: "strict",
      output: {
        entryFileNames: "prepare.js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
await writeFile(
  root + "/browser/harness.html",
  '<!doctype html><title>Unsigned module test only</title><script type="module">window.moduleReady=import("./prepare.js").then(m=>window.prepareUnsigned=m.prepareP30UnsignedPurchase);</script>',
);
await writeFile(
  root + "/browser-manifest.json",
  JSON.stringify(bundle, null, 2) + "\n",
);
const digest = (hex) =>
  createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
const assert = (ok, why) => {
  if (!ok) throw Error(why);
};
const browser = await chromium.launch();
try {
  const context = await browser.newContext(),
    page = await context.newPage(),
    requests = [],
    errors = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__guardedCalls = [];
    const forbidden = (name) => () => {
      window.__guardedCalls.push(name);
      throw Error("Forbidden in unsigned harness: " + name);
    };
    window.fetch = forbidden("fetch");
    window.XMLHttpRequest = class {
      constructor() {
        forbidden("XHR")();
      }
    };
    window.WebSocket = class {
      constructor() {
        forbidden("WebSocket")();
      }
    };
    for (const name of ["solana", "phantom"])
      Object.defineProperty(window, name, {
        configurable: true,
        get: forbidden("wallet " + name),
      });
    for (const name of ["localStorage", "sessionStorage"])
      Object.defineProperty(window, name, {
        configurable: true,
        get: forbidden(name),
      });
  });
  // Fulfill only our static test document, avoiding Vite's injected HMR client.
  // Compiled JS chunks are still served by the owned local preview; no API is intercepted.
  await page.route(
    base + "/artifacts/p30-unsigned/browser/harness.html",
    async (route) =>
      route.fulfill({
        contentType: "text/html",
        body: await readFile(root + "/browser/harness.html", "utf8"),
      }),
  );
  await page.goto(base + "/artifacts/p30-unsigned/browser/harness.html");
  await page.evaluate(() => window.moduleReady);
  const before = [...requests],
    lazyChunks = bundle["prepare.js"].dynamicImports;
  assert(lazyChunks.length > 0, "SDK must be a separate dynamic chunk");
  assert(
    !before.some((url) => lazyChunks.some((c) => url.endsWith("/" + c))),
    "SDK loaded before preparation",
  );
  const preGlobals = await page.evaluate(() => ({
    Buffer: typeof window.Buffer,
    process: typeof window.process,
    global: typeof window.global,
  }));
  assert(
    Object.values(preGlobals).every((v) => v === "undefined"),
    "Node globals before preparation",
  );
  const ctx = new p30Devnet.Context(descriptor),
    results = [];
  for (const v of fixtures.cases) {
    const input = {
      inputKind: "p30-public-unsigned-input-v1",
      sdkProfile: descriptor.profileId,
      descriptor,
      connectedWallet: v.trader,
      trader: v.trader,
      sessionEpoch: 7,
      expectedAccount: v.pdas.tradingAccount.address,
      nextChallengeId: v.challengeId,
      tierIndex: String(v.tierIndex),
      mint: v.mint,
      recentBlockhash: "11111111111111111111111111111111",
      priorityFee:
        v.priorityFee === null
          ? { kind: "omitted" }
          : { kind: "micro_lamports_per_cu", value: String(v.priorityFee) },
    };
    const result = await page.evaluate(
      async (input) => window.prepareUnsigned(input),
      input,
    );
    const expected = ctx.compilePurchase(
      {
        trader: new PublicKey(v.trader),
        nextChallengeId: BigInt(v.challengeId),
        tierIndex: v.tierIndex,
        mint: v.mint,
      },
      input.recentBlockhash,
      v.priorityFee === null ? undefined : BigInt(v.priorityFee),
    );
    assert(
      result.messageHex ===
        Buffer.from(expected.serializedMessage).toString("hex"),
      "Browser message bytes differ",
    );
    assert(
      result.unsignedTransactionHex ===
        Buffer.from(expected.unsignedTransaction).toString("hex"),
      "Browser packet bytes differ",
    );
    assert(
      result.messageSha256 === digest(result.messageHex),
      "Browser hash differs",
    );
    assert(
      result.context.expectedAccount === v.pdas.tradingAccount.address,
      "Browser public account differs",
    );
    assert(
      result.actions.sign === false && result.actions.submit === false,
      "Unexpected payment action",
    );
    const invalid = await page.evaluate(async (input) => {
      let errors = [];
      for (const edit of [
        { sdkProfile: "setl8-sdk-dev-v1" },
        { connectedWallet: input.expectedAccount },
        { nextChallengeId: "18446744073709551616" },
        { price: 67842.5 },
      ]) {
        try {
          await window.prepareUnsigned({ ...input, ...edit });
          errors.push("accepted");
        } catch {
          errors.push("rejected");
        }
      }
      return errors;
    }, input);
    assert(
      invalid.every((x) => x === "rejected"),
      "Browser bad context accepted",
    );
    results.push({
      challenge_id: v.challengeId,
      mint: v.mint,
      priority_fee: input.priorityFee,
      expected_account: result.context.expectedAccount,
      message_sha256: result.messageSha256,
      packet_sha256: result.unsignedTransactionSha256,
      packet_bytes: result.transactionSize,
    });
  }
  const calls = await page.evaluate(() => window.__guardedCalls),
    postGlobals = await page.evaluate(() => ({
      Buffer: typeof window.Buffer,
      process: typeof window.process,
      global: typeof window.global,
    }));
  await writeFile(
    root + "/browser-guard-observations.json",
    JSON.stringify({ calls, errors, requests }, null, 2) + "\n",
  );
  assert(calls.length === 0, "Forbidden browser call: " + calls.join(","));
  assert(
    Object.values(postGlobals).every((v) => v === "undefined"),
    "Node globals leaked",
  );
  assert(errors.length === 0, "Page errors: " + errors.join(","));
  assert(
    requests.every((url) => url.startsWith(base + "/")),
    "Unexpected external/API request",
  );
  assert(!requests.some((u) => u.includes("/v1/")), "Unexpected API route");
  const report = {
    passed: true,
    purpose:
      "synthetic unsigned browser consumer only; no admission attestation",
    cases: results,
    wrong_context_checks: fixtures.cases.length * 4,
    preGlobals,
    postGlobals,
    forbidden_calls: calls,
    page_errors: errors,
    lazy_sdk_chunks: lazyChunks,
    entry_bytes: (await stat(root + "/browser/prepare.js")).size,
    module_count: Object.values(bundle).reduce(
      (n, c) => n + c.modules.length,
      0,
    ),
    requests: requests.map((u) => u.slice(base.length)),
  };
  await writeFile(
    root + "/browser-results.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: true,
      cases: results.length,
      wrong_context_checks: report.wrong_context_checks,
      entry_bytes: report.entry_bytes,
      module_count: report.module_count,
    }),
  );
} finally {
  await browser.close();
}
