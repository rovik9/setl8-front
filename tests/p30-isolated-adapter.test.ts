// @vitest-environment node
// Mock HTTP request/response contract only. No actual service, cookie jar, RPC, wallet or SDK compilation.
import { expect, it, vi } from "vitest";
import { IsolatedPurchaseAdapter } from "../src/purchase/isolated/adapter";
import { P30_PROFILE } from "../src/purchase/isolated/profile";
import {
  P30_RELEASE,
  assertReleaseMapping,
  assertPreparedRelease,
  verifyDescriptorBytes,
} from "../src/purchase/isolated/identity";
import {
  describePreWalletAttempt,
  validatePreWalletAcknowledgment,
} from "../src/purchase/isolated/handshake";
import browser from "../src/purchase/p30-artifact.json";
import installed from "../interfaces/p30-unsigned-sdk-pin.json";
import descriptor from "../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
import {
  createPurchaseFixtures,
  fixtureId,
  fixtureWallets,
} from "../src/purchase/consumer/fixtures";
import { keyHex, type PurchaseScope } from "../src/purchase/consumer/runtime";
const now = 1800000000000,
  csrf = "ab".repeat(32),
  signal = () => new AbortController().signal;
const fixtureScope = (wallet = fixtureWallets[0]): PurchaseScope => ({
  wallet,
  deploymentId: P30_PROFILE.deployment,
  sessionEpoch: 1,
  evidencePurpose: "synthetic_test",
});
function mockObservation(raw: unknown): any {
  // Explicitly manufactured chain_observation DTO labels. No authenticity or actual-gateway claim.
  const v = structuredClone(raw) as any;
  function walk(x: any) {
    if (!x || typeof x !== "object") return;
    if (x.evidence_purpose) x.evidence_purpose = "chain_observation";
    if (x.corroboration) x.corroboration = "two_approved_rpc_sources";
    if (x.sdk_artifact_sha256)
      x.sdk_artifact_sha256 = P30_RELEASE.source_archive_sha256;
    for (const y of Object.values(x)) walk(y);
  }
  walk(v);
  return v;
}
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const session = (wallet = fixtureWallets[0]) => ({
  api_version: "1",
  wallet,
  wallet_hex: keyHex(wallet),
  expires_unix_s: String(now / 1000 + 3600),
  csrf_token: csrf,
  admin_read: false,
  trading_authority: "actual_trader_signature_per_intent",
  lifecycle_application: "operator_only",
});
async function setup() {
  const f = createPurchaseFixtures(() => BigInt(now) * 1000000n),
    calls: { url: string; init: RequestInit }[] = [];
  let wallet = fixtureWallets[0],
    origin = P30_PROFILE.browserOrigin as string;
  let custom:
    | ((
        url: URL,
        init: RequestInit,
      ) => Promise<Response> | Response | undefined)
    | undefined;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)),
      options = init!;
    calls.push({ url: url.href, init: options });
    expect(url.origin).toBe(P30_PROFILE.api);
    const override = custom?.(url, options);
    if (override) return await override;
    if (url.pathname === "/v1/auth/session") return json(session(wallet));
    if (url.pathname === "/v1/auth/logout") {
      expect(options.method).toBe("POST");
      expect(new Headers(options.headers).get("X-Setl8-Csrf")).toBe(csrf);
      return json({ api_version: "1", logged_out: true });
    }
    const s = fixtureScope(wallet);
    if (url.pathname === "/v1/purchase-catalog") {
      expect([...url.searchParams]).toEqual([
        ["deployment_id", P30_PROFILE.deployment],
      ]);
      return json(mockObservation(await f.transport.catalog(s, signal())));
    }
    if (url.pathname === "/v1/owned-accounts")
      return json(mockObservation(await f.transport.owned(s, null, signal())));
    if (url.pathname === "/v1/purchases")
      return json(
        mockObservation(await f.transport.purchases(s, null, signal())),
      );
    if (url.pathname.startsWith("/v1/purchases/"))
      return json(
        mockObservation(
          await f.transport.status(
            s,
            url.pathname.split("/").at(-1)!,
            signal(),
          ),
        ),
      );
    if (url.pathname.startsWith("/v1/owned-accounts/"))
      return json(
        mockObservation(
          await f.transport.account(
            s,
            url.pathname.split("/").at(-1)!,
            signal(),
          ),
        ),
      );
    throw Error("Unexpected mock route");
  });
  const a = new IsolatedPurchaseAdapter({
    kind: "explicit_mock_http_contract",
    fetch,
    browserOrigin: () => origin,
    now: () => now,
  });
  const scope = await a.restore();
  return {
    a,
    f,
    scope,
    calls,
    fetch,
    setWallet: (v: string) => {
      wallet = v;
    },
    setOrigin: (v: string) => {
      origin = v;
    },
    override: (v: typeof custom) => {
      custom = v;
    },
  };
}
it("default profile has no HTTP/auth/wallet/quote/preparation activation or fallback", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const a = new IsolatedPurchaseAdapter();
  await expect(a.restore()).rejects.toMatchObject({ code: "disabled" });
  await expect(
    a.transport.quote(fixtureScope(), {} as any, signal()),
  ).rejects.toMatchObject({ code: "action_gate_disabled" });
  await expect(
    a.transport.prepareAttempt(fixtureScope(), {} as any, signal()),
  ).rejects.toMatchObject({ code: "action_gate_disabled" });
  expect(fetch).not.toHaveBeenCalled();
  expect(a.getSnapshot().phase).toBe("disabled");
  expect(Object.values(P30_PROFILE.actions)).toEqual(Array(7).fill(false));
  a.dispose();
});
it("maps source release to browser npm/version/profile/descriptor exactly without substitutions", async () => {
  const { a, f } = await setup();
  const catalog = mockObservation(
    await f.transport.catalog(fixtureScope(), signal()),
  );
  expect(() => assertReleaseMapping(catalog.deployment)).not.toThrow();
  expect(() =>
    assertPreparedRelease(catalog.deployment, browser),
  ).not.toThrow();
  await expect(verifyDescriptorBytes()).resolves.toBeUndefined();
  for (const k of Object.keys(P30_RELEASE)) {
    const changed = { ...browser, [k]: "wrong" };
    expect(() => assertReleaseMapping(catalog.deployment, changed)).toThrow();
    expect(() =>
      assertReleaseMapping(catalog.deployment, browser, {
        ...installed,
        [k]: "wrong",
      }),
    ).toThrow();
    expect(() => assertPreparedRelease(catalog.deployment, changed)).toThrow();
  }
  for (const [key, value] of [
    ["sdk_artifact_sha256", P30_RELEASE.npm_sha256],
    ["sdk_release", "0.1.0-dev.4"],
    ["sdk_profile", "setl8-sdk-dev-v1"],
    ["compatibility", "awaiting_review"],
  ])
    expect(() =>
      assertReleaseMapping({ ...catalog.deployment, [key]: value }),
    ).toThrow();
  a.dispose();
});
it("exact mocked session and read requests bind chain scope to authenticated wallet/epoch", async () => {
  const { a, scope, calls } = await setup();
  expect(scope).toMatchObject({
    wallet: fixtureWallets[0],
    evidencePurpose: "chain_observation",
    sessionEpoch: 1,
  });
  await a.transport.catalog(scope, signal());
  await a.transport.owned(scope, null, signal());
  await a.transport.purchases(scope, null, signal());
  expect(calls.map((c) => c.url)).toEqual([
    P30_PROFILE.api + "/v1/auth/session",
    P30_PROFILE.api +
      "/v1/purchase-catalog?deployment_id=p30-devnet-rehearsal-v1",
    P30_PROFILE.api +
      "/v1/owned-accounts?deployment_id=p30-devnet-rehearsal-v1&limit=25",
    P30_PROFILE.api +
      "/v1/purchases?deployment_id=p30-devnet-rehearsal-v1&limit=25",
  ]);
  for (const { init } of calls) {
    expect(init).toMatchObject({
      credentials: "include",
      redirect: "error",
      cache: "no-store",
      mode: "cors",
      method: "GET",
    });
    expect(new Headers(init.headers).has("Cookie")).toBe(false);
    expect(new Headers(init.headers).has("Origin")).toBe(false);
    expect(new Headers(init.headers).has("X-Setl8-Csrf")).toBe(false);
  }
  expect(JSON.stringify(a.getSnapshot())).not.toContain(csrf);
  a.dispose();
});
it.each(["wallet", "hex", "expiry", "csrf", "extra", "admin"])(
  "rejects malformed mocked session %s before accepting a scope",
  async (field) => {
    const { a, override } = await setup();
    override((url) => {
      if (url.pathname !== "/v1/auth/session") return;
      const v: any = session();
      if (field === "wallet") v.wallet = "bad";
      if (field === "hex") v.wallet_hex = fixtureId(555);
      if (field === "expiry") v.expires_unix_s = "1";
      if (field === "csrf") v.csrf_token = "bad";
      if (field === "extra") v.extra = true;
      if (field === "admin") v.admin_read = true;
      return json(v);
    });
    await expect(a.restore()).rejects.toThrow();
    expect(a.getSnapshot().scope).toBeNull();
    expect(a.getSnapshot().data.catalog).toBeNull();
    a.dispose();
  },
);
it("pre-wallet request description maps only to durable public-context endpoint with exact fields and CSRF; gate never sends", async () => {
  const { a, f, scope, calls } = await setup();
  const q: any = await f.transport.quote(
    fixtureScope(),
    {
      deployment_id: P30_PROFILE.deployment,
      request_id: fixtureId(1),
      tier_index: "0",
      mint: descriptor.usdcMint,
    },
    signal(),
  );
  const request = {
    deployment_id: P30_PROFILE.deployment,
    request_id: fixtureId(2),
    quote_id: q.quote_id,
    message_sha256: fixtureId(3),
    expected_account: q.expected_account,
    recent_blockhash: "11111111111111111111111111111111",
    last_valid_block_height: "999",
  };
  const plan = describePreWalletAttempt(scope, request, csrf);
  expect(plan.url).toBe(P30_PROFILE.api + "/v1/purchase-attempts");
  expect(plan.method).toBe("POST");
  expect(JSON.parse(plan.body)).toEqual(request);
  expect(plan.semantics).toBe(
    "durable_public_context_before_wallet_prompt_or_send",
  );
  expect(plan.headers["X-Setl8-Csrf"]).toBe(csrf);
  const ack = mockObservation(
    await f.transport.prepareAttempt(fixtureScope(), request, signal()),
  );
  expect(
    validatePreWalletAcknowledgment(ack, scope, request).purchase.submission
      .state,
  ).toBe("prepared");
  for (const field of ["recent_blockhash", "last_valid_block_height"]) {
    const changed = structuredClone(ack);
    changed.purchase[field] =
      field === "recent_blockhash" ? fixtureWallets[1] : "1000";
    expect(() =>
      validatePreWalletAcknowledgment(changed, scope, request),
    ).toThrow();
  }
  const count = calls.length;
  await expect(
    a.transport.prepareAttempt(scope, request, signal()),
  ).rejects.toMatchObject({ code: "action_gate_disabled" });
  expect(calls).toHaveLength(count);
  a.dispose();
});
it("logout clears session/views/requests before acknowledgment and uses isolated CSRF only", async () => {
  const { a, scope, calls, override } = await setup();
  await a.transport.catalog(scope, signal());
  let release!: (r: Response) => void;
  const held = new Promise<Response>((r) => (release = r));
  override((url) => (url.pathname === "/v1/auth/logout" ? held : undefined));
  const p = a.logout();
  expect(a.getSnapshot()).toMatchObject({
    phase: "revocation_pending",
    scope: null,
    data: { catalog: null, owned: null },
  });
  const last = calls.at(-1)!;
  expect(last.url).toBe(P30_PROFILE.api + "/v1/auth/logout");
  expect(last.init.method).toBe("POST");
  expect(last.init.body).toBe("{}");
  expect(new Headers(last.init.headers).get("X-Setl8-Csrf")).toBe(csrf);
  release(json({ api_version: "1", logged_out: true }));
  await p;
  expect(a.getSnapshot().phase).toBe("guest");
  await expect(a.transport.catalog(scope, signal())).rejects.toMatchObject({
    code: "session_context",
  });
  a.dispose();
});
it("lost or malformed logout acknowledgment blocks restore until explicit successful retry", async () => {
  const { a, override, calls } = await setup();
  override((url) =>
    url.pathname === "/v1/auth/logout" ? json({ api_version: "1" }) : undefined,
  );
  await expect(a.logout()).rejects.toMatchObject({
    code: "logout_acknowledgment",
  });
  const count = calls.length;
  await expect(a.restore()).rejects.toMatchObject({
    code: "revocation_pending",
  });
  expect(calls).toHaveLength(count);
  override(undefined);
  await a.logout();
  await a.restore();
  expect(a.getSnapshot().phase).toBe("authenticated");
  a.dispose();
});
it.each(["wallet", "network", "origin"])(
  "%s change clears scoped data and refuses stale reads with no fallback",
  async (change) => {
    const { a, scope, calls, setOrigin } = await setup();
    await a.transport.catalog(scope, signal());
    const count = calls.length;
    if (change === "wallet") a.walletChanged(fixtureWallets[1]);
    if (change === "network") a.networkChanged("wrong-network");
    if (change === "origin") setOrigin("http://127.0.0.1:5173");
    await expect(a.transport.catalog(scope, signal())).rejects.toThrow();
    expect(a.getSnapshot().scope).toBeNull();
    expect(a.getSnapshot().data.catalog).toBeNull();
    expect(calls).toHaveLength(count);
    a.dispose();
  },
);
it("delayed reads cannot repopulate after wallet/session change", async () => {
  const { a, scope, f, override } = await setup();
  let release!: (r: Response) => void;
  const held = new Promise<Response>((r) => (release = r));
  override((url) => (url.pathname === "/v1/owned-accounts" ? held : undefined));
  const p = a.transport.owned(scope, null, signal());
  const rejected = expect(p).rejects.toMatchObject({ code: "cancelled" });
  a.walletChanged(fixtureWallets[1]);
  release(
    json(
      mockObservation(await f.transport.owned(fixtureScope(), null, signal())),
    ),
  );
  await rejected;
  expect(a.getSnapshot().data.owned).toBeNull();
  a.dispose();
});
it("later read wins and cancelled earlier completion cannot overwrite it", async () => {
  const { a, scope, f, override } = await setup();
  let release!: (r: Response) => void;
  let n = 0;
  const held = new Promise<Response>((r) => (release = r));
  const old = mockObservation(
      await f.transport.owned(fixtureScope(), null, signal()),
    ),
    newer = structuredClone(old);
  newer.read_cutoff.revision = "2";
  override((url) =>
    url.pathname === "/v1/owned-accounts"
      ? ++n === 1
        ? held
        : json(newer)
      : undefined,
  );
  const first = a.transport.owned(scope, null, signal());
  const rejected = expect(first).rejects.toMatchObject({ code: "cancelled" });
  await a.transport.owned(scope, null, signal());
  release(json(old));
  await rejected;
  expect(a.getSnapshot().data.owned!.read_cutoff.revision).toBe("2");
  a.dispose();
});
it.each([401, 404, 409, 410, 503])(
  "HTTP %s has a bounded explicit state, never empty-data success",
  async (status) => {
    const { a, scope, override } = await setup();
    override((url) =>
      url.pathname === "/v1/owned-accounts"
        ? json(
            { api_version: "1", error: { code: "mock", message: "hidden" } },
            status,
          )
        : undefined,
    );
    await expect(
      a.transport.owned(scope, null, signal()),
    ).rejects.toMatchObject({
      status,
      code:
        status === 401
          ? "session_expired"
          : status === 404
            ? "service_prerequisite"
            : status === 409 || status === 410
              ? "resync"
              : "service_unavailable",
    });
    expect(a.getSnapshot().data.owned).toBeNull();
    if (status === 401) expect(a.getSnapshot().scope).toBeNull();
    a.dispose();
  },
);
it("opaque pages stay on one cutoff; cursor replay, foreign cursor and changed cutoff refuse", async () => {
  const { a, scope, f, override, calls } = await setup();
  const first = mockObservation(
    await f.transport.owned(fixtureScope(), null, signal()),
  );
  first.has_more = true;
  first.next_cursor = "opaque /+?&cursor";
  const second = structuredClone(first);
  second.has_more = false;
  second.next_cursor = null;
  override((url) =>
    url.pathname === "/v1/owned-accounts"
      ? json(url.searchParams.has("cursor") ? second : first)
      : undefined,
  );
  await a.transport.owned(scope, null, signal());
  await a.transport.owned(scope, first.next_cursor, signal());
  expect(new URL(calls.at(-1)!.url).searchParams.get("cursor")).toBe(
    first.next_cursor,
  );
  await expect(
    a.transport.owned(scope, first.next_cursor, signal()),
  ).rejects.toMatchObject({ code: "cursor_context" });
  await expect(
    a.transport.owned(scope, "foreign", signal()),
  ).rejects.toMatchObject({ code: "cursor_context" });
  await a.transport.owned(scope, null, signal());
  second.read_cutoff.revision = "2";
  await expect(
    a.transport.owned(scope, first.next_cursor, signal()),
  ).rejects.toMatchObject({ code: "resync" });
  expect(a.getSnapshot().data.owned).toBeNull();
  a.dispose();
});
it("page continuation stops before an eleventh request and fresh read obtains a new cutoff", async () => {
  const { a, scope, f, override, calls } = await setup();
  const base = mockObservation(
    await f.transport.owned(fixtureScope(), null, signal()),
  );
  let n = 0;
  override((url) => {
    if (url.pathname !== "/v1/owned-accounts") return;
    const p = structuredClone(base);
    p.has_more = true;
    p.next_cursor = "cursor-" + ++n;
    return json(p);
  });
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const p: any = await a.transport.owned(scope, cursor, signal());
    cursor = p.next_cursor;
  }
  const count = calls.length;
  await expect(
    a.transport.owned(scope, cursor, signal()),
  ).rejects.toMatchObject({ code: "page_bound" });
  expect(calls).toHaveLength(count);
  await expect(a.transport.owned(scope, null, signal())).resolves.toBeTruthy();
  a.dispose();
});
it.each([
  "header",
  "stream",
  "type",
  "redirect",
  "corroboration",
  "synthetic",
  "wrong_release",
  "extra",
])("bounded mock HTTP rejects %s response", async (kind) => {
  const { a, scope, f, override } = await setup();
  const payload = mockObservation(
    await f.transport.catalog(fixtureScope(), signal()),
  );
  if (kind === "corroboration")
    payload.snapshot.corroboration = "synthetic_fixture";
  if (kind === "synthetic") payload.evidence_purpose = "synthetic_test";
  if (kind === "wrong_release")
    payload.deployment.sdk_artifact_sha256 = P30_RELEASE.npm_sha256;
  if (kind === "extra") payload.internal_provenance = true;
  override((url) => {
    if (url.pathname !== "/v1/purchase-catalog") return;
    if (kind === "header")
      return new Response("{}", {
        headers: {
          "content-type": "application/json",
          "content-length": "262145",
        },
      });
    if (kind === "stream")
      return new Response("x".repeat(262145), {
        headers: { "content-type": "application/json" },
      });
    if (kind === "type")
      return new Response("<html>not data</html>", {
        headers: { "content-type": "text/html" },
      });
    const r = json(payload);
    if (kind === "redirect")
      Object.defineProperty(r, "url", {
        value: "http://127.0.0.1:8788/v1/purchase-catalog",
      });
    return r;
  });
  await expect(a.transport.catalog(scope, signal())).rejects.toThrow();
  expect(a.getSnapshot().data.catalog).toBeNull();
  a.dispose();
});
it("aborted and hung mocked HTTP never apply late results", async () => {
  const { a, scope, override, calls } = await setup();
  const aborted = new AbortController();
  aborted.abort();
  const count = calls.length;
  await expect(
    a.transport.owned(scope, null, aborted.signal),
  ).rejects.toMatchObject({ code: "cancelled" });
  expect(calls).toHaveLength(count);
  a.dispose();
  const fetch = vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith("/v1/auth/session")
      ? json(session())
      : await new Promise<Response>(() => {}),
  );
  const timed = new IsolatedPurchaseAdapter({
    kind: "explicit_mock_http_contract",
    fetch,
    browserOrigin: () => P30_PROFILE.browserOrigin,
    now: () => now,
    timeoutMs: 10,
  });
  const s = await timed.restore();
  await expect(timed.transport.owned(s, null, signal())).rejects.toMatchObject({
    code: "timeout",
  });
  expect(timed.getSnapshot().data.owned).toBeNull();
  timed.dispose();
});

it("rejects a foreign wallet or epoch before any authenticated read", async () => {
  const { a, scope, calls } = await setup();
  const count = calls.length;
  for (const changed of [
    { ...scope, wallet: fixtureWallets[1] },
    { ...scope, sessionEpoch: scope.sessionEpoch + 1 },
    { ...scope, evidencePurpose: "synthetic_test" as const },
  ])
    await expect(
      a.transport.owned(changed, null, signal()),
    ).rejects.toMatchObject({ code: "session_context" });
  expect(calls).toHaveLength(count);
  a.dispose();
});
it("owned/status/detail paths and public identities are checked independently", async () => {
  const { a, scope, f, calls, override } = await setup(),
    s = fixtureScope();
  const q: any = await f.transport.quote(
    s,
    {
      deployment_id: P30_PROFILE.deployment,
      request_id: fixtureId(70),
      tier_index: "0",
      mint: descriptor.usdcMint,
    },
    signal(),
  );
  const ack: any = await f.transport.prepareAttempt(
    s,
    {
      deployment_id: P30_PROFILE.deployment,
      request_id: fixtureId(71),
      quote_id: q.quote_id,
      message_sha256: fixtureId(72),
      expected_account: q.expected_account,
      recent_blockhash: "11111111111111111111111111111111",
      last_valid_block_height: "999",
    },
    signal(),
  );
  for (let i = 0; i < 3; i++)
    await f.transport.status(s, ack.purchase.purchase_id, signal());
  const history: any = await a.transport.purchases(scope, null, signal());
  expect(history.rows).toHaveLength(1);
  const owned: any = await a.transport.owned(scope, null, signal());
  expect(owned.rows[0].account_size_micro_usd).toBe("2500000000");
  const status: any = await a.transport.status(
    scope,
    ack.purchase.purchase_id,
    signal(),
  );
  expect(status.purchase_id).toBe(ack.purchase.purchase_id);
  const account: any = await a.transport.account(
    scope,
    q.expected_account,
    signal(),
  );
  expect(account.row.trader).toBe(scope.wallet);
  expect(calls.at(-1)!.url).toBe(
    P30_PROFILE.api +
      "/v1/owned-accounts/" +
      q.expected_account +
      "?deployment_id=" +
      P30_PROFILE.deployment,
  );
  override((url) => {
    if (url.pathname !== "/v1/owned-accounts") return;
    const v = structuredClone(owned);
    v.wallet = fixtureWallets[1];
    return json(v);
  });
  await expect(a.transport.owned(scope, null, signal())).rejects.toThrow();
  expect(a.getSnapshot().scope).toBeNull();
  expect(a.getSnapshot().data.owned).toBeNull();
  await a.logout();
  const refreshed = await a.restore();
  override((url) => {
    if (url.pathname !== "/v1/purchases") return;
    const v = structuredClone(history);
    v.rows[0].deployment.sdk_artifact_sha256 = P30_RELEASE.npm_sha256;
    return json(v);
  });
  await expect(
    a.transport.purchases(refreshed, null, signal()),
  ).rejects.toThrow();
  a.dispose();
});
it("pre-wallet description refuses nullable block/expiry despite permissive historical DTO", async () => {
  const { a, scope } = await setup();
  const request = {
    deployment_id: P30_PROFILE.deployment,
    request_id: fixtureId(1),
    quote_id: fixtureId(2),
    message_sha256: fixtureId(3),
    expected_account: fixtureId(4),
    recent_blockhash: "11111111111111111111111111111111",
    last_valid_block_height: "999",
  };
  for (const changed of [
    { ...request, recent_blockhash: null },
    { ...request, last_valid_block_height: null },
  ])
    expect(() => describePreWalletAttempt(scope, changed, csrf)).toThrow();
  a.dispose();
});

it("401 clears authenticated scope even when its unused body headers are malformed", async () => {
  const { a, scope, override } = await setup();
  override((url) =>
    url.pathname === "/v1/owned-accounts"
      ? new Response("not json", {
          status: 401,
          headers: { "content-length": "invalid" },
        })
      : undefined,
  );
  await expect(a.transport.owned(scope, null, signal())).rejects.toMatchObject({
    status: 401,
    code: "session_expired",
  });
  expect(a.getSnapshot().scope).toBeNull();
  a.dispose();
});
