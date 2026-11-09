/**
 * Headless run of the synthetic prototype journey against the reviewed prototype gateway (8790):
 * disposable wallet login -> BTC Market Buy qty 1 -> evaluate -> position -> Close -> evaluate -> closed balance.
 * Same guarded operator commands and the same signing checks as the browser session; no browser, no frontend.
 * Uses ONE of the prototype's 32 fixture-account slots per run. Needs the prototype gateway already running.
 *   node tools/prototype-headless-journey.mjs [logDir]
 */
import { mkdir } from "node:fs/promises";
import { createSyntheticSession, GATEWAY, ORIGIN } from "./prototype-core.mjs";
import { stripTypeScriptTypes } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { FRONT } from "./prototype-core.mjs";

const logRoot =
  process.argv[2] ?? FRONT + "artifacts/headless-journey-" + Date.now();
await mkdir(logRoot, { recursive: true });
const session = await createSyntheticSession(logRoot);
const sdk = await import(pathToFileURL(logRoot + "/codec/order.mjs"));
const info0 = session.info;
const jar = new Map();
async function http(path, body, csrf) {
  const headers = { Origin: ORIGIN };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrf) headers["X-Setl8-Csrf"] = csrf;
  if (jar.size)
    headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const r = await fetch(GATEWAY + path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const c of r.headers.getSetCookie())
    jar.set(c.split("=")[0], c.slice(c.indexOf("=") + 1).split(";")[0]);
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${text.slice(0, 200)}`);
  return json;
}
const step = (m) => console.log("[journey] " + m);
// 1. login with the disposable wallet (the controller only signs the server's own inspected challenge)
const ch = await http("/v1/auth/challenge", { wallet: info0.wallet });
session.observeChallenge(ch);
const sig = Buffer.from(
  session.signLogin(Array.from(Buffer.from(ch.message, "utf8"))),
).toString("hex");
await http("/v1/auth/login", {
  challenge_id: ch.challenge_id,
  wallet: ch.wallet,
  message: ch.message,
  signature_hex: sig,
});
const sess = await http("/v1/auth/session");
step("signed in as " + sess.wallet.slice(0, 8) + "…");
async function intent(kind, nonce, qty) {
  const info = session.info;
  const order = {
    kind,
    market: 0,
    side: 0,
    qty,
    priceE12: 0n,
    slE12: 0n,
    tpE12: 0n,
    targetNonce: 0,
    clientTime: BigInt(info.clock),
  };
  const bytes = sdk.encodeOrder(order);
  const message = sdk.signingMessage(
    Uint8Array.from(Buffer.from(info.account, "hex")),
    nonce,
    bytes,
  );
  const draft = {
    scope: {
      account: info.account,
      market: "0",
      wallet: info.walletHex,
      sessionEpoch: 1,
      mode: "prototype",
      syntheticSession: info.id,
      gateway: GATEWAY,
    },
    profile: "setl8-sdk-dev-v1",
    sdkVersion: "0.1.0-dev.4",
    nonce: String(nonce),
    decoded: sdk.orderToTransport(sdk.decodeOrder(bytes)),
    orderHex: Buffer.from(bytes).toString("hex"),
    messageHex: Buffer.from(message).toString("hex"),
  };
  const signature = session.signOrder(draft);
  return http(
    `/v1/accounts/${info.account}/intents`,
    { nonce, order: draft.orderHex, signature },
    sess.csrf_token,
  );
}
const read = async (label) => {
  const a = await http(`/v1/accounts/${info0.account}`);
  const p = await http(`/v1/accounts/${info0.account}/positions`).catch(
    (e) => ({ error: String(e) }),
  );
  console.log(
    JSON.stringify(
      {
        label,
        closed_balance: a.closed_balance ?? a.balance ?? null,
        overview_keys: Object.keys(a),
        positions: p.rows ?? p,
      },
      null,
      1,
    ),
  );
  await writeFile(
    `${logRoot}/read-${label.replace(/\W+/g, "-")}.json`,
    JSON.stringify({ overview: a, positions: p }, null, 2),
  );
  return a;
};
await read("before");
await session.operate("stage-open");
step("staged open sample at clock " + session.info.clock);
console.log(JSON.stringify(await intent(0, 1, 1_000_000n)));
await session.operate("evaluate");
const open = await read("after-open");
await session.operate("stage-close");
step("staged close sample at clock " + session.info.clock);
console.log(JSON.stringify(await intent(3, 2, 0n)));
await session.operate("evaluate");
const closed = await read("after-close");
session.close();
step("done; public logs in " + logRoot);
