/**
 * Builds src/data/devnet-proof.json from the contract side's PUBLIC devnet handover files.
 * Reads only devnet-deployment.json and devnet-demo.md (no key files, no environment files, no network).
 * An allow-list copies the fields the proof page shows; everything else (admin keys, the evaluator
 * key path, example accounts) is left out. Never edit the output by hand: regenerate it after the owner
 * refreshes the handover files (day 2 adds the claim, the payout and their signatures).
 *
 *   node tools/gen-devnet-proof.mjs [--dir HANDOVER_DIR]   write src/data/devnet-proof.json
 *   node tools/gen-devnet-proof.mjs --check [--dir ...]    exit 1 when the pinned copy differs from the files
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const check = args.includes("--check");
const dirFlag = args.indexOf("--dir");
const dir =
  dirFlag >= 0
    ? args[dirFlag + 1]
    : join(homedir(), "Documents/setl8-lev-trading/handover");
const out = new URL("../src/data/devnet-proof.json", import.meta.url);

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
  throw new Error("devnet proof: " + message);
};
const need = (ok, message) => ok || fail(message);
const address = (value, name) => {
  need(typeof value === "string" && ADDRESS.test(value), `bad address ${name}`);
  return value;
};
const integer = (value, name) => {
  need(Number.isSafeInteger(value) && value >= 0, `bad integer ${name}`);
  return value;
};

const manifestBytes = await readFile(join(dir, "devnet-deployment.json"));
const demoBytes = await readFile(join(dir, "devnet-demo.md"));
const m = JSON.parse(manifestBytes);
need(
  m.format === "setl8-lev-trading-devnet-deployment",
  "unknown manifest format",
);
need(m.version === 1, "unknown manifest version");
need(m.cluster === "devnet", "manifest is not for devnet");

const program = (p, name) => {
  need(SHA256.test(p.sha256), `bad image hash ${name}`);
  return {
    id: address(p.id, name),
    size_bytes: integer(p.size_bytes, name + " size"),
    sha256: p.sha256,
  };
};
const tiers = m.lev.tiers.map((t) => ({
  tier: integer(t.tier, "tier"),
  account_size_usd: integer(t.account_size_usd, "size"),
  price_usd: integer(t.price_usd, "price"),
}));

// devnet-demo.md: "## N. Title", one summary paragraph, "- label: [text](explorer link)" items,
// and an italic "*not yet: ...*" line for steps that day 2 will fill.
const sections = [];
let current = null;
for (const line of demoBytes.toString("utf8").split("\n")) {
  const heading = /^## (\d+)\. (.+)$/.exec(line);
  if (heading) {
    current = {
      n: Number(heading[1]),
      title: heading[2].trim(),
      summary: "",
      pending: null,
      items: [],
    };
    sections.push(current);
    continue;
  }
  if (!current) continue;
  const pending = /^\*not yet: (.+)\*$/.exec(line);
  const item =
    /^- (.+?): \[([1-9A-HJ-NP-Za-km-z]+)\]\(https:\/\/explorer\.solana\.com\/(tx|address)\/([1-9A-HJ-NP-Za-km-z]+)\?cluster=devnet\)$/.exec(
      line,
    );
  if (pending) current.pending = pending[1].trim();
  else if (item) {
    const [, label, text, kind, value] = item;
    need(
      text === value,
      `link text differs from link target in section ${current.n}`,
    );
    need(
      (kind === "tx" ? SIGNATURE : ADDRESS).test(value),
      `bad ${kind} in section ${current.n}`,
    );
    current.items.push({ label, kind, value });
  } else if (line.trim() && !line.startsWith("-") && !current.summary)
    current.summary = line.trim();
  else if (line.startsWith("-"))
    fail(
      `unrecognised list line in section ${current.n}: ${line.slice(0, 60)}`,
    );
}
need(sections.length >= 7, "demo list has fewer than 7 sections");

const pinned = {
  format: "setl8-front-devnet-proof",
  version: 1,
  source: {
    manifest: {
      file: "devnet-deployment.json",
      sha256: digest(manifestBytes),
      bytes: manifestBytes.length,
    },
    demo: {
      file: "devnet-demo.md",
      sha256: digest(demoBytes),
      bytes: demoBytes.length,
    },
  },
  cluster: "devnet",
  genesis_hash: address(m.genesis_hash, "genesis"),
  programs: {
    lev: program(m.programs.lev, "lev"),
    vault: program(m.programs.vault, "vault"),
  },
  test_mints: {
    decimals: integer(m.test_mints.decimals, "decimals"),
    usdc: address(m.test_mints.usdc, "usdc"),
    usdt: address(m.test_mints.usdt, "usdt"),
  },
  accounts: {
    lev_config: address(m.lev.config, "config"),
    lev_rule_set: address(m.lev.rule_set, "rule_set"),
    vault_state: address(m.vault.vault_state, "vault_state"),
    vault_product_registry: address(m.vault.product_registry, "registry"),
    vault_payout_tally: address(m.vault.payout_tally, "payout_tally"),
    usdc_pool: address(m.vault.usdc_pool, "usdc_pool"),
    usdt_pool: address(m.vault.usdt_pool, "usdt_pool"),
  },
  challenge: {
    tiers,
    challenge_fee_bps: integer(m.lev.challenge_fee_bps, "fee"),
    pass_delay_secs: integer(m.lev.pass_delay_secs, "delay"),
    market_count: m.lev.markets.length,
  },
  payout: {
    claim: m.payout.claim ?? null,
    pool_funding: m.payout.pool_funding ?? null,
    trader_balance_before_micro_usdc:
      m.payout.trader_balance_before_micro_usdc ?? null,
    trader_balance_after_micro_usdc:
      m.payout.trader_balance_after_micro_usdc ?? null,
  },
  sections,
};
const text = JSON.stringify(pinned, null, 2) + "\n";
if (check) {
  const current = await readFile(out, "utf8").catch(() => "");
  if (current !== text) {
    console.error("devnet proof is stale: run `npm run gen:devnet-proof`");
    process.exit(1);
  }
  console.log("devnet proof matches", pinned.source.manifest.sha256);
} else {
  await writeFile(out, text);
  console.log(
    `wrote src/data/devnet-proof.json; manifest sha256 ${pinned.source.manifest.sha256}, ${sections.length} sections`,
  );
}
