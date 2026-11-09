import { afterEach, describe, it, expect, vi } from "vitest";
import { readControllerInfo } from "../src/prototype/bootstrap";
import type { PrototypeBridge, PrototypeInfo } from "../src/prototype/profile";
const info: PrototypeInfo = {
  id: "session",
  account: "aa".repeat(32),
  wallet: "Disposable",
  walletHex: "bb".repeat(32),
  clock: "1791813600",
  phase: "ready",
  gateway: "http://127.0.0.1:8790",
  origin: "http://127.0.0.1:5173",
};
function bridge(readInfo: PrototypeBridge["readInfo"]): PrototypeBridge {
  return {
    info: { ...info },
    readInfo,
    signLogin: vi.fn(),
    signOrder: vi.fn(),
    operate: vi.fn(),
  };
}
afterEach(() => vi.useRealTimers());
describe("read-only reload synchronization", () => {
  it("reads current clock/phase instead of the injected initial object, without signing/operator mutation", async () => {
    const b = bridge(
      vi.fn(async () => ({
        ...info,
        clock: "1791813601",
        phase: "evaluated-open",
      })),
    );
    expect(await readControllerInfo(b)).toMatchObject({
      clock: "1791813601",
      phase: "evaluated-open",
    });
    expect(b.info.phase).toBe("ready");
    expect(b.signLogin).not.toHaveBeenCalled();
    expect(b.signOrder).not.toHaveBeenCalled();
    expect(b.operate).not.toHaveBeenCalled();
  });
  it("bounds an unavailable controller and does not apply its late result", async () => {
    vi.useFakeTimers();
    let resolve!: (i: PrototypeInfo) => void;
    const b = bridge(() => new Promise((r) => (resolve = r)));
    const promise = readControllerInfo(b);
    const failure = expect(promise).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(3000);
    await failure;
    resolve({ ...info, phase: "evaluated-open", clock: "1791813601" });
    expect(b.info).toEqual(info);
    expect(b.operate).not.toHaveBeenCalled();
  });
  it.each([
    { id: "different" },
    { account: "cc".repeat(32) },
    { clock: "1791813599" },
    { clock: "1791900001" },
    { phase: "invented" },
  ])("fails closed on invalid controller metadata %j", async (patch) => {
    const b = bridge(async () => ({ ...info, ...patch }));
    await expect(readControllerInfo(b)).rejects.toThrow();
    expect(b.signOrder).not.toHaveBeenCalled();
    expect(b.operate).not.toHaveBeenCalled();
  });
});
