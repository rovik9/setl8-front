// @vitest-environment node
import { it, expect, vi } from "vitest";
import bs58 from "bs58";
import {
  preparePipelineAttempt,
  bindPipelineJob,
  PipelineStore,
  PipelineSession,
  PipelineHttp,
  retainPipelineOperation,
  type PipelineTransport,
} from "../src/devnet/pipeline";
import type { DevnetPipelineJob } from "../src/api/devnet-chain-evidence-v1";
const account = "21".repeat(32),
  address = bs58.encode(Buffer.from(account, "hex")),
  wallet = bs58.encode(new Uint8Array(32).fill(31)),
  signature = bs58.encode(new Uint8Array(64).fill(7)),
  requestId = "32".repeat(32);
async function setup() {
  const a = await preparePipelineAttempt(
    wallet,
    account,
    address,
    requestId,
    "purchase",
    signature,
  );
  const j: DevnetPipelineJob = {
    api_version: "1",
    devnet_execution_version: "1",
    job_id: "41".repeat(32),
    run_id: "42".repeat(32),
    request_id: requestId,
    wallet,
    subject: {
      run_id: "42".repeat(32),
      account,
      account_address: address,
      owner_wallet: wallet,
      stage: null,
      purchase_signature: signature,
      purchase_signature_sha256: a.signatureSha256,
      basis: "armed_plan_not_origin_proof",
    },
    polling: "read_only_no_acquisition",
    terminal: false,
    kind: "purchase_origin",
    state: "queued",
    blocked_reason: null,
    evidence_ids: [],
    duplicate: false,
    signing: "disabled",
    submission: "not_performed",
  };
  const data = new Map<string, string>(),
    store = new PipelineStore({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v);
      },
    });
  await store.write(a);
  const trigger = vi.fn<PipelineTransport["trigger"]>(async () =>
      structuredClone(j),
    ),
    job = vi.fn(async () => structuredClone(j));
  let current = true;
  const session = new PipelineSession(
    wallet,
    requestId,
    store,
    { trigger, job },
    () => current,
  );
  return {
    a,
    j,
    store,
    data,
    trigger,
    job,
    session,
    switch: () => {
      current = false;
    },
  };
}
it("default HTTP gates prevent both job acquisition and reads before transport", async () => {
  const x = await setup(),
    request = vi.fn(),
    http = new PipelineHttp(
      { base: "http://localhost:8792", request } as any,
      "http://localhost:3000",
    );
  expect(() => http.trigger(x.a, new AbortController().signal)).toThrow(
    "not activated",
  );
  expect(() => http.job(x.j.job_id, new AbortController().signal)).toThrow(
    "not activated",
  );
  expect(request).not.toHaveBeenCalled();
});
it("retains uncertainty before POST, binds exact original job and never uses POST for polling", async () => {
  const x = await setup();
  x.trigger.mockImplementation(async () => {
    expect((await x.store.read(wallet, requestId))?.dispatch).toBe("uncertain");
    return x.j;
  });
  const bound = await x.session.trigger();
  expect(bound.jobId).toBe(x.j.job_id);
  await expect(x.session.trigger()).rejects.toThrow("Poll the bound");
  x.job.mockResolvedValue({
    ...x.j,
    state: "genesis_registered",
    terminal: true,
  });
  const done = await x.session.poll(async () => {});
  expect(done.job?.subject.basis).toBe("armed_plan_not_origin_proof");
  expect(x.trigger).toHaveBeenCalledTimes(1);
  expect(x.job).toHaveBeenCalledTimes(1);
});
it.each([
  "request",
  "wallet",
  "account",
  "address",
  "run",
  "stage",
  "signature",
  "hash",
  "polling",
  "signing",
  "submission",
])("rejects a changed %s binding", async (f) => {
  const x = await setup(),
    j = structuredClone(x.j);
  if (f === "request") j.request_id = "11".repeat(32);
  if (f === "wallet") j.wallet = address;
  if (f === "account") j.subject.account = "11".repeat(32);
  if (f === "address") j.subject.account_address = wallet;
  if (f === "run") j.subject.run_id = "11".repeat(32);
  if (f === "stage") j.subject.stage = "Market";
  if (f === "signature")
    j.subject.purchase_signature = bs58.encode(new Uint8Array(64).fill(8));
  if (f === "hash") j.subject.purchase_signature_sha256 = "00".repeat(32);
  if (f === "polling") j.polling = "acquisition" as any;
  if (f === "signing") j.signing = "enabled" as any;
  if (f === "submission") j.submission = "sent" as any;
  await expect(bindPipelineJob(x.a, j)).rejects.toThrow();
});
it("unknown state stops automatic polling and cannot free or replace the original request", async () => {
  const x = await setup();
  await x.session.trigger();
  x.job.mockResolvedValue({ ...x.j, state: "unknown", terminal: true });
  const out = await x.session.poll(async () => {});
  expect(out.job?.state).toBe("unknown");
  expect(x.job).toHaveBeenCalledTimes(1);
  await expect(x.session.trigger()).rejects.toThrow("Poll the bound");
  await expect(
    x.store.write({
      ...out,
      signature: bs58.encode(new Uint8Array(64).fill(8)),
    }),
  ).rejects.toThrow("cannot be replaced");
});
it("has a finite GET budget without automatic reacquisition", async () => {
  const x = await setup();
  await x.session.trigger();
  await x.session.poll(async () => {});
  expect(x.job).toHaveBeenCalledTimes(12);
  expect(x.trigger).toHaveBeenCalledTimes(1);
});
it("a failed initial POST remains uncertain and only explicit identical recovery reuses the request", async () => {
  const x = await setup();
  x.trigger.mockRejectedValueOnce(Error("controlled timeout"));
  await expect(x.session.trigger()).rejects.toThrow("timeout");
  expect((await x.store.read(wallet, requestId))?.dispatch).toBe("uncertain");
  await expect(x.session.poll(async () => {})).rejects.toThrow(
    "exact original POST",
  );
  expect(x.trigger).toHaveBeenCalledTimes(1);
  await x.session.trigger();
  expect(x.trigger.mock.calls[1][0]).toEqual(x.trigger.mock.calls[0][0]);
});
it("session cancellation blocks further GETs and retains the original request", async () => {
  const x = await setup();
  await x.session.trigger();
  x.switch();
  x.session.dispose();
  await expect(x.session.poll(async () => {})).rejects.toThrow(
    "session changed",
  );
  expect(x.job).not.toHaveBeenCalled();
  expect((await x.store.read(wallet, requestId))?.jobId).toBe(x.j.job_id);
  expect(await x.store.read(address, requestId)).toBeNull();
});
it("hashes decoded signature bytes rather than base58 text and validates exact source stage", async () => {
  const x = await setup(),
    a = await preparePipelineAttempt(
      wallet,
      account,
      address,
      "52".repeat(32),
      "Close",
    );
  const j = {
    ...x.j,
    request_id: a.requestId,
    kind: "whole_close_source",
    subject: { ...x.j.subject, stage: "Close" },
  } as DevnetPipelineJob;
  expect((await bindPipelineJob(a, j)).operation).toBe("Close");
  const bound = await bindPipelineJob(x.a, x.j);
  await expect(
    bindPipelineJob(bound, { ...x.j, job_id: "55".repeat(32) }),
  ).rejects.toThrow("does not match");
  expect(x.a.signatureSha256).toMatch(/^[a-f0-9]{64}$/);
});

it("the same source operation reloads the original request and unknown job instead of allocating another attempt", async () => {
  const x = await setup();
  const a = await retainPipelineOperation(
    x.store,
    wallet,
    account,
    address,
    "Market",
  );
  const j = {
    ...x.j,
    request_id: a.requestId,
    kind: "market_source",
    state: "unknown",
    terminal: true,
    subject: {
      ...x.j.subject,
      stage: "Market",
      purchase_signature: null,
      purchase_signature_sha256: null,
    },
  } as DevnetPipelineJob;
  const { bindPipelineJob } = await import("../src/devnet/pipeline");
  await x.store.write(await bindPipelineJob(a, j));
  const loaded = await retainPipelineOperation(
    x.store,
    wallet,
    account,
    address,
    "Market",
  );
  expect(loaded.requestId).toBe(a.requestId);
  expect(loaded.jobId).toBe(j.job_id);
  expect(loaded.job?.state).toBe("unknown");
  expect(x.trigger).not.toHaveBeenCalled();
  await expect(
    x.store.write({ ...loaded, dispatch: "retained" }),
  ).rejects.toThrow("already dispatched");
});
