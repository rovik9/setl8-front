/** Separate public observation; does not alter accepted proof, runtime or SDK pins. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root =
  "/Users/rovik/Documents/ChatGPT/Setl8/coordination/observations/p30-day2-2026-11-02";
const expected = {
  "devnet-deployment.json":
    "d6272ac2e7f84fcdb904490bf1c9935de117313f0771a56ceee86365363651fd",
  "devnet-demo.md":
    "ee08e885c2f8a92d1f03d80e9648c3b880413d3160f3e6972086ad6ae8a4c663",
  "devnet-rehearsal.md":
    "901cfb3115d49dbd6849349b27b91135216401d756556082f5815132b4922705",
};
const hash = (b) => createHash("sha256").update(b).digest("hex");
const inputs = {};
for (const [file, sha] of Object.entries(expected)) {
  const b = await readFile(root + "/" + file);
  if (hash(b) !== sha)
    throw Error("Reviewed public handoff source changed: " + file);
  inputs[file] = b;
}
const manifest = JSON.parse(inputs["devnet-deployment.json"]),
  accepted = JSON.parse(await readFile("src/data/devnet-proof.json", "utf8"));
if (
  manifest.cluster !== "devnet" ||
  manifest.genesis_hash !== accepted.genesis_hash
)
  throw Error("Network differs from accepted proof");
for (const k of ["lev", "vault"])
  for (const f of ["id", "sha256", "size_bytes"])
    if (manifest.programs[k][f] !== accepted.programs[k][f])
      throw Error("Program tuple differs: " + k + "." + f);
if (
  manifest.test_mints.usdc !== accepted.test_mints.usdc ||
  manifest.test_mints.decimals !== 6
)
  throw Error("Mint/decimals differ");
const a = manifest.example_accounts.find((a) => a.name === "A1");
if (!a) throw Error("A1 identity unavailable");
const accountMatch = inputs["devnet-demo.md"]
  .toString()
  .match(/trader USDC token account: \[([1-9A-HJ-NP-Za-km-z]+)\]/);
if (!accountMatch) throw Error("Public destination token account unavailable");
const p = manifest.payout;
const normalized = {
  format: "setl8-devnet-day2-public-observation-v1",
  network: "devnet",
  generated_at: manifest.generated_at,
  source: Object.entries(expected).map(([file, sha256]) => ({
    file,
    sha256,
    bytes: String(inputs[file].length),
  })),
  genesis_hash: manifest.genesis_hash,
  programs: Object.fromEntries(
    ["lev", "vault"].map((k) => [
      k,
      {
        id: manifest.programs[k].id,
        sha256: manifest.programs[k].sha256,
        size_bytes: String(manifest.programs[k].size_bytes),
      },
    ]),
  ),
  account: {
    name: "A1",
    address: a.address,
    trader: a.trader,
    trader_token_account: accountMatch[1],
    mint: manifest.test_mints.usdc,
    decimals: "6",
  },
  reported: {
    claim: p.claim,
    claim_amount_micro_usdc: p.claim_amount_micro_usdc,
    paid_micro_usdc: p.claim_detail.paid_micro_usdc,
    status: p.claim_status,
    balance_before_micro_usdc: p.trader_balance_before_micro_usdc,
    balance_after_micro_usdc: p.trader_balance_after_micro_usdc,
    delta_micro_usdc: (
      BigInt(p.trader_balance_after_micro_usdc) -
      BigInt(p.trader_balance_before_micro_usdc)
    ).toString(),
    setup_liquidity_micro_usdc:
      p.pool_funding_detail.setup_liquidity_micro_usdc,
    added_for_payout_micro_usdc:
      p.pool_funding_detail.added_for_the_payout_micro_usdc,
  },
  transactions: Object.entries(p.signatures).map(([action, signature]) => ({
    action,
    signature,
  })),
  receipt_verification: null,
  scope:
    "Existing public rehearsal history; not connected-app execution or signed-in wallet ownership. Finalized receipt and token-delta verification are required before an app-paid claim.",
};
const output = JSON.stringify(normalized, null, 2) + "\n",
  path = "src/data/devnet-day2-observation.json";
if (process.argv.includes("--check")) {
  if ((await readFile(path, "utf8")) !== output)
    throw Error("Day2 projection differs; inspect public sources");
} else await writeFile(path, output);
console.log(
  JSON.stringify({
    observation_sha256: hash(output),
    accepted_proof_unchanged: true,
    receipt_verified: false,
    source_count: 3,
  }),
);
