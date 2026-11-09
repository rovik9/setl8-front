// @vitest-environment node
import { it, expect, vi } from "vitest";
import bs58 from "bs58";
import { exactTokenAmount } from "../src/purchase/consumer/display";
import {
  PurchaseClient,
  disabledPurchaseTransport,
  type PurchaseTransport,
} from "../src/purchase/consumer/client";
import {
  parsePurchase,
  keyHex,
  type PurchaseScope,
} from "../src/purchase/consumer/runtime";
import {
  createPurchaseFixtures,
  fixtureWallets,
  fixtureId,
} from "../src/purchase/consumer/fixtures";
const now = 1800000000000000000n;
const scope = (epoch = 1, wallet = fixtureWallets[0]): PurchaseScope => ({
  wallet,
  sessionEpoch: epoch,
  deploymentId: "p30-devnet-rehearsal-v1",
  evidencePurpose: "synthetic_test",
});
const signal = () => new AbortController().signal;
async function ready() {
  let time = now;
  const f = createPurchaseFixtures(() => time),
    c = new PurchaseClient(scope(), f.transport, () => time);
  await c.initialize();
  const o = c.getSnapshot().catalog!.offers[0];
  await c.requestQuote(o.tier_index, o.charge.mint.address, fixtureId(1));
  return {
    f,
    c,
    setTime: (n: bigint) => {
      time = n;
    },
  };
}
const record = (c: PurchaseClient, id = 2) =>
  c.recordAttempt(
    fixtureId(id),
    {
      recentBlockhash: "11111111111111111111111111111111",
      lastValidBlockHeight: "999",
    },
    { kind: "omitted" },
  );
it("default transport is disabled and never fetches", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw Error("No network");
  });
  const c = new PurchaseClient(scope());
  await c.initialize();
  expect(c.getSnapshot().error).toContain("not enabled");
  expect(fetch).not.toHaveBeenCalled();
  c.dispose();
});
it("exact checked charge and purpose survive bounded parsing", async () => {
  const f = createPurchaseFixtures(() => now);
  const raw = await f.transport.catalog(scope(), signal());
  const p = parsePurchase("catalog", raw, scope());
  expect(p.offers[0].charge.total_token_debit_atoms).toBe("30120000");
  expect(Object.isFrozen(p.offers)).toBe(true);
  expect(p.evidence_purpose).toBe("synthetic_test");
});
it.each([
  "total",
  "numeric",
  "unknown",
  "mint",
  "scope",
  "purpose",
  "oversized",
  "getters",
  "cycle",
  "offers",
  "ruleset",
])("runtime rejects unsafe DTO: %s", async (kind) => {
  const f = createPurchaseFixtures(() => now),
    raw: any = structuredClone(await f.transport.catalog(scope(), signal()));
  if (kind === "ruleset")
    raw.offers[0].ruleset_address = raw.deployment.lev_program;
  if (kind === "total")
    raw.offers[0].charge.total_token_debit_atoms = "30120001";
  if (kind === "numeric") raw.offers[0].account_size_micro_usd = 25000000000;
  if (kind === "unknown") raw.extra = true;
  if (kind === "mint")
    raw.offers[0].charge.mint.address = raw.deployment.lev_program;
  if (kind === "scope")
    raw.deployment.genesis_hash = raw.deployment.lev_program;
  if (kind === "purpose") raw.evidence_purpose = "chain_observation";
  if (kind === "oversized") raw.format = "a".repeat(270000);
  if (kind === "getters")
    Object.defineProperty(raw, "format", {
      get() {
        throw Error("getter executed");
      },
    });
  if (kind === "cycle") raw.loop = raw;
  if (kind === "offers") raw.offers = Array(21).fill(raw.offers[0]);
  expect(() => parsePurchase("catalog", raw, scope())).toThrow();
});
it("quote address/hex identity and wallet are bound independently", async () => {
  const { c } = await ready(),
    q = structuredClone(c.getSnapshot().quote!);
  expect(q.expected_account).toBe(keyHex(q.expected_account_address));
  q.expected_account = "00".repeat(32);
  expect(() => parsePurchase("quote", q, scope())).toThrow();
  q.expected_account = keyHex(q.expected_account_address);
  expect(() =>
    parsePurchase("quote", q, scope(1, fixtureWallets[1])),
  ).toThrow();
  c.dispose();
});
it("scope change discards delayed catalogue and private quote/preparation", async () => {
  const f = createPurchaseFixtures(() => now);
  let release!: (x: unknown) => void;
  const held = new Promise((r) => (release = r));
  const c = new PurchaseClient(
    scope(),
    { ...f.transport, catalog: () => held },
    () => now,
  );
  const pending = c.initialize();
  c.setScope(scope(2, fixtureWallets[1]));
  release(await f.transport.catalog(scope(), signal()));
  await pending;
  expect(c.getSnapshot().catalog).toBeNull();
  expect(c.getSnapshot().scope.wallet).toBe(fixtureWallets[1]);
  c.dispose();
});
it("real unsigned compilation is acknowledged before any possible future wallet action", async () => {
  const { c } = await ready();
  await record(c);
  const s = c.getSnapshot();
  expect(s.error).toBeNull();
  expect(s.attempt!.purchase.submission.state).toBe("prepared");
  expect(s.prepared!.actions).toEqual({ sign: false, submit: false });
  expect(s.pendingAttempt!.message_sha256).toBe(s.prepared!.messageSha256);
  expect(s.reconcileRequired).toBe(true);
  c.dispose();
});
it("unknown/lost acknowledgment retains original identity and blocks another attempt across controller restart", async () => {
  const { f, c } = await ready();
  f.setScenario("lost_ack");
  await record(c);
  expect(c.getSnapshot().pendingAttempt!.request_id).toBe(fixtureId(2));
  expect(c.getSnapshot().reconcileRequired).toBe(true);
  await record(c, 3);
  expect(f.records.size).toBe(1);
  await c.reconcile();
  expect(c.getSnapshot().status!.submission.state).toBe("unknown");
  const restored = new PurchaseClient(scope(2), f.transport, () => now);
  await restored.initialize();
  expect(restored.getSnapshot().reconcileRequired).toBe(true);
  expect(restored.getSnapshot().prepared).toBeNull();
  expect(f.records.size).toBe(1);
  c.dispose();
  restored.dispose();
});
it("session change after asynchronous preparation prevents an attempt", async () => {
  const { f, c, setTime } = await ready();
  let release!: (x: any) => void;
  const lazy = new Promise<any>((r) => (release = r));
  const stub = { context: {}, messageSha256: "ab".repeat(32) } as any;
  const delayed = new PurchaseClient(
    scope(),
    f.transport,
    () => now,
    () => lazy,
  );
  await delayed.initialize();
  const o = delayed.getSnapshot().catalog!.offers[0];
  await delayed.requestQuote("0", o.charge.mint.address, fixtureId(4));
  const p = record(delayed, 5);
  await new Promise((r) => setTimeout(r, 0));
  delayed.setScope(scope(2, fixtureWallets[1]));
  release(stub);
  await p;
  expect(f.records.size).toBe(0);
  expect(delayed.getSnapshot().prepared).toBeNull();
  c.dispose();
  delayed.dispose();
});
it("deadline recheck after async SDK load is fail closed", async () => {
  let clock = now;
  const f = createPurchaseFixtures(() => clock);
  let release!: (x: any) => void;
  const lazy = new Promise<any>((r) => (release = r));
  const c = new PurchaseClient(
    scope(),
    f.transport,
    () => clock,
    () => lazy,
  );
  await c.initialize();
  await c.requestQuote(
    "0",
    c.getSnapshot().catalog!.offers[0].charge.mint.address,
    fixtureId(1),
  );
  const p = record(c);
  await new Promise((r) => setTimeout(r, 0));
  clock += 120000000000n;
  release({ messageSha256: "ab".repeat(32) });
  await p;
  expect(f.records.size).toBe(0);
  expect(c.getSnapshot().error).toContain("expired");
  c.dispose();
});
it("partial discovery is not an empty wallet", async () => {
  const f = createPurchaseFixtures(() => now);
  f.setScenario("partial");
  const c = new PurchaseClient(scope(), f.transport, () => now);
  await c.initialize();
  await c.loadOwned();
  expect(c.getSnapshot().historyIncomplete).toBe(true);
  expect(c.getSnapshot().owned!.rows).toEqual([]);
  expect(c.getSnapshot().owned!.coverage.discovery).toBe("partial");
  c.dispose();
});
it("quote mismatch does not erase independently reported ownership and evaluator readiness stays separate", async () => {
  const { f, c } = await ready();
  f.setScenario("mismatch");
  await record(c);
  for (let i = 0; i < 3; i++) await c.refreshStatus();
  await c.loadOwned();
  const s = c.getSnapshot();
  expect(s.status!.verification.quote_match).toBe("different");
  expect(s.status!.verification.actual_charge!.total_token_debit_atoms).toBe(
    "31124000",
  );
  expect(s.owned!.rows).toHaveLength(1);
  expect(s.owned!.rows[0].evaluator.registration).toBe("absent");
  expect(s.owned!.rows[0].terminal_admission.enabled).toBe(false);
  await c.openAccount(s.owned!.rows[0].account);
  expect(c.getSnapshot().account!.row.account).toBe(s.owned!.rows[0].account);
  c.dispose();
});
it("wrong fixed cutoff cannot append account pages", async () => {
  const { f, c } = await ready();
  await record(c);
  for (let i = 0; i < 3; i++) await c.refreshStatus();
  const first: any = await f.transport.owned(scope(), null, signal());
  first.next_cursor = "opaque";
  first.has_more = true;
  const second = structuredClone(first);
  second.rows = [];
  second.next_cursor = null;
  second.has_more = false;
  second.read_cutoff.revision = "2";
  const pager = new PurchaseClient(
    scope(),
    { ...f.transport, owned: async (_s, cursor) => (cursor ? second : first) },
    () => now,
  );
  await pager.loadOwned();
  await pager.loadOwned(true);
  expect(pager.getSnapshot().owned!.rows).toHaveLength(1);
  expect(pager.getSnapshot().error).toContain("cutoff changed");
  pager.dispose();
  c.dispose();
});
it("hung requests time out and can never enable payment", async () => {
  const c = new PurchaseClient(
    scope(),
    {
      ...disabledPurchaseTransport,
      catalog: () => new Promise(() => {}),
      purchases: () => new Promise(() => {}),
    },
    () => now,
    undefined,
    10,
  );
  await c.initialize();
  expect(c.getSnapshot().error).toContain("timed out");
  expect(c.getSnapshot().pending).toEqual([]);
  expect(c.getSnapshot().prepared).toBeNull();
  c.dispose();
});

it("changing selection invalidates a pending quote", async () => {
  const { c } = await ready();
  expect(c.getSnapshot().quote).not.toBeNull();
  c.invalidateQuote();
  expect(c.getSnapshot().quote).toBeNull();
  expect(c.getSnapshot().prepared).toBeNull();
  c.dispose();
});

it("older quote completion cannot replace the later selected offer", async () => {
  const f = createPurchaseFixtures(() => now);
  let release!: (v: unknown) => void;
  const held = new Promise((r) => (release = r));
  const c = new PurchaseClient(
    scope(),
    {
      ...f.transport,
      quote: (s, request, signal) =>
        request.tier_index === "0"
          ? held
          : f.transport.quote(s, request, signal),
    },
    () => now,
  );
  await c.initialize();
  const mint = c.getSnapshot().catalog!.offers[0].charge.mint.address;
  const older = c.requestQuote("0", mint, fixtureId(21));
  await c.requestQuote("1", mint, fixtureId(22));
  release(
    await f.transport.quote(
      scope(),
      {
        deployment_id: scope().deploymentId,
        request_id: fixtureId(21),
        tier_index: "0",
        mint,
      },
      signal(),
    ),
  );
  await older;
  expect(c.getSnapshot().quote!.offer.tier_index).toBe("1");
  expect(c.getSnapshot().quote!.request_id).toBe(fixtureId(22));
  c.dispose();
});
it("recovery pages append only at one cutoff and a missing uncertain attempt stays locked", async () => {
  const { f, c } = await ready();
  await record(c);
  const first: any = structuredClone(
    await f.transport.purchases(scope(), null, signal()),
  );
  const row = first.rows[0];
  first.rows = [];
  first.has_more = true;
  first.next_cursor = "opaque-recovery-page";
  const second = {
    ...structuredClone(first),
    rows: [row],
    has_more: false,
    next_cursor: null,
  };
  const cursors: (string | null)[] = [];
  const p = new PurchaseClient(
    scope(),
    {
      ...f.transport,
      purchases: async (_s, cursor) => {
        cursors.push(cursor);
        return cursor ? second : first;
      },
    },
    () => now,
  );
  await p.reconcile();
  expect(p.getSnapshot().historyIncomplete).toBe(true);
  await p.reconcile(true);
  expect(cursors).toEqual([null, "opaque-recovery-page"]);
  expect(p.getSnapshot().history!.rows).toHaveLength(1);
  expect(p.getSnapshot().historyIncomplete).toBe(false);
  expect(p.getSnapshot().reconcileRequired).toBe(true);
  f.records.clear();
  await c.reconcile();
  expect(c.getSnapshot().reconcileRequired).toBe(true);
  expect(c.getSnapshot().pendingAttempt!.request_id).toBe(fixtureId(2));
  expect(c.getSnapshot().error).toContain("still unknown");
  p.dispose();
  c.dispose();
});
it("wrong acknowledgment identity preserves uncertainty without creating a replacement", async () => {
  const f = createPurchaseFixtures(() => now);
  const c = new PurchaseClient(
    scope(),
    {
      ...f.transport,
      prepareAttempt: async (s, request, signal) => {
        const a: any = structuredClone(
          await f.transport.prepareAttempt(s, request, signal),
        );
        a.purchase.expected_message_sha256 = "aa".repeat(32);
        return a;
      },
    },
    () => now,
  );
  await c.initialize();
  await c.requestQuote(
    "0",
    c.getSnapshot().catalog!.offers[0].charge.mint.address,
    fixtureId(1),
  );
  await record(c);
  expect(c.getSnapshot().error).toContain("context changed");
  expect(c.getSnapshot().reconcileRequired).toBe(true);
  expect(c.getSnapshot().attempt).toBeNull();
  await record(c, 3);
  expect(f.records.size).toBe(1);
  c.dispose();
});

it("status cannot replace an existing attempt with a different message identity", async () => {
  const f = createPurchaseFixtures(() => now);
  const c = new PurchaseClient(
    scope(),
    {
      ...f.transport,
      status: async (s, id, signal) => {
        const a: any = structuredClone(await f.transport.status(s, id, signal));
        a.expected_message_sha256 = "ee".repeat(32);
        return a;
      },
    },
    () => now,
  );
  await c.initialize();
  await c.requestQuote(
    "0",
    c.getSnapshot().catalog!.offers[0].charge.mint.address,
    fixtureId(1),
  );
  await record(c);
  const original = c.getSnapshot().status;
  await c.refreshStatus();
  expect(c.getSnapshot().status).toBe(original);
  expect(c.getSnapshot().error).toContain("context changed");
  expect(c.getSnapshot().reconcileRequired).toBe(true);
  c.dispose();
});

it.each([
  ["0", "0.00"],
  ["1", "0.000001"],
  ["10001", "0.010001"],
  ["120000", "0.12"],
  ["30120000", "30.12"],
  ["99000001", "99.000001"],
  ["18446744073709551615", "18,446,744,073,709.551615"],
])("displays exact atoms %s without rounding", (atoms, display) => {
  expect(exactTokenAmount(atoms)).toBe(display);
});
it("historical example tiers, fees and account sizes remain coherent", async () => {
  const { f, c } = await ready();
  expect(
    c
      .getSnapshot()
      .catalog!.offers.map((o) => [
        o.account_size_micro_usd,
        o.charge.tier_price_atoms,
        o.charge.total_token_debit_atoms,
      ]),
  ).toEqual([
    ["2500000000", "30000000", "30120000"],
    ["5000000000", "55000000", "55220000"],
    ["10000000000", "99000000", "99396000"],
  ]);
  await record(c);
  for (let i = 0; i < 3; i++) await c.refreshStatus();
  await c.loadOwned();
  expect(c.getSnapshot().owned!.rows[0].account_size_micro_usd).toBe(
    "2500000000",
  );
  c.dispose();
});
const altered = (v: any, field: string) => {
  if (field === "recent_blockhash") v.recent_blockhash = fixtureWallets[1];
  if (field === "last_valid_block_height") v.last_valid_block_height = "1000";
  if (field === "purchase_id") v.purchase_id = fixtureId(99999);
  if (field === "transaction_signature")
    v.transaction_signature = bs58.encode(new Uint8Array(64).fill(9));
  if (field === "signature_removed") v.transaction_signature = null;
  if (field === "request_id") v.request_id = fixtureId(88888);
  if (field === "quote_id") v.quote_id = fixtureId(77777);
  if (field === "expected_account") v.expected_account = fixtureId(66666);
  if (field === "expected_message_sha256")
    v.expected_message_sha256 = fixtureId(55555);
  return v;
};
it.each(["recent_blockhash", "last_valid_block_height"])(
  "tampered acknowledgment %s retains captured context and recovery lock",
  async (field) => {
    const f = createPurchaseFixtures(() => now);
    const c = new PurchaseClient(
      scope(),
      {
        ...f.transport,
        prepareAttempt: async (s, request, signal) => {
          const a: any = structuredClone(
            await f.transport.prepareAttempt(s, request, signal),
          );
          a.purchase = altered(a.purchase, field);
          return a;
        },
      },
      () => now,
    );
    await c.initialize();
    await c.requestQuote(
      "0",
      c.getSnapshot().catalog!.offers[0].charge.mint.address,
      fixtureId(1),
    );
    await record(c);
    expect(c.getSnapshot().attempt).toBeNull();
    expect(c.getSnapshot().pendingAttempt).toMatchObject({
      recent_blockhash: "11111111111111111111111111111111",
      last_valid_block_height: "999",
    });
    expect(Object.isFrozen(c.getSnapshot().pendingAttempt)).toBe(true);
    expect(c.getSnapshot().reconcileRequired).toBe(true);
    expect(c.getSnapshot().error).toContain("context changed");
    expect(f.records.size).toBe(1);
    c.dispose();
  },
);
it.each(["status", "recovery"] as const)(
  "%s rejects each altered captured or canonical identity",
  async (operation) => {
    for (const field of [
      "recent_blockhash",
      "last_valid_block_height",
      "purchase_id",
      "transaction_signature",
      "request_id",
      "quote_id",
      "expected_account",
      "expected_message_sha256",
    ]) {
      const f = createPurchaseFixtures(() => now);
      let tamper = false;
      const c = new PurchaseClient(
        scope(),
        {
          ...f.transport,
          status: async (s, id, signal) => {
            const v = structuredClone(await f.transport.status(s, id, signal));
            return tamper && operation === "status" ? altered(v, field) : v;
          },
          purchases: async (s, cursor, signal) => {
            const p: any = structuredClone(
              await f.transport.purchases(s, cursor, signal),
            );
            if (tamper && operation === "recovery")
              p.rows = p.rows.map((r: any) => altered(r, field));
            return p;
          },
        },
        () => now,
      );
      await c.initialize();
      await c.requestQuote(
        "0",
        c.getSnapshot().catalog!.offers[0].charge.mint.address,
        fixtureId(1),
      );
      await record(c);
      await c.refreshStatus(); // Learn canonical signature from successful supplied evidence.
      const prior = c.getSnapshot().status,
        pending = c.getSnapshot().pendingAttempt;
      tamper = true;
      if (operation === "status") await c.refreshStatus();
      else await c.reconcile();
      expect(c.getSnapshot().status, field).toBe(prior);
      expect(c.getSnapshot().pendingAttempt, field).toBe(pending);
      expect(c.getSnapshot().reconcileRequired, field).toBe(true);
      expect(c.getSnapshot().error, field).toBeTruthy();
      expect(f.records.size).toBe(1);
      c.dispose();
    }
  },
);
it("known canonical signature cannot disappear on refresh", async () => {
  const { f, c } = await ready();
  await record(c);
  await c.refreshStatus();
  const old = c.getSnapshot().status!;
  f.records.get(old.purchase_id)!.transaction_signature = null;
  await c.reconcile();
  expect(c.getSnapshot().status).toBe(old);
  expect(c.getSnapshot().reconcileRequired).toBe(true);
  c.dispose();
});
it.each([
  "commitment",
  "slot",
  "error",
  "message",
  "reference",
  "signature",
  "charge",
  "verified_account",
  "matched_message",
  "quote_match",
  "origin",
])(
  "rejects impossible success-shaped %s before presentation",
  async (field) => {
    const { c } = await ready();
    await record(c);
    for (let i = 0; i < 3; i++) await c.refreshStatus();
    const v: any = structuredClone(c.getSnapshot().status!);
    if (field === "commitment") v.chain.commitment = "confirmed";
    if (field === "slot") v.chain.slot = null;
    if (field === "error") v.chain.transaction_error_code = "failed";
    if (field === "message") v.chain.message_sha256 = null;
    if (field === "reference") v.chain.evidence_ref = null;
    if (field === "signature") v.transaction_signature = null;
    if (field === "charge") v.verification.actual_charge = null;
    if (field === "verified_account") v.verified_account = null;
    if (field === "matched_message") v.chain.message_sha256 = fixtureId(999);
    if (field === "quote_match") v.verification.quote_match = "not_checked";
    if (field === "origin") v.indexing.ownership_origin_ref = null;
    expect(() => parsePurchase("status", v, scope())).toThrow();
    c.dispose();
  },
);
it("quote mismatch blocks matching while independent indexed ownership and partial coverage stay valid", async () => {
  const { f, c } = await ready();
  f.setScenario("mismatch");
  await record(c);
  for (let i = 0; i < 3; i++) await c.refreshStatus();
  const s = c.getSnapshot().status!;
  expect(s.verification.state).toBe("blocked");
  expect(s.verified_account).toBeNull();
  expect(s.indexing.state).toBe("indexed");
  await c.loadOwned();
  const page: any = structuredClone(c.getSnapshot().owned!);
  page.coverage.discovery = "partial";
  page.coverage.missing_history = true;
  page.coverage.finalized_scanned_through_slot = null;
  expect(parsePurchase("owned", page, scope()).rows).toHaveLength(1);
  c.dispose();
});

it("origin-only indexed evidence can omit the wallet-history scan checkpoint", async () => {
  const { c } = await ready();
  await record(c);
  for (let i = 0; i < 3; i++) await c.refreshStatus();
  const value = structuredClone(c.getSnapshot().status!);
  value.indexing.finalized_scanned_through_slot = null;
  expect(parsePurchase("status", value, scope()).indexing).toMatchObject({
    state: "indexed",
    finalized_scanned_through_slot: null,
    ownership_origin_ref: "fixture_origin",
  });
  c.dispose();
});

it("origin-only indexing remains valid when actual charge parameters and quote comparison are not established", async () => {
  const { c } = await ready();
  await record(c);
  for (let i = 0; i < 3; i++) await c.refreshStatus();
  const v = structuredClone(c.getSnapshot().status!);
  v.indexing.finalized_scanned_through_slot = null;
  v.verification = {
    state: "blocked",
    reasons: ["charge_parameters_not_established"],
    actual_charge: null,
    quote_match: "not_checked",
  };
  v.verified_account = null;
  const p = parsePurchase("status", v, scope());
  expect(p.indexing.state).toBe("indexed");
  expect(p.verification.actual_charge).toBeNull();
  expect(() =>
    parsePurchase("status", { ...v, internal_provenance: true }, scope()),
  ).toThrow();
  c.dispose();
});
