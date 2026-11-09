import type { Challenge } from "../api/frontend-v1";
import { assertPurchaseScope } from "../purchase/consumer/runtime";
import { P30_PROFILE } from "../purchase/isolated/profile";
const dec = (v: unknown): v is string =>
  typeof v === "string" &&
  /^(0|[1-9][0-9]*)$/.test(v) &&
  v.length <= 20 &&
  BigInt(v) <= 18446744073709551615n;
/** Rebuild only the reviewed off-chain login grammar; never sign arbitrary server-supplied bytes. */
export function validateLoginChallenge(
  raw: unknown,
  wallet: string,
  now = Date.now(),
): Readonly<Challenge> {
  assertPurchaseScope({
    wallet,
    deploymentId: P30_PROFILE.deployment,
    sessionEpoch: 0,
    evidencePurpose: "chain_observation",
  });
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("Request a new sign-in message.");
  const d = Object.getOwnPropertyDescriptors(raw),
    keys = Object.keys(d).sort().join(",");
  if (
    keys !==
      "api_version,audience,browser_origin,challenge_id,encoding,expires_unix_s,issued_unix_s,message,signature_encoding,wallet" ||
    Reflect.ownKeys(raw).some(
      (k) => typeof k !== "string" || !("value" in d[k]),
    )
  )
    throw Error("The sign-in message needs a fresh reviewed response.");
  const v = Object.fromEntries(
    Object.entries(d).map(([k, p]) => [k, p.value]),
  ) as unknown as Challenge;
  if (
    v.api_version !== "1" ||
    v.wallet !== wallet ||
    v.audience !== P30_PROFILE.api ||
    v.browser_origin !== P30_PROFILE.browserOrigin ||
    v.encoding !== "utf8" ||
    v.signature_encoding !== "hex_ed25519_64_bytes" ||
    typeof v.challenge_id !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.challenge_id) ||
    !dec(v.issued_unix_s) ||
    !dec(v.expires_unix_s) ||
    typeof v.message !== "string" ||
    v.message.length > 2048
  )
    throw Error("This sign-in message does not match your wallet or Setl8.");
  const issued = BigInt(v.issued_unix_s) * 1000n,
    expiry = BigInt(v.expires_unix_s) * 1000n,
    clock = BigInt(Math.trunc(now));
  if (
    issued > clock + 1000n ||
    expiry <= clock ||
    expiry <= issued ||
    expiry - issued > 120000n
  )
    throw Error("The sign-in message has expired or its time needs review.");
  const nonce = /\nNonce: ([a-f0-9]{64})\n/.exec(v.message)?.[1];
  if (!nonce) throw Error("The sign-in message is invalid.");
  const exact = `Setl8 Wallet Login v1\nPurpose: authenticate browser reads; no order or transaction authorization\nWallet: ${wallet}\nAudience: ${P30_PROFILE.api}\nBrowser-Origin: ${P30_PROFILE.browserOrigin}\nChallenge: ${v.challenge_id}\nNonce: ${nonce}\nIssued-Unix-Seconds: ${v.issued_unix_s}\nExpires-Unix-Seconds: ${v.expires_unix_s}`;
  if (exact !== v.message)
    throw Error(
      "The exact sign-in message does not match the reviewed purpose.",
    );
  return Object.freeze({ ...v, message: exact });
}
