/** Fail closed on drift. Local files only; never reads a mutable SDK checkout. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const pin = JSON.parse(
  await readFile(new URL("../interfaces/order-sdk-pin.json", import.meta.url)),
);
const digest = (b) => createHash("sha256").update(b).digest("hex");
const sha = "5acde8df3fc4be31dbcb80106b7a7d491a5e60bd8d37d67da62dda0d19e33fbd";
if (
  pin.sdk_version !== "0.1.0-dev.4" ||
  pin.profile !== "setl8-sdk-dev-v1" ||
  pin.archive_sha256 !== sha ||
  digest(
    await readFile(new URL("../" + pin.source_archive, import.meta.url)),
  ) !== sha
)
  throw new Error("Accepted SDK artifact/profile mismatch");
for (const [file, record] of Object.entries(pin.selected_files))
  if (
    digest(await readFile(new URL("../" + file, import.meta.url))) !==
    record.sha256
  )
    throw new Error("Accepted SDK file mismatch: " + file);
const pkg = JSON.parse(
  await readFile(
    new URL("../packages/setl8-order-codec/package.json", import.meta.url),
  ),
);
if (
  pkg.name !== "@setl8/order-codec" ||
  pkg.version !== pin.sdk_version ||
  pkg.exports["."].import !== "./src/order.ts" ||
  pkg.exports["."].types !== "./src/order.ts" ||
  pkg.dependencies ||
  pkg.scripts
)
  throw new Error("Unexpected order-only SDK package");
console.log(
  "Accepted SDK order codec verified: 0.1.0-dev.4 / setl8-sdk-dev-v1; archive and 3 selected files unchanged.",
);
