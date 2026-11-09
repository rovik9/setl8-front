import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import bs58 from "bs58";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const fixture = vi.hoisted(() => ({
  wallet: "",
  epoch: 4,
  trigger: vi.fn(),
  job: vi.fn(),
}));
vi.mock("../src/auth/context", () => ({
  useAuth: () => ({
    session: { wallet: fixture.wallet },
    epoch: fixture.epoch,
    manager: {
      getSnapshot: () => ({
        phase: "authenticated",
        epoch: fixture.epoch,
        session: { wallet: fixture.wallet },
      }),
    },
  }),
}));
vi.mock("../src/devnet/pipeline", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/devnet/pipeline")>();
  return {
    ...actual,
    DEVNET_JOB_RELEASE: { read: true, trigger: true },
    PipelineHttp: class {
      trigger(a: unknown, s: AbortSignal) {
        return fixture.trigger(a, s);
      }
      job(id: string, s: AbortSignal) {
        return fixture.job(id, s);
      }
    },
  };
});
import { PipelinePanel, PurchasePipeline } from "../src/devnet/PipelinePanel";
import {
  PipelineStore,
  retainPipelineOperation,
  bindPipelineJob,
  type PipelineAttempt,
} from "../src/devnet/pipeline";
import type { DevnetPipelineJob } from "../src/api/devnet-chain-evidence-v1";
const account = "21".repeat(32),
  accountAddress = bs58.encode(Buffer.from(account, "hex")),
  wallet = bs58.encode(new Uint8Array(32).fill(31)),
  signature = bs58.encode(new Uint8Array(64).fill(7));
const props = {
  wallet,
  account,
  accountAddress,
  operation: "purchase" as const,
  signature,
};
function jobFor(
  a: PipelineAttempt,
  state: DevnetPipelineJob["state"] = "queued",
): DevnetPipelineJob {
  return {
    api_version: "1",
    devnet_execution_version: "1",
    job_id: "41".repeat(32),
    run_id: "42".repeat(32),
    request_id: a.requestId,
    wallet: a.wallet,
    subject: {
      run_id: "42".repeat(32),
      account: a.account,
      account_address: a.accountAddress,
      owner_wallet: a.wallet,
      stage: a.operation === "purchase" ? null : a.operation,
      purchase_signature: a.signature,
      purchase_signature_sha256: a.signatureSha256,
      basis: "armed_plan_not_origin_proof",
    },
    kind:
      a.operation === "purchase"
        ? "purchase_origin"
        : a.operation === "Market"
          ? "market_source"
          : "whole_close_source",
    state,
    terminal: ![
      "queued",
      "observing",
      "waiting_for_finality",
      "waiting_for_finalized_clock",
    ].includes(state),
    blocked_reason: null,
    evidence_ids: [],
    duplicate: false,
    polling: "read_only_no_acquisition",
    signing: "disabled",
    submission: "not_performed",
  };
}
const mount = (p: Parameters<typeof PipelinePanel>[0]) =>
  render(
    <MemoryRouter>
      <PipelinePanel {...p} />
    </MemoryRouter>,
  );
beforeEach(() => {
  localStorage.clear();
  fixture.wallet = wallet;
  fixture.epoch = 4;
  fixture.trigger.mockReset();
  fixture.job.mockReset();
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("retains one request before explicit trigger, reads its job and reports progress without declaring ownership", async () => {
  const ready = vi.fn();
  let original: PipelineAttempt | null = null;
  fixture.trigger.mockImplementation(async (a: PipelineAttempt) => {
    original = a;
    expect(
      (await new PipelineStore(localStorage).read(wallet, a.requestId))
        ?.dispatch,
    ).toBe("uncertain");
    return jobFor(a);
  });
  fixture.job.mockImplementation(async () =>
    jobFor(original!, "genesis_registered"),
  );
  mount({ ...props, onReady: ready });
  const button = await screen.findByRole("button", {
    name: "Verify original purchase",
  });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByText("Account origin registered");
  expect(fixture.trigger).toHaveBeenCalledTimes(1);
  expect(fixture.job).toHaveBeenCalledTimes(1);
  expect(ready).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText(
      /Purchase progress is separate from verified account ownership/,
    ),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Open execution desk" }),
  ).toHaveAttribute("href", "/devnet-terminal");
});
it("uses the same retained request on reload and does not notify a cached completed job repeatedly", async () => {
  const store = new PipelineStore(localStorage),
    a = await retainPipelineOperation(
      store,
      wallet,
      account,
      accountAddress,
      "purchase",
      signature,
    ),
    completed = jobFor(a, "genesis_registered");
  await store.write(await bindPipelineJob(a, completed));
  fixture.job.mockResolvedValue(completed);
  const ready = vi.fn();
  let view = mount({ ...props, autoStart: true, onReady: ready });
  await screen.findByText("Account origin registered");
  await waitFor(() => expect(fixture.job).toHaveBeenCalledTimes(1));
  view.unmount();
  view = mount({ ...props, autoStart: true, onReady: ready });
  await waitFor(() => expect(fixture.job).toHaveBeenCalledTimes(2));
  expect(fixture.trigger).not.toHaveBeenCalled();
  expect(ready).not.toHaveBeenCalled();
});
it("changing purchase stage eligibility does not automatically retry an uncertain POST; explicit recovery keeps its request", async () => {
  fixture.trigger.mockRejectedValueOnce(Error("controlled lost response"));
  const view = mount({ ...props });
  const button = await screen.findByRole("button", {
    name: "Verify original purchase",
  });
  fireEvent.click(button);
  // Explicit timeouts: the default 1 s wait races when 47 test files run in parallel.
  await screen.findByText(/controlled lost response/, {}, { timeout: 5000 });
  expect(fixture.trigger).toHaveBeenCalledTimes(1);
  view.rerender(
    <MemoryRouter>
      <PipelinePanel {...props} autoStart />
    </MemoryRouter>,
  );
  const recovery = await screen.findByRole(
    "button",
    { name: "Recover original request" },
    { timeout: 5000 },
  );
  await waitFor(() => expect(recovery).toBeEnabled());
  expect(fixture.trigger).toHaveBeenCalledTimes(1);
  fixture.trigger.mockImplementation(async (a: PipelineAttempt) =>
    jobFor(a, "unknown"),
  );
  fireEvent.click(recovery);
  await screen.findByText(
    "Outcome unknown · recovery required",
    {},
    { timeout: 5000 },
  );
  expect(fixture.trigger).toHaveBeenCalledTimes(2);
  expect(fixture.trigger.mock.calls[1][0].requestId).toBe(
    fixture.trigger.mock.calls[0][0].requestId,
  );
  expect(fixture.job).not.toHaveBeenCalled();
}, 30_000); // 6 Nov 2026: load-sensitive (28 ms alone); the default 5 s limit was exceeded once the suite grew to 61 files
it("fresh source preconditions run before a trigger; a conflict spends no source attempt", async () => {
  const before = vi.fn(async () => {
    throw Error("controlled occupied Market1");
  });
  mount({
    ...props,
    signature: null,
    operation: "Market",
    beforeTrigger: before,
  });
  const button = await screen.findByRole("button", {
    name: "Prepare this stage",
  });
  fireEvent.click(button);
  await screen.findByText("controlled occupied Market1");
  expect(before).toHaveBeenCalledTimes(1);
  expect(fixture.trigger).not.toHaveBeenCalled();
});
it("a foreign session hides the original wallet job and makes no calls", async () => {
  fixture.wallet = accountAddress;
  mount({ ...props, autoStart: true });
  expect(
    screen.queryByRole("heading", { name: "Purchase verification" }),
  ).toBeNull();
  expect(fixture.trigger).not.toHaveBeenCalled();
  expect(fixture.job).not.toHaveBeenCalled();
});
it("unmount aborts delayed job reads and a new wallet cannot receive its original progress", async () => {
  const store = new PipelineStore(localStorage),
    a = await retainPipelineOperation(
      store,
      wallet,
      account,
      accountAddress,
      "purchase",
      signature,
    );
  await store.write(await bindPipelineJob(a, jobFor(a)));
  let resolve!: (j: DevnetPipelineJob) => void;
  const pending = new Promise<DevnetPipelineJob>((r) => {
    resolve = r;
  });
  fixture.job.mockReturnValue(pending);
  const ready = vi.fn(),
    view = mount({ ...props, onReady: ready });
  await waitFor(() => expect(fixture.job).toHaveBeenCalledTimes(1));
  const signal = fixture.job.mock.calls[0][1] as AbortSignal;
  view.unmount();
  fixture.wallet = accountAddress;
  fixture.epoch++;
  expect(signal.aborted).toBe(true);
  resolve(jobFor(a, "genesis_registered"));
  await pending;
  await waitFor(async () =>
    expect((await store.read(wallet, a.requestId))?.job?.state).toBe(
      "genesis_registered",
    ),
  );
  expect(ready).not.toHaveBeenCalled();
  expect(await store.read(accountAddress, a.requestId)).toBeNull();
});

it("purchase observation starts from its retained signature while no execution context exists", async () => {
  const { devnetExecutionHttp } = await import("../src/devnet/execution");
  const context = vi.spyOn(devnetExecutionHttp, "context");
  const attempt = {
    wallet,
    expectedAccount: accountAddress,
    signature,
    stage: "uncertain",
  } as any;
  fixture.trigger.mockImplementation(async (a: PipelineAttempt) =>
    jobFor(a, "waiting_for_finality"),
  );
  let request: PipelineAttempt | null = null;
  fixture.trigger.mockImplementation(async (a: PipelineAttempt) => {
    request = a;
    return jobFor(a);
  });
  fixture.job.mockImplementation(async () =>
    jobFor(request!, "genesis_registered"),
  );
  try {
    render(
      <MemoryRouter>
        <PurchasePipeline attempt={attempt} />
      </MemoryRouter>,
    );
    await screen.findByText("Account origin registered");
    expect(fixture.trigger).toHaveBeenCalledTimes(1);
    expect(context).not.toHaveBeenCalled();
  } finally {
    context.mockRestore();
  }
});

it("a newly eligible retained purchase starts once when automatic observation becomes available", async () => {
  fixture.trigger.mockImplementation(async (a: PipelineAttempt) =>
    jobFor(a, "genesis_registered"),
  );
  const view = mount({ ...props, autoStart: false });
  await screen.findByRole("button", { name: "Verify original purchase" });
  expect(fixture.trigger).not.toHaveBeenCalled();
  view.rerender(
    <MemoryRouter>
      <PipelinePanel {...props} autoStart />
    </MemoryRouter>,
  );
  await screen.findByText("Account origin registered");
  expect(fixture.trigger).toHaveBeenCalledTimes(1);
  expect(fixture.job).not.toHaveBeenCalled();
});
