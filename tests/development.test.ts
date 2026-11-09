// @vitest-environment node
import { it, expect, vi } from "vitest";
import {
  PROFILE,
  assertDevelopmentEnvironment,
  startDevelopment,
  type BackendReport,
} from "../tools/development-core";
import { apiForOrigin } from "../src/api/profile";
function setup() {
  const controller = new AbortController(),
    events: string[] = [];
  const ready: BackendReport = {
    profile: PROFILE.name,
    ready: true,
    database_ready: true,
    api_ready: true,
    api_url: PROFILE.api,
    frontend_origin: PROFILE.origin,
    ownership: {
      requested_owner: "this-owner",
      gateway: "owned",
      postgres: "borrowed",
    },
  };
  const close = vi.fn(async () => {
    events.push("web-close");
  });
  const release = vi.fn(async () => {
    events.push("release");
  });
  const d = {
    owner: "this-owner",
    signal: controller.signal,
    preflight: vi.fn(async () => {
      events.push("preflight");
    }),
    claim: vi.fn(async () => {
      events.push("claim");
      return release;
    }),
    backendStart: vi.fn(async () => {
      events.push("backend-start");
      return ready;
    }),
    backendStop: vi.fn(async (owner: string) => {
      events.push("backend-stop:" + owner);
    }),
    webStart: vi.fn(async () => {
      events.push("web-start");
      return { close };
    }),
  };
  return { d, ready, controller, events, release, close };
}
it("uses the actual new API by default while preserving the explicit legacy and synthetic profiles", () => {
  expect(apiForOrigin(undefined, PROFILE.origin)).toBe(PROFILE.api);
  expect(apiForOrigin(undefined, "http://127.0.0.1:5173")).toBe(
    "http://127.0.0.1:8788",
  );
  expect(apiForOrigin("http://127.0.0.1:8790", "http://127.0.0.1:5173")).toBe(
    "http://127.0.0.1:8790",
  );
  expect(() =>
    assertDevelopmentEnvironment({ VITE_API_URL: "http://127.0.0.1:8788" }),
  ).toThrow("Conflicting");
  expect(() =>
    assertDevelopmentEnvironment({
      VITE_PROTOTYPE_OPT_IN: "local-synthetic-v1",
    }),
  ).toThrow("Synthetic");
  expect(() => assertDevelopmentEnvironment({ VITE_DEMO_BUILD: "1" })).toThrow(
    "Synthetic",
  );
  expect(() =>
    assertDevelopmentEnvironment({ VITE_API_URL: PROFILE.api }),
  ).not.toThrow();
});
it("waits for actual backend/database readiness before web startup, and idempotently releases only this owner", async () => {
  const s = setup();
  let finish!: (v: BackendReport) => void;
  s.d.backendStart.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const pending = startDevelopment(s.d);
  await vi.waitFor(() => expect(s.d.backendStart).toHaveBeenCalled());
  expect(s.d.webStart).not.toHaveBeenCalled();
  finish(s.ready);
  const run = await pending;
  await run.stop();
  await run.stop();
  expect(s.events).toEqual([
    "preflight",
    "claim",
    "web-start",
    "web-close",
    "backend-stop:this-owner",
    "release",
  ]);
  expect(s.d.backendStop).toHaveBeenCalledExactlyOnceWith("this-owner");
});
it.each(["port occupied", "bad env", "missing helper"])(
  "%s fails preflight before backend or Vite changes",
  async (reason) => {
    const s = setup();
    s.d.preflight.mockRejectedValue(Error(reason));
    await expect(startDevelopment(s.d)).rejects.toThrow(reason);
    expect(s.d.backendStart).not.toHaveBeenCalled();
    expect(s.d.claim).not.toHaveBeenCalled();
    expect(s.d.backendStop).not.toHaveBeenCalled();
    expect(s.d.webStart).not.toHaveBeenCalled();
  },
);
it.each(["wrong profile", "database unavailable", "wrong owner"])(
  "refuses %s and cleans up only this invocation",
  async (reason) => {
    const s = setup();
    if (reason === "wrong profile") s.ready.profile = "prototype";
    else if (reason === "wrong owner")
      s.ready.ownership!.requested_owner = "other";
    else s.ready.database_ready = false;
    await expect(startDevelopment(s.d)).rejects.toThrow("exact profile");
    expect(s.d.webStart).not.toHaveBeenCalled();
    expect(s.d.backendStop).toHaveBeenCalledExactlyOnceWith("this-owner");
    expect(s.release).toHaveBeenCalledOnce();
  },
);
it("cancelling while helper startup is pending awaits the helper then releases its owner without launching Vite", async () => {
  const s = setup();
  let finish!: (v: BackendReport) => void;
  s.d.backendStart.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const pending = startDevelopment(s.d);
  await vi.waitFor(() => expect(s.d.backendStart).toHaveBeenCalled());
  s.controller.abort();
  finish(s.ready);
  await expect(pending).rejects.toThrow("cancelled");
  expect(s.d.webStart).not.toHaveBeenCalled();
  expect(s.d.backendStop).toHaveBeenCalledWith("this-owner");
  expect(s.release).toHaveBeenCalledOnce();
});
it("partial backend or Vite failure cleans owned resources without clearing the database", async () => {
  const s = setup();
  s.d.backendStart.mockRejectedValue(Error("dependency unavailable"));
  await expect(startDevelopment(s.d)).rejects.toThrow("dependency unavailable");
  expect(s.d.backendStop).toHaveBeenCalledWith("this-owner");
  expect(s.d.webStart).not.toHaveBeenCalled();
  const t = setup();
  t.d.webStart.mockRejectedValue(Error("bind race"));
  await expect(startDevelopment(t.d)).rejects.toThrow("bind race");
  expect(t.d.backendStop).toHaveBeenCalledWith("this-owner");
  expect(t.release).toHaveBeenCalledOnce();
});
it("cleanup failure retains the ownership record for inspection and never force-kills", async () => {
  const s = setup();
  const run = await startDevelopment(s.d);
  s.d.backendStop.mockRejectedValue(Error("identity changed"));
  await expect(run.stop()).rejects.toThrow("record retained");
  expect(s.close).toHaveBeenCalledOnce();
  expect(s.release).not.toHaveBeenCalled();
});
