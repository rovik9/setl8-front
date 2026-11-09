import type { PrototypeBridge, PrototypeInfo } from "./profile";
/** Read-only bridge resync. No signing, nonce selection or CLI mutation; late reads cannot revive drafts. */
export async function readControllerInfo(
  bridge: PrototypeBridge,
  timeoutMs = 3000,
): Promise<PrototypeInfo> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const expected = bridge.info;
    const current = await Promise.race([
      Promise.resolve().then(() => bridge.readInfo()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Controller synchronization timed out. Synthetic actions remain disabled; resync explicitly.",
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
    for (const key of [
      "id",
      "account",
      "wallet",
      "walletHex",
      "gateway",
      "origin",
    ] as const)
      if (current[key] !== expected[key])
        throw new Error(
          "Controller session identity changed. Synthetic actions remain disabled; restart the local session explicitly.",
        );
    if (
      !/^\d{10}$/.test(current.clock) ||
      BigInt(current.clock) < 1791813600n ||
      BigInt(current.clock) > 1791900000n ||
      ![
        "ready",
        "staged-open",
        "evaluated-open",
        "staged-close",
        "evaluated-close",
      ].includes(current.phase)
    )
      throw new Error(
        "Invalid controller clock or phase. Synthetic actions remain disabled.",
      );
    return { ...current };
  } finally {
    clearTimeout(timer);
  }
}
