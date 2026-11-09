/** Explicit offline browser fixtures, never imported by production. */
import { readFile } from "node:fs/promises";
export const fixture = JSON.parse(
  await readFile(
    new URL("../tests/fixtures/f3-account.json", import.meta.url),
    "utf8",
  ),
);
export async function mockAccountRpc(
  context,
  { counter = "1", wrongOwner = false, status = null } = {},
) {
  const state = { counter, wrongOwner, status, calls: [], external: [] };
  const accounts = structuredClone(fixture.accounts);
  await context.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    if (
      [
        "https://api.devnet.solana.com",
        "https://solana-devnet.api.onfinality.io",
      ].includes(u.origin)
    ) {
      const q = req.postDataJSON();
      state.calls.push({
        method: q.method,
        addresses: q.method === "getMultipleAccounts" ? q.params[0] : [],
      });
      if (state.status)
        return route.fulfill({
          status: state.status,
          headers: { "Retry-After": "120" },
          body: "limited",
        });
      const profile = structuredClone(accounts[fixture.profile]),
        bytes = Buffer.from(profile.data[0], "base64");
      bytes.writeBigUInt64LE(BigInt(state.counter), 40);
      profile.data[0] = bytes.toString("base64");
      const result =
        q.method === "getGenesisHash"
          ? "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
          : {
              context: { slot: 600000000 },
              value: q.params[0].map((address) => {
                if (address === fixture.profile) return profile;
                const a = accounts[address];
                return a
                  ? {
                      ...a,
                      ...(state.wrongOwner && address === fixture.account
                        ? { owner: "11111111111111111111111111111111" }
                        : {}),
                    }
                  : null;
              }),
            };
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ jsonrpc: "2.0", id: q.id, result }),
      });
    }
    if (u.origin !== "http://127.0.0.1:5173") {
      state.external.push(u.origin + u.pathname);
      return route.abort();
    }
    return route.continue();
  });
  return state;
}
export async function watermark(page) {
  await page.evaluate(() => {
    if (document.getElementById("offline-watermark")) return;
    const el = document.createElement("div");
    el.id = "offline-watermark";
    el.textContent = "MOCKED WALLET - NOT A REAL TRANSACTION";
    el.style.cssText =
      "background:#f3d76c;color:#24200e;text-align:center;padding:10px;font:bold 11px monospace;";
    document.body.prepend(el);
  });
}
