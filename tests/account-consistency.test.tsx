import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { api } from "../src/api/client";
import type {
  AccountOverview,
  Journal,
  Page,
  PublicationAttempt,
} from "../src/api/frontend-v1";
import { accountFromOverview, readAccount } from "../src/data/account";
import {
  demoAccount,
  DEMO_ACCOUNT,
  DEMO_SECOND,
  demoMarkets,
} from "../src/data/demo";
import { useAccountBundle } from "../src/hooks/account";
import { AccountPanels, type PanelTab } from "../src/components/AccountPanels";
import type { useWorkspace } from "../src/components/Workspace";

let workspace: ReturnType<typeof useWorkspace>;
vi.mock("../src/components/Workspace", () => ({
  useWorkspace: () => workspace,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function overview(version: number, account = DEMO_ACCOUNT): AccountOverview {
  const result = structuredClone(demoAccount().overview);
  result.account = account;
  result.update_cursor = `opaque cursor/${account}/${version}`;
  result.processed_through = String(version);
  result.received_through = String(version);
  result.evaluator_state!.processed_through = String(version);
  result.evaluator_state!.balance_micro = String(
    100000000000n + BigInt(version) * 1000000n,
  );
  result.evaluator_state!.positions = [
    { ...result.evaluator_state!.positions[0], qty: String(version * 1000000) },
  ];
  result.evaluator_state!.pending = [
    { nonce: String(version), order_hex: "ab".repeat(48) },
  ];
  return result;
}
class Source {
  static instances: Source[] = [];
  closed = false;
  onerror: ((event: Event) => void) | null = null;
  listeners = new Map<string, (event: MessageEvent) => void>();
  constructor(
    readonly url: string,
    readonly options: EventSourceInit,
  ) {
    Source.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, listener);
  }
  emit(type: string, value: unknown = {}, id = "") {
    this.listeners.get(type)?.(
      new MessageEvent(type, { data: JSON.stringify(value), lastEventId: id }),
    );
  }
  snapshot(value: AccountOverview) {
    this.emit("snapshot", value, value.update_cursor);
  }
}
const flush = async (work?: () => void) => {
  await act(async () => {
    work?.();
  });
};
const empty = { api_version: "1", rows: [], next_after: null, has_more: false };
function Harness({
  account = DEMO_ACCOUNT,
  epoch = 0,
  tab = "Positions" as PanelTab,
}) {
  const bundle = useAccountBundle(account, false, epoch, vi.fn());
  workspace = {
    demo: false,
    base: "/app",
    account,
    setAccount: vi.fn(),
    markets: demoMarkets,
    marketError: null,
    bundle,
    accounts: {
      key: "test-list",
      rows: [],
      next: null,
      loading: false,
      error: null,
      more: vi.fn(),
      refresh: vi.fn(),
    },
  };
  return (
    <>
      <output data-testid="core">
        {bundle.data ? JSON.stringify(bundle.data) : "loading"}
      </output>
      {bundle.data && <AccountPanels initial={tab} />}
    </>
  );
}
function displayedCore() {
  return JSON.parse(screen.getByTestId("core").textContent!) as ReturnType<
    typeof accountFromOverview
  >;
}
function transport(core: (signal: AbortSignal) => Promise<AccountOverview>) {
  const request = vi.spyOn(api, "request");
  request.mockImplementation((path, options = {}) => {
    const value = /^\/v1\/accounts\/[a-f0-9]{64}$/.test(path)
      ? core(options.signal!)
      : Promise.resolve(empty);
    return value as Promise<never>;
  });
  return request;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  Source.instances = [];
  vi.stubGlobal("EventSource", Source);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("committed core view and applied reconnect boundary", () => {
  it("ignores separately completing older position/pending endpoints and derives every field from the new overview", async () => {
    const fresh = deferred<AccountOverview>();
    const oldPositions = deferred<unknown>();
    const oldPending = deferred<unknown>();
    const stale = accountFromOverview(overview(1));
    const request = vi
      .spyOn(api, "request")
      .mockImplementation(
        (path) =>
          (path.endsWith("/positions")
            ? oldPositions.promise
            : path.endsWith("/pending-orders")
              ? oldPending.promise
              : fresh.promise) as Promise<never>,
      );
    const read = readAccount(DEMO_ACCOUNT, new AbortController().signal);
    oldPositions.resolve(stale.positions);
    oldPending.resolve(stale.pending);
    fresh.resolve(overview(9));
    const data = await read;
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      `/v1/accounts/${DEMO_ACCOUNT}`,
    ]);
    expect(data.positions.rows).toEqual(
      data.overview.evaluator_state!.positions,
    );
    expect(data.pending.rows).toEqual(data.overview.evaluator_state!.pending);
    for (const part of [data.positions, data.pending]) {
      expect(part.processed_through).toBe("9");
      expect(part.update_cursor).toBe(data.overview.update_cursor);
      expect(part.available).toBe(true);
      expect(part.account).toBe(DEMO_ACCOUNT);
    }
    expect(Object.keys(data)).toEqual(["overview", "positions", "pending"]);
  });

  it("applies a streamed snapshot over a delayed refresh, including metadata, and reconnects from the snapshot rather than discarded work", async () => {
    const slow = deferred<AccountOverview>();
    let calls = 0;
    const request = transport(() =>
      ++calls === 1 ? Promise.resolve(overview(1)) : slow.promise,
    );
    render(<Harness />);
    await flush();
    const source = Source.instances[0];
    await flush(() => source.emit("invalidate", {}, "notice-only"));
    const readSignal = request.mock.calls.filter(
      ([path]) => path === `/v1/accounts/${DEMO_ACCOUNT}`,
    )[1][1]!.signal!;
    await flush(() => source.snapshot(overview(3)));
    expect(readSignal.aborted).toBe(true);
    expect(screen.getByText("3")).toBeVisible();
    await flush(() => slow.resolve(overview(2)));
    const result = displayedCore();
    expect(result.overview.update_cursor).toBe(overview(3).update_cursor);
    expect(result.positions.processed_through).toBe("3");
    expect(result.pending.processed_through).toBe("3");
    expect(result.positions.rows?.[0].qty).toBe("3000000");
    expect(result.pending.rows?.[0].nonce).toBe("3");
    await flush(() => source.emit("reconnect"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(new URL(Source.instances[1].url).searchParams.get("cursor")).toBe(
      overview(3).update_cursor,
    );
    expect(Source.instances[1].options.withCredentials).toBe(true);
  });

  it("invalidates journal/publication pages on the initial SSE snapshot, even for the same opaque cursor, and acknowledges loading rather than stale evidence", async () => {
    const freshJournals = deferred<Page<Journal>>();
    const freshAttempts = deferred<Page<PublicationAttempt>>();
    const oldAttempts: Page<PublicationAttempt> = {
      ...empty,
      api_version: "1",
      rows: [
        {
          attempt_id: "1",
          work_id: "24",
          lease_epoch: "1",
          message_sha256: "aa".repeat(32),
          message_hex: "ab".repeat(10),
          context: { fixture: "old-publication" },
          created_unix_ns: "0",
          meaning:
            "compiled_message_prepared; not signer approval or submission",
        },
      ],
    };
    let changed = false;
    vi.spyOn(api, "request").mockImplementation((path) => {
      let value: Promise<unknown> = Promise.resolve(empty);
      if (/\/accounts\/[a-f0-9]{64}$/.test(path))
        value = Promise.resolve(overview(1));
      else if (path.includes("publication-attempts"))
        value = changed ? freshAttempts.promise : Promise.resolve(oldAttempts);
      else if (path.includes("/journals"))
        value = changed
          ? freshJournals.promise
          : Promise.resolve(demoAccount().journals);
      return value as Promise<never>;
    });
    render(<Harness tab="Evidence" />);
    await flush();
    expect(screen.getByText("Journal #24")).toBeVisible();
    expect(screen.getByText(/old-publication/)).toBeInTheDocument();
    // Evidence changed after its read but before snapshot delivery. Even an
    // identical account cursor must invalidate independent page reads.
    changed = true;
    await flush(() => Source.instances[0].snapshot(overview(1)));
    expect(screen.queryByText("Journal #24")).not.toBeInTheDocument();
    expect(screen.queryByText(/old-publication/)).not.toBeInTheDocument();
    expect(screen.getByText("Loading recorded activity…")).toBeVisible();
    expect(
      screen.getByRole("status", { name: "Loading recorded account data" }),
    ).toBeInTheDocument();
    await flush(() => Source.instances[0].emit("reconnect"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(new URL(Source.instances[1].url).searchParams.get("cursor")).toBe(
      overview(1).update_cursor,
    );
    await flush(() => {
      freshJournals.resolve({
        ...demoAccount().journals,
        rows: [{ ...demoAccount().journals.rows[0], journal_seq: "99" }],
      });
      freshAttempts.resolve({
        ...oldAttempts,
        rows: [
          { ...oldAttempts.rows[0], context: { fixture: "fresh-publication" } },
        ],
      });
    });
    expect(screen.getByText("Journal #99")).toBeVisible();
    expect(screen.getByText(/fresh-publication/)).toBeInTheDocument();
  });

  it("finishes an applied refresh before rotating a disconnected stream, without using the notice ID", async () => {
    const slow = deferred<AccountOverview>();
    let calls = 0;
    transport(() =>
      ++calls === 1 ? Promise.resolve(overview(1)) : slow.promise,
    );
    render(<Harness />);
    await flush();
    const old = Source.instances[0];
    await flush(() => old.snapshot(overview(1)));
    await flush(() => {
      old.emit("invalidate", {}, "unapplied-notice");
      old.emit("reconnect");
    });
    expect(old.closed).toBe(true);
    expect(Source.instances).toHaveLength(1);
    await flush(() => slow.resolve(overview(4)));
    expect(displayedCore().overview.update_cursor).toBe(
      overview(4).update_cursor,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(new URL(Source.instances[1].url).searchParams.get("cursor")).toBe(
      overview(4).update_cursor,
    );
    await flush(() => old.snapshot(overview(2)));
    expect(displayedCore().positions.processed_through).toBe("4");
  });

  it.each([
    { name: "account", nextAccount: DEMO_SECOND, nextEpoch: 0 },
    { name: "wallet", nextAccount: DEMO_ACCOUNT, nextEpoch: 1 },
  ])(
    "discards delayed private reads after $name switching and keeps the new reconnect cursor isolated",
    async ({ nextAccount, nextEpoch }) => {
      const delayed = deferred<AccountOverview>();
      let calls = 0;
      const request = transport(() =>
        ++calls === 1
          ? Promise.resolve(overview(1))
          : calls === 2
            ? delayed.promise
            : Promise.resolve(overview(8, nextAccount)),
      );
      const view = render(<Harness />);
      await flush();
      const old = Source.instances[0];
      await flush(() => old.emit("invalidate"));
      const signal = request.mock.calls.filter(([path]) =>
        /^\/v1\/accounts\/[a-f0-9]{64}$/.test(path),
      )[1][1]!.signal!;
      view.rerender(<Harness account={nextAccount} epoch={nextEpoch} />);
      await flush();
      expect(signal.aborted).toBe(true);
      expect(old.closed).toBe(true);
      await flush(() => delayed.resolve(overview(2)));
      expect(displayedCore().overview.account).toBe(nextAccount);
      expect(displayedCore().positions.processed_through).toBe("8");
      const current = Source.instances[1];
      await flush(() => current.snapshot(overview(9, nextAccount)));
      await flush(() => current.emit("reconnect"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      const url = new URL(Source.instances[2].url);
      expect(url.pathname).toBe(`/v1/accounts/${nextAccount}/updates`);
      expect(url.searchParams.get("cursor")).toBe(
        overview(9, nextAccount).update_cursor,
      );
      expect(displayedCore().pending.processed_through).toBe("9");
    },
  );

  it("keeps unavailable snapshot metadata distinct from an empty committed view", () => {
    const absent = accountFromOverview({
      ...overview(5),
      evaluator_state: null,
    });
    expect(absent.positions.available).toBe(false);
    expect(absent.positions.rows).toBeNull();
    expect(absent.pending.rows).toBeNull();
    expect(absent.pending.processed_through).toBe("5");
    const flat = overview(6);
    flat.evaluator_state!.positions = [];
    flat.evaluator_state!.pending = [];
    const present = accountFromOverview(flat);
    expect(present.positions.available).toBe(true);
    expect(present.positions.rows).toEqual([]);
    expect(present.pending.rows).toEqual([]);
  });
});
