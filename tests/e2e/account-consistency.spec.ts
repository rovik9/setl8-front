import { test, expect, type Page } from "@playwright/test";
import {
  demoAccount,
  demoAccounts,
  demoMarkets,
  DEMO_ACCOUNT,
  DEMO_SECOND,
} from "../../src/data/demo";
import type { AccountOverview } from "../../src/api/frontend-v1";
const root = process.env.SETL8_EVIDENCE_DIR || "artifacts/current";
const base = "http://127.0.0.1:8788";
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}
function view(version: number, account = DEMO_ACCOUNT): AccountOverview {
  const data = structuredClone(demoAccount().overview);
  data.account = account;
  data.update_cursor = `opaque/${account}/${version}`;
  data.processed_through = String(version);
  data.evaluator_state!.processed_through = String(version);
  data.evaluator_state!.balance_micro = String(
    100000000000n + BigInt(version) * 1000000n,
  );
  data.evaluator_state!.positions = [
    { ...data.evaluator_state!.positions[0], qty: String(version * 1000000) },
  ];
  data.evaluator_state!.pending = [
    { nonce: String(version), order_hex: "ab".repeat(48) },
  ];
  return data;
}
type FixtureSource = EventTarget & {
  url: string;
  closed: boolean;
  close(): void;
};
async function fixture(page: Page) {
  await page.addInitScript(() => {
    class Source extends EventTarget {
      onerror = null;
      closed = false;
      constructor(readonly url: string) {
        super();
        (window as unknown as { __sources: Source[] }).__sources.push(this);
      }
      close() {
        this.closed = true;
      }
    }
    Object.assign(window, { __sources: [], EventSource: Source });
  });
  const delayedCore = gate(),
    delayedEvidence = gate();
  const state = {
    overview: view(1),
    holdNextCore: false,
    holdEvidence: false,
    coreRequests: 0,
    legacyReads: 0,
    evidenceVersion: 1,
  };
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Credentials": "true",
  };
  await page.route(base + "/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {
      api_version: "1",
      rows: [],
      next_after: null,
      has_more: false,
    };
    let wait: Promise<void> | undefined;
    if (path === "/v1/auth/session")
      body = {
        api_version: "1",
        wallet: "MockOnlyAddress",
        wallet_hex: "11".repeat(32),
        csrf_token: "aa".repeat(32),
        admin_read: false,
        expires_unix_s: String(Math.floor(Date.now() / 1000) + 3600),
        trading_authority: "actual_trader_signature_per_intent",
        lifecycle_application: "operator_only",
      };
    else if (path === "/v1/accounts")
      body = {
        api_version: "1",
        rows: demoAccounts,
        next_after: null,
        has_more: false,
      };
    else if (path === "/v1/markets")
      body = {
        api_version: "1",
        rows: demoMarkets,
        launch_sha256: "ab".repeat(32),
        live_admission: "disabled",
        production_reorder_window_ns: null,
      };
    else if (/\/accounts\/[a-f0-9]{64}$/.test(path)) {
      state.coreRequests++;
      body = structuredClone(state.overview);
      if (state.holdNextCore) {
        state.holdNextCore = false;
        wait = delayedCore.promise;
      }
    } else if (
      path.endsWith("/positions") ||
      path.endsWith("/pending-orders")
    ) {
      state.legacyReads++;
      body = path.endsWith("/positions")
        ? demoAccount().positions
        : demoAccount().pending;
    } else if (path.endsWith("/journals")) {
      body = {
        ...demoAccount().journals,
        rows: [
          {
            ...demoAccount().journals.rows[0],
            journal_seq: String(state.evidenceVersion),
          },
        ],
      };
      if (state.holdEvidence) wait = delayedEvidence.promise;
    } else if (path.endsWith("/publication-attempts")) {
      body = {
        api_version: "1",
        next_after: null,
        has_more: false,
        rows: [
          {
            attempt_id: String(state.evidenceVersion),
            work_id: "1",
            lease_epoch: "1",
            message_sha256: "aa".repeat(32),
            message_hex: "ab".repeat(48),
            context: {
              fixture: "publication-version-" + state.evidenceVersion,
            },
            created_unix_ns: "0",
            meaning:
              "compiled_message_prepared; not signer approval or submission",
          },
        ],
      };
      if (state.holdEvidence) wait = delayedEvidence.promise;
    } else if (path.endsWith("/activity")) body = demoAccount().activity;
    if (wait) await wait;
    // A superseded client request may already have been aborted when its gate opens.
    await route
      .fulfill({ headers, body: JSON.stringify(body) })
      .catch(() => {});
  });
  const emit = async (type: string, data: unknown = {}, index = -1) =>
    page.evaluate(
      ({ type, data, index }) => {
        const source = (
          window as unknown as { __sources: FixtureSource[] }
        ).__sources.at(index);
        source?.dispatchEvent(
          new MessageEvent(type, {
            data: JSON.stringify(data),
            lastEventId:
              type === "snapshot"
                ? (data as AccountOverview).update_cursor
                : "unapplied-notice",
          }),
        );
      },
      { type, data, index },
    );
  const reconnect = async (expected: string) => {
    const before = await page.evaluate(
      () =>
        (window as unknown as { __sources: FixtureSource[] }).__sources.length,
    );
    await emit("reconnect");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __sources: FixtureSource[] }).__sources
              .length,
        ),
      )
      .toBe(before + 1);
    const url = await page.evaluate(
      () =>
        (window as unknown as { __sources: FixtureSource[] }).__sources.at(-1)!
          .url,
    );
    expect(new URL(url).searchParams.get("cursor")).toBe(expected);
    return new URL(url);
  };
  return { state, delayedCore, delayedEvidence, emit, reconnect };
}

test("a streamed snapshot supersedes delayed core reads and supplies the reconnect boundary", async ({
  page,
}, info) => {
  const f = await fixture(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/accounts");
  await expect(page.getByText("$100,001.00").first()).toBeVisible();
  f.state.overview = view(2);
  f.state.holdNextCore = true;
  await f.emit("invalidate");
  await expect.poll(() => f.state.coreRequests).toBe(2);
  f.state.overview = view(3);
  await f.emit("snapshot", f.state.overview);
  await expect(page.getByText("$100,003.00").first()).toBeVisible();
  f.delayedCore.release();
  await page.locator(".journey-evidence>summary").click();
  await f.reconnect(f.state.overview.update_cursor);
  await expect(
    page
      .getByRole("region", { name: "Scrollable account table" })
      .getByRole("cell", { name: "3", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Pending orders" }).click();
  await expect(
    page.getByRole("cell", { name: "3", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("$100,002.00")).toHaveCount(0);
  expect(f.state.legacyReads).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `${root}/screenshots/consistent-core-${info.project.name}.png`,
    fullPage: true,
  });
});

test("initial streamed snapshot invalidates publication and journal pages until independent fresh reads complete", async ({
  page,
}, info) => {
  const f = await fixture(page);
  await page.goto("/app/accounts");
  await page.locator(".journey-evidence>summary").click();
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(page.getByText("Journal #1")).toBeVisible();
  await page
    .getByText("Prepared publication attempts", { exact: true })
    .click();
  await expect(page.getByText(/publication-version-1/)).toBeVisible();
  f.state.overview = view(2);
  f.state.evidenceVersion = 2;
  f.state.holdEvidence = true;
  await f.emit("snapshot", f.state.overview);
  await expect(page.getByText("Journal #1")).toHaveCount(0);
  await expect(page.getByText(/publication-version-1/)).toHaveCount(0);
  await expect(page.getByText("Loading recorded activity…")).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Loading recorded account data" }),
  ).toBeVisible();
  await f.reconnect(f.state.overview.update_cursor);
  await page.screenshot({
    path: `${root}/screenshots/evidence-invalidated-${info.project.name}.png`,
    fullPage: true,
  });
  f.delayedEvidence.release();
  await expect(page.getByText("Journal #2")).toBeVisible();
  await expect(page.getByText(/publication-version-2/)).toBeVisible();
  await page.screenshot({
    path: `${root}/screenshots/evidence-refreshed-${info.project.name}.png`,
    fullPage: true,
  });
});

test("account switching aborts delayed reads and isolates both displayed state and reconnect cursor", async ({
  page,
}, info) => {
  const f = await fixture(page);
  await page.goto("/app/accounts");
  await expect(page.getByText("$100,001.00").first()).toBeVisible();
  f.state.overview = view(2);
  f.state.holdNextCore = true;
  await f.emit("invalidate");
  await expect.poll(() => f.state.coreRequests).toBe(2);
  f.state.overview = view(8, DEMO_SECOND);
  await page
    .getByLabel("Selected account", { exact: true })
    .selectOption(DEMO_SECOND);
  await expect(page.getByText("$100,008.00").first()).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __sources: FixtureSource[] }).__sources[0]
          .closed,
    ),
  ).toBe(true);
  f.delayedCore.release();
  await f.emit("snapshot", view(9, DEMO_SECOND));
  const url = await f.reconnect(view(9, DEMO_SECOND).update_cursor);
  expect(url.pathname).toBe(`/v1/accounts/${DEMO_SECOND}/updates`);
  await expect(page.getByText("$100,009.00").first()).toBeVisible();
  await expect(page.getByText("$100,002.00")).toHaveCount(0);
  await page.screenshot({
    path: `${root}/screenshots/account-isolated-${info.project.name}.png`,
    fullPage: true,
  });
});
