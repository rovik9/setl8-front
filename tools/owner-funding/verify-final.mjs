/** Public-only exact-signature verification, at most10 reads, no send/retry. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  Message,
  Transaction,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import bs58 from "bs58";
import { INTENT, TOKEN, inspectFundingMessage, sha } from "./core.mjs";
import { DirectRpc, DEVNET_ENDPOINTS } from "../../src/buy/rpc.ts";
import { readPair } from "../../src/buy/preflight.ts";
import { exactJson, u64, safeNumber, un64 } from "../../src/buy/bytes.ts";
const root = "artifacts/owner-funding-final-2026-11-02",
  c = JSON.parse(readFileSync(root + "/context.json", "utf8")),
  execution = JSON.parse(readFileSync(root + "/execute-results.json", "utf8")),
  stored = JSON.parse(
    readFileSync("artifacts/owner-funding-execution/signature.json", "utf8"),
  ),
  signature = stored.signature;
if (
  stored.messageHash !== c.messageHash ||
  !execution.actualSubmissionAttempted
)
  throw Error(
    "No exact durable submitted funding signature; no verification reads.",
  );
const out = {
  started_at_utc: new Date().toISOString(),
  signature,
  messageHash: c.messageHash,
  Explorer: "https://explorer.solana.com/tx/" + signature + "?cluster=devnet",
  max_reads: 10,
  requests: [],
  statuses: [],
  one_nonfinalized_wait_ms: 0,
  receipt_verified: false,
  purchase_gates: "OFF unchanged",
};
const signal = new AbortController().signal,
  queue = [],
  add = (p, m, params) => queue.push({ p, m, params });
let last = -Infinity,
  stopped = false,
  reason = null;
const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  nativeFetch = globalThis.fetch;
const fetcher = async (url, opts) => {
  const q = JSON.parse(opts.body),
    i = out.requests.length,
    w = queue[i];
  if (
    stopped ||
    i >= 10 ||
    !w ||
    new URL(url).href !== new URL(DEVNET_ENDPOINTS[w.p]).href ||
    q.method !== w.m ||
    JSON.stringify(q.params) !== JSON.stringify(w.params)
  )
    throw Error("Verification finite scope/budget guard.");
  while (performance.now() - last < 1000)
    await wait(Math.ceil(1000 - (performance.now() - last)));
  if (stopped || opts.signal.aborted) throw Error("Verification stopped.");
  const at = performance.now(),
    e = {
      ordinal: i + 1,
      provider: w.p,
      url,
      method: q.method,
      params: q.params,
      forwarded_at_utc: new Date().toISOString(),
      previous_forward_gap_ms: Number.isFinite(last) ? at - last : null,
      request_sha256: sha(opts.body),
    };
  last = at;
  out.requests.push(e);
  try {
    const r = await nativeFetch(url, opts);
    e.http_status = r.status;
    e.retry_after = r.headers.get("retry-after");
    if (!r.ok || e.retry_after || r.redirected) {
      stopped = true;
      reason = "HTTP " + r.status + (e.retry_after ? " Retry-After" : "");
    }
    const reader = r.clone().body?.getReader();
    if (!reader) throw Error("Receipt response unavailable.");
    let parts = [],
      n = 0;
    while (true) {
      const v = await reader.read();
      if (v.done) break;
      n += v.value.byteLength;
      if (n > 2500000) {
        await reader.cancel();
        throw Error("Receipt response bound.");
      }
      parts.push(Buffer.from(v.value));
    }
    const raw = Buffer.concat(parts);
    e.response_sha256 = sha(raw);
    e.response_bytes = raw.length;
    if (q.method !== "getTransaction") {
      e.response_file =
        root + `/verify-response-${String(e.ordinal).padStart(2, "0")}.bin`;
      writeFileSync(e.response_file, raw, { flag: "wx", mode: 0o600 });
    } else e.receipt_body_not_persisted = true;
    const parsed = exactJson(raw.toString("utf8"));
    e.rpc_error = parsed.error
      ? {
          code: String(parsed.error.code),
          message: "Public verification RPC error",
        }
      : null;
    if (parsed.error) {
      stopped = true;
      reason ??= "Verification RPC error";
    }
    return r;
  } catch (error) {
    stopped = true;
    reason ??= "Verification network/harness failure";
    e.failure = String(error.message);
    throw error;
  }
};
const rpc = new DirectRpc(fetcher),
  must = (x, m) => {
    if (!x) throw Error(m);
  };
async function statuses() {
  const params = [[signature], { searchTransactionHistory: true }];
  for (const p of [0, 1]) add(p, "getSignatureStatuses", params);
  const values = [];
  for (const p of [0, 1]) {
    const r = await rpc.read(p, "getSignatureStatuses", params, signal);
    u64(r?.context?.slot);
    must(
      Array.isArray(r.value) && r.value.length === 1,
      "Status response incomplete, not absence.",
    );
    const s = r.value[0];
    values.push(
      s === null
        ? null
        : {
            slot: u64(s.slot),
            confirmationStatus: s.confirmationStatus,
            err: s.err,
            confirmations: s.confirmations,
          },
    );
  }
  out.statuses.push(values);
  return values;
}
function receipt(t, statusSlot) {
  must(
    t &&
      t.slot === statusSlot &&
      t.meta?.err === null &&
      t.transaction?.signatures?.length === 1 &&
      t.transaction.signatures[0] === signature,
    "Exact successful finalized transaction unavailable.",
  );
  must(
    t.version === "legacy" || t.version === undefined,
    "Unsupported receipt transaction version.",
  );
  const x = t.transaction.message;
  must(
    x && x.accountKeys?.length === 7 && x.instructions?.length === 3,
    "Unexpected receipt message shape.",
  );
  const index = (v) => {
    const n = BigInt(u64(v));
    must(n <= 255n, "Receipt index bound.");
    return Number(n);
  };
  const msg = new Message({
      header: {
        numRequiredSignatures: index(x.header.numRequiredSignatures),
        numReadonlySignedAccounts: index(x.header.numReadonlySignedAccounts),
        numReadonlyUnsignedAccounts: index(
          x.header.numReadonlyUnsignedAccounts,
        ),
      },
      accountKeys: x.accountKeys,
      recentBlockhash: x.recentBlockhash,
      instructions: x.instructions.map((i) => ({
        programIdIndex: index(i.programIdIndex),
        accounts: i.accounts.map(index),
        data: i.data,
      })),
    }),
    bytes = msg.serialize();
  must(
    sha(bytes) === c.messageHash &&
      Buffer.from(bytes).toString("hex") === c.messageHex,
    "Finalized message differs from the immutable funding context.",
  );
  inspectFundingMessage(bytes, c.blockhash);
  must(
    Transaction.populate(msg, [signature]).verifySignatures(),
    "Receipt signature invalid for exact message/payer.",
  );
  const hash = createHash("sha256")
    .update(Buffer.from([1]))
    .update(bs58.decode(signature))
    .update(bytes)
    .digest("hex");
  const send = execution.requests.find((e) => e.method === "sendTransaction");
  must(
    send && send.packetSha256 === hash,
    "Receipt packet hash differs from single submission.",
  );
  const keys = msg.accountKeys.map((k) => k.toBase58()),
    meta = t.meta;
  must(
    meta.preBalances?.length === 7 && meta.postBalances?.length === 7,
    "Exact receipt SOL balances incomplete.",
  );
  const pre = meta.preBalances.map((v) => BigInt(u64(v))),
    post = meta.postBalances.map((v) => BigInt(u64(v))),
    at = (k) => keys.indexOf(k),
    payer = at(INTENT.payer),
    owner = at(INTENT.owner),
    ata = at(INTENT.ata),
    debit = pre[payer] - post[payer],
    credit = post[owner] - pre[owner],
    rent = post[ata] - pre[ata],
    fee = BigInt(u64(meta.fee));
  must(
    debit === BigInt(c.budget.expectedAggregateDebitLamports) &&
      debit <= 25000000n &&
      credit === 20000000n &&
      pre[ata] === 0n &&
      rent === BigInt(c.budget.ATA_rentLamports) &&
      fee === BigInt(c.budget.networkFeeLamports) &&
      debit === credit + rent + fee,
    "Actual receipt debit/credit/rent/fee differs from approval or cap.",
  );
  must(
    Array.isArray(meta.preTokenBalances) &&
      Array.isArray(meta.postTokenBalances),
    "Token receipt metadata incomplete.",
  );
  const preToken = meta.preTokenBalances.filter(
      (b) => index(b.accountIndex) === ata,
    ),
    tokens = meta.postTokenBalances.filter(
      (b) => index(b.accountIndex) === ata,
    );
  must(
    preToken.length === 0 && tokens.length === 1,
    "Unexpected prior ATA token state.",
  );
  const tok = tokens[0];
  must(
    tok.owner === INTENT.owner &&
      tok.mint === INTENT.mint &&
      tok.uiTokenAmount?.decimals === "6" &&
      u64(tok.uiTokenAmount?.amount) === "30120000" &&
      (!tok.programId || tok.programId === TOKEN),
    "Receipt ATA amount/owner/mint/decimals differs.",
  );
  return {
    slot: statusSlot,
    signature,
    messageHash: c.messageHash,
    packetSha256: hash,
    err: null,
    feeLamports: fee.toString(),
    payerPreLamports: pre[payer].toString(),
    payerPostLamports: post[payer].toString(),
    actualPayerDebitLamports: debit.toString(),
    ownerPreLamports: pre[owner].toString(),
    ownerPostLamports: post[owner].toString(),
    ownerCreditLamports: credit.toString(),
    ATAPreLamports: pre[ata].toString(),
    ATAPostLamports: post[ata].toString(),
    ATArentLamports: rent.toString(),
    ATAowner: tok.owner,
    ATAmint: tok.mint,
    ATAtokensMicro: "30120000",
    instructionKinds: c.decoded.instructions.map((i) => i.kind),
  };
}
function currentAccounts(m) {
  const observed = {};
  for (const [label, key] of [
    ["owner", INTENT.owner],
    ["ATA", INTENT.ata],
    ["payer", INTENT.payer],
    ["mint", INTENT.mint],
  ]) {
    const a = m[key];
    if (a === null) {
      observed[label] = { address: key, state: "missing_at_this_later_read" };
      continue;
    }
    const b = un64(a.data[0]),
      v = new DataView(b.buffer, b.byteOffset);
    observed[label] = {
      address: key,
      owner: a.owner,
      lamports: u64(a.lamports),
      executable: a.executable,
    };
    if (label === "ATA") {
      must(
        a.owner === TOKEN &&
          !a.executable &&
          b.length === 165 &&
          new PublicKey(b.slice(0, 32)).toBase58() === INTENT.mint &&
          new PublicKey(b.slice(32, 64)).toBase58() === INTENT.owner &&
          b[108] === 1,
        "Current ATA identity/state unavailable.",
      );
      observed[label].tokensMicro = v.getBigUint64(64, true).toString();
      observed[label].tokenOwner = INTENT.owner;
      observed[label].mint = INTENT.mint;
      observed[label].matchesFundedAmount =
        observed[label].tokensMicro === "30120000";
    } else if (label === "mint") {
      must(
        a.owner === TOKEN &&
          !a.executable &&
          b.length === 82 &&
          b[44] === 6 &&
          b[45] === 1,
        "Current mint unavailable.",
      );
      observed[label].currentSupplyMicro = v.getBigUint64(36, true).toString();
    } else
      must(
        a.owner === SystemProgram.programId.toBase58() &&
          !a.executable &&
          b.length === 0,
        "Current System account unavailable.",
      );
  }
  return observed;
}
try {
  rpc.begin("funding-finality-exact-signature-only");
  let s = await statuses();
  must(
    s.every((v) => v === null || v.err === null),
    "A provider reports transaction failure; no further funding.",
  );
  if (!s.every((v) => v?.confirmationStatus === "finalized")) {
    out.one_nonfinalized_wait_ms = 15000;
    await wait(15000);
    s = await statuses();
  }
  must(
    s.every((v) => v && v.err === null && v.confirmationStatus === "finalized"),
    "Exact signature not corroborated finalized within bounded observation; no resend.",
  );
  must(s[0].slot === s[1].slot, "Finalized status slots disagree.");
  out.finalized_status_slot = s[0].slot;
  const params = [
    signature,
    {
      encoding: "json",
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    },
  ];
  for (const p of [0, 1]) add(p, "getTransaction", params);
  const receipts = [];
  for (const p of [0, 1])
    receipts.push(
      receipt(await rpc.read(p, "getTransaction", params, signal), s[0].slot),
    );
  must(
    JSON.stringify(receipts[0]) === JSON.stringify(receipts[1]),
    "Exact receipt projections disagree.",
  );
  out.receipt = receipts[0];
  out.receipt_verified = true;
  writeFileSync(
    root + "/verified-receipt-public.json",
    JSON.stringify(out.receipt, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  const addresses = [INTENT.owner, INTENT.ata, INTENT.payer, INTENT.mint],
    bulk = [
      addresses,
      {
        encoding: "base64",
        commitment: "finalized",
        minContextSlot: safeNumber(s[0].slot),
      },
    ];
  for (const p of [0, 1]) add(p, "getMultipleAccounts", bulk);
  const pair = await readPair(rpc, addresses, signal, s[0].slot);
  out.current_observation = {
    slots: pair.slots,
    accounts: currentAccounts(pair.accounts),
    note: "Later current state, separate from transaction-specific receipt deltas.",
  };
  out.outcome = "finalized_exact_funding_receipt_and_current_state_verified";
} catch (error) {
  reason ??= String(error.message);
  out.outcome = out.receipt_verified
    ? "receipt_verified_later_current_state_unavailable"
    : "bounded_verification_incomplete_no_repeat_funding";
  out.blocker = reason;
} finally {
  out.stop_reason = reason;
  out.completed_at_utc = new Date().toISOString();
  out.actual_READ_RPC = out.requests.length;
  out.min_forward_interval_ms =
    out.requests.length > 1
      ? Math.min(...out.requests.slice(1).map((e) => e.previous_forward_gap_ms))
      : null;
  writeFileSync(
    root + "/verification-results.json",
    JSON.stringify(out, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      outcome: out.outcome,
      signature,
      receipt_verified: out.receipt_verified,
      reads: out.actual_READ_RPC,
      blocker: out.blocker,
    }),
  );
}
