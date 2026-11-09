/** Run with: node --import ./tools/owner-funding/production-loader.mjs tools/owner-funding/run.mjs stage */
import {
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import {
  INTENT,
  STAGE2_RELEASE,
  FundingJournal,
  FUNDING_ADDRESSES,
  compileFunding,
  inspectFundingAccounts,
  fundingBudget,
  inspectUnsignedSimulation,
  assertFreshContext,
  assertFundingForwardBoundary,
  checkKeeperIdentity,
  executeStagedFunding,
  sha,
} from "./core.mjs";
import { DirectRpc, DEVNET_ENDPOINTS } from "../../src/buy/rpc.ts";
import { readPair } from "../../src/buy/preflight.ts";
import { exactJson, u64, safeNumber } from "../../src/buy/bytes.ts";
const mode = process.argv[2],
  root = "artifacts/owner-funding-final-2026-11-02";
if (!["stage", "execute"].includes(mode) || process.argv.length !== 3)
  throw Error(
    "Only explicit stage or Origin-released execute mode is supported.",
  );
if (
  mode === "execute" &&
  !(STAGE2_RELEASE.enabled && STAGE2_RELEASE.originReference)
)
  throw Error("Funding stage2 not released by Origin; no key read/sign/send.");
const marker =
    root +
    (mode === "stage"
      ? "/one-read-window.marker"
      : "/one-stage2-window.marker"),
  fd = openSync(marker, "wx", 0o600);
fsyncSync(fd);
closeSync(fd);
const pids = [25827, 96560, 59588, 58162, 90268, 89891],
  processes = () =>
    Object.fromEntries(
      pids.map((p) => [
        p,
        execFileSync("ps", ["-p", String(p), "-o", "lstart=,command="], {
          encoding: "utf8",
        }).trim(),
      ]),
    );
const result = {
  mode,
  startedAt: Date.now(),
  started_at_utc: new Date().toISOString(),
  intent: INTENT,
  max_RPC: mode === "stage" ? 16 : 9,
  requests: [],
  blocked: [],
  actualSignatureCreated: false,
  actualSubmissionAttempted: false,
  processes_before: processes(),
  app_gates: "OFF unchanged",
  funding_stage2_release: STAGE2_RELEASE,
};
const journal = new FundingJournal().initialize();
let c = null,
  initialPair = null,
  pendingPacket = null,
  pendingSignature = null,
  stopped = false,
  stopReason = null,
  lastForward = -Infinity;
const pause = (ms) => new Promise((r) => setTimeout(r, ms)),
  nativeFetch = globalThis.fetch;
const options = () => ({
    commitment: "confirmed",
    minContextSlot: safeNumber(c.minSlot),
  }),
  bulk = (min) => [
    FUNDING_ADDRESSES,
    {
      encoding: "base64",
      commitment: "finalized",
      minContextSlot: safeNumber(min),
    },
  ];
function expected(i) {
  if (mode === "stage") {
    const table = [
      () => [0, "getGenesisHash", []],
      () => [1, "getGenesisHash", []],
      () => [0, "getMultipleAccounts", bulk("0")],
      () => [1, "getMultipleAccounts", bulk("0")],
      () => [
        0,
        "getMinimumBalanceForRentExemption",
        [165, { commitment: "finalized" }],
      ],
      () => [
        1,
        "getMinimumBalanceForRentExemption",
        [165, { commitment: "finalized" }],
      ],
      () => [
        0,
        "getLatestBlockhash",
        [
          {
            commitment: "confirmed",
            minContextSlot: safeNumber(initialPair.minSlot),
          },
        ],
      ],
      () => [1, "isBlockhashValid", [c.blockhash, options()]],
      () => [
        0,
        "getFeeForMessage",
        [Buffer.from(c.messageHex, "hex").toString("base64"), options()],
      ],
      () => [
        1,
        "getFeeForMessage",
        [Buffer.from(c.messageHex, "hex").toString("base64"), options()],
      ],
      () => [0, "isBlockhashValid", [c.blockhash, options()]],
      () => [0, "getBlockHeight", [{ commitment: "confirmed" }]],
      () => [1, "getBlockHeight", [{ commitment: "confirmed" }]],
      () => [
        0,
        "simulateTransaction",
        [
          c.unsignedBase64,
          {
            encoding: "base64",
            commitment: "confirmed",
            sigVerify: false,
            replaceRecentBlockhash: false,
            minContextSlot: safeNumber(c.minSlot),
            accounts: {
              encoding: "base64",
              addresses: [INTENT.payer, INTENT.owner, INTENT.ata, INTENT.mint],
            },
          },
        ],
      ],
      () => [0, "getMultipleAccounts", bulk(c.minSlot)],
      () => [1, "getMultipleAccounts", bulk(c.minSlot)],
    ];
    return table[i]?.();
  }
  const table = [
    () => [0, "getMultipleAccounts", bulk(c.minSlot)],
    () => [1, "getMultipleAccounts", bulk(c.minSlot)],
    () => [0, "isBlockhashValid", [c.blockhash, options()]],
    () => [1, "isBlockhashValid", [c.blockhash, options()]],
    () => [
      0,
      "getFeeForMessage",
      [Buffer.from(c.messageHex, "hex").toString("base64"), options()],
    ],
    () => [
      1,
      "getFeeForMessage",
      [Buffer.from(c.messageHex, "hex").toString("base64"), options()],
    ],
    () => [0, "getBlockHeight", [{ commitment: "confirmed" }]],
    () => [1, "getBlockHeight", [{ commitment: "confirmed" }]],
    () => [
      0,
      "sendTransaction",
      [
        pendingPacket.toString("base64"),
        {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 0,
          minContextSlot: safeNumber(c.minSlot),
        },
      ],
    ],
  ];
  return table[i]?.();
}
async function finiteFetch(url, opts) {
  const q = JSON.parse(opts.body),
    i = result.requests.length,
    want = expected(i);
  if (
    stopped ||
    !want ||
    i >= result.max_RPC ||
    opts.method !== "POST" ||
    new URL(url).href !== new URL(DEVNET_ENDPOINTS[want[0]]).href ||
    q.method !== want[1] ||
    JSON.stringify(q.params) !== JSON.stringify(want[2])
  ) {
    stopped = true;
    stopReason ??= "local finite method/bytes/scope guard";
    result.blocked.push({ method: q.method, reason: stopReason });
    throw Error(stopReason);
  }
  while (performance.now() - lastForward < 1000)
    await pause(Math.ceil(1000 - (performance.now() - lastForward)));
  if (stopped || opts.signal?.aborted)
    throw Error("Read stopped/cancelled before forwarding.");
  const at = performance.now(),
    sending = q.method === "sendTransaction",
    entry = {
      ordinal: i + 1,
      provider: want[0],
      url,
      method: q.method,
      ...(sending
        ? {
            signature: pendingSignature,
            messageHash: c.messageHash,
            packetSha256: sha(pendingPacket),
            rawSignedPacketStored: false,
          }
        : { params: q.params, requestSha256: sha(opts.body) }),
      forwarded_at_utc: new Date().toISOString(),
      previous_forward_gap_ms: Number.isFinite(lastForward)
        ? at - lastForward
        : null,
    };
  try {
    if (sending) {
      try {
        assertFundingForwardBoundary(c, pendingPacket, pendingSignature);
        assertFreshContext(c);
      } catch (error) {
        stopped = true;
        stopReason = "Send boundary: " + error.message;
        result.blocked.push({
          method: q.method,
          reason: stopReason,
          forwarded: false,
        });
        throw error;
      }
    }
    lastForward = at;
    result.requests.push(entry);
    if (sending) result.actualSubmissionAttempted = true;
    const response = await nativeFetch(url, opts);
    entry.http_status = response.status;
    entry.retry_after = response.headers.get("retry-after");
    if (!response.ok || entry.retry_after || response.redirected) {
      stopped = true;
      stopReason =
        "HTTP " + response.status + (entry.retry_after ? " Retry-After" : "");
    }
    const reader = response.clone().body?.getReader();
    if (!reader) throw Error("Response capture unavailable.");
    let chunks = [],
      size = 0;
    while (true) {
      const v = await reader.read();
      if (v.done) break;
      size += v.value.byteLength;
      if (size > 2500000) {
        await reader.cancel();
        throw Error("Response capture bound.");
      }
      chunks.push(Buffer.from(v.value));
    }
    const raw = Buffer.concat(chunks);
    entry.responseFile =
      root + `/${mode}-response-${String(entry.ordinal).padStart(2, "0")}.bin`;
    entry.responseSha256 = sha(raw);
    entry.responseBytes = raw.length;
    // Never persist a submission response that could echo a raw signed packet.
    if (!sending)
      writeFileSync(entry.responseFile, raw, { flag: "wx", mode: 0o600 });
    else entry.responseFile = null;
    const parsed = exactJson(raw.toString("utf8"));
    entry.rpc_error = sending
      ? parsed.error
        ? {
            code: String(parsed.error.code),
            message: "Submission error; reconcile exact signature only.",
          }
        : null
      : (parsed.error ?? null);
    entry.slot = parsed.result?.context?.slot ?? null;
    if (parsed.error) {
      stopped = true;
      stopReason ??= "RPC error";
    }
    return response;
  } catch (error) {
    stopped = true;
    stopReason ??= "network/capture failure";
    entry.failure = sending
      ? "Submission network/capture failure; reconcile exact signature only."
      : String(error?.message ?? "Network/capture failure");
    throw error;
  }
}
const rpc = new DirectRpc(finiteFetch),
  signal = new AbortController().signal;
const validContext = (r) => {
  if (r?.value !== true || BigInt(u64(r.context?.slot)) < BigInt(c.minSlot))
    throw Error("Original blockhash invalid or read context stale.");
};
const feeValue = (r) => {
  if (BigInt(u64(r?.context?.slot)) < BigInt(c.minSlot))
    throw Error("Fee context behind exact message.");
  return u64(r.value);
};
const heightValue = (h) => {
  if (BigInt(u64(h)) > BigInt(c.lastValidBlockHeight))
    throw Error("Original blockhash expired.");
  return h;
};
try {
  if (mode === "stage") {
    result.preRefreshMarkers = Object.fromEntries(
      ["sign-once.marker", "signature.json", "submit-once.marker"].map((n) => [
        n,
        existsSync("artifacts/owner-funding-execution/" + n),
      ]),
    );
    if (Object.values(result.preRefreshMarkers).some(Boolean))
      throw Error(
        "Existing sign/signature/submit marker; reconcile exact signature only.",
      );
    const prior = JSON.parse(
        readFileSync(
          "artifacts/owner-rent-corroboration-1/results.json",
          "utf8",
        ),
      ),
      denial = prior.requests.findLast(
        (e) => e.http_status === 429 || e.retry_after,
      );
    const earliest = denial ? Date.parse(denial.forwarded_at_utc) + 60000 : 0;
    if (Date.now() < earliest)
      throw Error("Prior429 cooldown still active; no request made.");
    result.prior_cooldown = {
      source: "owner-rent-corroboration-1",
      not_before_utc: new Date(earliest).toISOString(),
      honored: true,
    };
    result.keeper = checkKeeperIdentity();
    journal.event("stage1_identity_checked", {
      publicKey: result.keeper.publicKey,
      actualSignatureCreated: false,
    });
    rpc.begin("funding-stage1-readonly");
    result.genesis = [];
    for (const p of [0, 1]) {
      const g = await rpc.read(p, "getGenesisHash", [], signal);
      result.genesis.push(g);
      if (g !== INTENT.genesis) throw Error("Not pinned devnet genesis.");
    }
    initialPair = await readPair(rpc, FUNDING_ADDRESSES, signal);
    result.initial_slots = initialPair.slots;
    result.initial_accounts = initialPair.accounts;
    const state = inspectFundingAccounts(initialPair.accounts);
    result.initial_state = state;
    const rentQuotes = [];
    for (const p of [0, 1]) {
      const rent = u64(
        await rpc.read(
          p,
          "getMinimumBalanceForRentExemption",
          [165, { commitment: "finalized" }],
          signal,
        ),
      );
      rentQuotes.push(rent);
      if (rent !== state.ATA_rentLamports)
        throw Error(
          "Current paired Rent and165byte quote disagree; do not combine.",
        );
    }
    result.paired_ATA_rent_quotes = rentQuotes;
    const latest = await rpc.read(
      0,
      "getLatestBlockhash",
      [
        {
          commitment: "confirmed",
          minContextSlot: safeNumber(initialPair.minSlot),
        },
      ],
      signal,
    );
    if (BigInt(u64(latest?.context?.slot)) < BigInt(initialPair.minSlot))
      throw Error("Latest blockhash context behind funding state.");
    c = {
      intentId: INTENT.id,
      ready: false,
      startedAt: result.startedAt,
      expiresAt: 0,
      ...compileFunding(latest?.value?.blockhash),
      lastValidBlockHeight: u64(latest?.value?.lastValidBlockHeight),
      minSlot: initialPair.minSlot,
      blockhashContextSlot: u64(latest.context.slot),
      payerLamports: state.payerLamports,
      accounts: initialPair.accounts,
    };
    validContext(
      await rpc.read(1, "isBlockhashValid", [c.blockhash, options()], signal),
    );
    const fees = [];
    for (const p of [0, 1])
      fees.push(
        feeValue(
          await rpc.read(
            p,
            "getFeeForMessage",
            [Buffer.from(c.messageHex, "hex").toString("base64"), options()],
            signal,
          ),
        ),
      );
    if (fees[0] !== fees[1])
      throw Error("Exact-message fee providers disagree.");
    c.budget = fundingBudget(
      state.ATA_rentLamports,
      fees[0],
      state.payerLamports,
    );
    result.exact_message_fee_quotes = fees;
    result.budget = c.budget;
    validContext(
      await rpc.read(0, "isBlockhashValid", [c.blockhash, options()], signal),
    );
    result.heights = [];
    for (const p of [0, 1])
      result.heights.push(
        heightValue(
          await rpc.read(
            p,
            "getBlockHeight",
            [{ commitment: "confirmed" }],
            signal,
          ),
        ),
      );
    const sim = await rpc.read(
      0,
      "simulateTransaction",
      [
        c.unsignedBase64,
        {
          encoding: "base64",
          commitment: "confirmed",
          sigVerify: false,
          replaceRecentBlockhash: false,
          minContextSlot: safeNumber(c.minSlot),
          accounts: {
            encoding: "base64",
            addresses: [INTENT.payer, INTENT.owner, INTENT.ata, INTENT.mint],
          },
        },
      ],
      signal,
    );
    c.unsignedSimulation = inspectUnsignedSimulation(
      sim,
      c,
      initialPair.accounts,
    );
    result.unsigned_simulation = c.unsignedSimulation;
    const final = await readPair(rpc, FUNDING_ADDRESSES, signal, c.minSlot);
    result.final_slots = final.slots;
    if (JSON.stringify(final.accounts) !== JSON.stringify(initialPair.accounts))
      throw Error(
        "Funding/mint/owner/ATA/wholeRent changed during staging; no signing.",
      );
    c.checkedAt = Date.now();
    c.expiresAt = Math.min(c.checkedAt + 30000, c.startedAt + 60000);
    c.ready = true;
    assertFreshContext(c);
    const path = "artifacts/owner-funding-final-2026-11-02/context.json",
      out = openSync(path, "wx", 0o600);
    try {
      writeFileSync(out, JSON.stringify(c, null, 2) + "\n");
      fsyncSync(out);
    } finally {
      closeSync(out);
    }
    const parentFD = openSync(root, "r");
    try {
      fsyncSync(parentFD);
    } finally {
      closeSync(parentFD);
    }
    journal.event("prepared", {
      messageHash: c.messageHash,
      expiresAt: c.expiresAt,
      budget: c.budget,
    });
    result.context = c;
    result.outcome =
      "unsigned_funding_staged_for_authorized_immediate_execution";
  } else {
    c = JSON.parse(
      readFileSync(
        "artifacts/owner-funding-final-2026-11-02/context.json",
        "utf8",
      ),
    );
    assertFreshContext(c);
    rpc.begin("funding-stage2-explicit-release");
    result.execution = await executeStagedFunding(c, {
      journal,
      revalidate: async (original) => {
        assertFreshContext(original);
        const fresh = await readPair(
          rpc,
          FUNDING_ADDRESSES,
          signal,
          original.minSlot,
        );
        inspectFundingAccounts(fresh.accounts);
        if (
          JSON.stringify(fresh.accounts) !== JSON.stringify(original.accounts)
        )
          throw Error("Original funding state changed; no signature.");
        for (const p of [0, 1])
          validContext(
            await rpc.read(
              p,
              "isBlockhashValid",
              [c.blockhash, options()],
              signal,
            ),
          );
        for (const p of [0, 1])
          if (
            feeValue(
              await rpc.read(
                p,
                "getFeeForMessage",
                [
                  Buffer.from(c.messageHex, "hex").toString("base64"),
                  options(),
                ],
                signal,
              ),
            ) !== c.budget.networkFeeLamports
          )
            throw Error("Exact-message fee changed.");
        for (const p of [0, 1])
          heightValue(
            await rpc.read(
              p,
              "getBlockHeight",
              [{ commitment: "confirmed" }],
              signal,
            ),
          );
        assertFreshContext(c);
      },
      sendOnce: async (packet, signature) => {
        pendingPacket = packet;
        pendingSignature = signature;
        result.actualSignatureCreated = true;
        const response = await finiteFetch(DEVNET_ENDPOINTS[0], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "funding-single-submit",
            method: "sendTransaction",
            params: [
              packet.toString("base64"),
              {
                encoding: "base64",
                skipPreflight: false,
                preflightCommitment: "confirmed",
                maxRetries: 0,
                minContextSlot: safeNumber(c.minSlot),
              },
            ],
          }),
        });
        const data = exactJson(await response.text());
        if (
          !response.ok ||
          data.id !== "funding-single-submit" ||
          data.error ||
          data.result !== signature
        )
          throw Error(
            "Uncertain send response; reconcile exactsignature only.",
          );
        return data.result;
      },
    });
    result.outcome = result.execution.state;
  }
} catch (error) {
  stopReason ??= String(error?.message ?? "Funding stage blocked.");
  result.outcome =
    mode === "stage"
      ? "blocked_no_signature_or_submission_in_stage1"
      : "stage2_blocked_inspect_public_journal";
  result.blocker = stopReason;
  if (c) result.partial_context = c;
  try {
    journal.event("blocked", {
      reason: stopReason,
      actualRPC: result.requests.length,
    });
  } catch {}
} finally {
  if (mode === "execute") {
    const base = "artifacts/owner-funding-execution";
    result.signingClaimPersisted = existsSync(base + "/sign-once.marker");
    result.signaturePersisted = existsSync(base + "/signature.json");
    result.submissionClaimPersisted = existsSync(base + "/submit-once.marker");
    result.actualSignatureCreated = result.signaturePersisted
      ? true
      : result.signingClaimPersisted
        ? "unknown_signing_claimed_signature_not_durable"
        : false;
    if (result.signaturePersisted)
      result.publicSignature = JSON.parse(
        readFileSync(base + "/signature.json", "utf8"),
      ).signature;
  }
  result.stop_reason = stopReason;
  result.completed_at_utc = new Date().toISOString();
  result.actual_RPC_requests = result.requests.length;
  result.min_observed_spacing_ms =
    result.requests.length > 1
      ? Math.min(
          ...result.requests.slice(1).map((e) => e.previous_forward_gap_ms),
        )
      : null;
  result.measurements = rpc.measurements();
  result.processes_after = processes();
  result.processes_unchanged =
    JSON.stringify(result.processes_before) ===
    JSON.stringify(result.processes_after);
  writeFileSync(
    root + `/${mode}-results.json`,
    JSON.stringify(result, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      mode,
      outcome: result.outcome,
      actualRPC: result.actual_RPC_requests,
      stop_reason: stopReason,
      actualSignatureCreated: result.actualSignatureCreated,
      actualSubmissionAttempted: result.actualSubmissionAttempted,
      processes_unchanged: result.processes_unchanged,
    }),
  );
}
