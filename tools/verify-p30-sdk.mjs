/** Separately pinned additive SDK. No mutable SDK checkout or chain/RPC reads. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url),
  read = (p) => readFile(new URL(p, root));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const pin = JSON.parse(await read("interfaces/p30-unsigned-sdk-pin.json"));
if (
  pin.version !== "0.1.0-dev.5" ||
  pin.alias !== "@setl8/p30-sdk" ||
  pin.profile !== "p30-devnet-2026-10-31-v1" ||
  pin.npm_sha256 !==
    "3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d" ||
  pin.descriptor_sha256 !==
    "077ff530b2e8b48e676622dd1d5b1369e9c99d5c3ddcd8e5e7edd315783bd6b6" ||
  pin.source_archive_sha256 !==
    "b95cd2ccc6351c393e98db4acd069df7df23ee027e155d85b04c5559fec4e84f"
)
  throw Error("P30 public artifact pin mismatch");
for (const [p, h] of [
  [pin.npm_archive, pin.npm_sha256],
  [pin.descriptor, pin.descriptor_sha256],
  [pin.browser_identity.path, pin.browser_identity.sha256],
])
  if (sha(await read(p)) !== h) throw Error("P30 artifact drift: " + p);
const pkg = JSON.parse(await read("node_modules/@setl8/p30-sdk/package.json"));
if (
  pkg.name !== "@setl8/sdk" ||
  pkg.version !== pin.version ||
  pkg.exports["."].import !== "./dist/index.js"
)
  throw Error("P30 alias identity mismatch");
for (const [p, h] of Object.entries(pin.installed_files))
  if (sha(await read("node_modules/@setl8/p30-sdk/" + p)) !== h)
    throw Error("P30 installed SDK drift: " + p);
const app = JSON.parse(await read("package.json")),
  lock = JSON.parse(await read("package-lock.json"));
if (
  app.dependencies[pin.alias] !== "file:" + pin.npm_archive ||
  lock.packages["node_modules/@setl8/p30-sdk"].version !== pin.version
)
  throw Error("P30 alias/lock mismatch");
console.log(
  "P30 additive unsigned SDK dev.5 verified: archive, descriptor and " +
    Object.keys(pin.installed_files).length +
    " installed files. Parent order SDK unchanged/separately guarded.",
);
