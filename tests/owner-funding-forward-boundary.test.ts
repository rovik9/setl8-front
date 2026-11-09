// @vitest-environment node
import { it, expect, vi } from "vitest";
import bs58 from "bs58";
import {
  INTENT,
  compileFunding,
  fundingBudget,
  assertFundingForwardBoundary,
} from "../tools/owner-funding/core.mjs";
it("never forwards when the pacing wait crosses context expiry", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  try {
    const compiled = compileFunding("11111111111111111111111111111111"),
      packet = Buffer.from(compiled.unsignedBase64, "base64"),
      signature = bs58.encode(packet.subarray(1, 65));
    const c = {
      ...compiled,
      intentId: INTENT.id,
      ready: true,
      startedAt: Date.now(),
      expiresAt: Date.now() + 500,
      payerLamports: "100000000",
      budget: fundingBudget("1488440", "5000", "100000000"),
      unsignedSimulation: { sameMessageHash: compiled.messageHash, err: null },
    };
    const release = { enabled: true, originReference: "OFFLINE_TEST_ONLY" },
      nativeFetch = vi.fn();
    assertFundingForwardBoundary(c, packet, signature, {
      now: Date.now(),
      release,
    });
    const attempt = (async () => {
      await new Promise((r) => setTimeout(r, 1000));
      assertFundingForwardBoundary(c, packet, signature, {
        now: Date.now(),
        release,
      });
      nativeFetch();
    })();
    const checked = expect(attempt).rejects.toThrow("stale");
    await vi.advanceTimersByTimeAsync(1000);
    await checked;
    expect(nativeFetch).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
