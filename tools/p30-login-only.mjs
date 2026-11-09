/** TEST RUNNER ONLY. Fresh private keys never leave this function closure or enter shipped source. */
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import bs58 from "bs58";
const base = "http://127.0.0.1:8791",
  origin = "http://127.0.0.1:5174",
  sha = (b) => createHash("sha256").update(b).digest("hex");
export function loginOnlyIdentity() {
  const pair = generateKeyPairSync("ed25519"),
    wallet = bs58.encode(
      pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32),
    );
  let signatures = 0;
  return {
    wallet,
    signChallenge(c) {
      assert.equal(c.api_version, "1");
      assert.equal(c.wallet, wallet);
      assert.equal(c.audience, base);
      assert.equal(c.browser_origin, origin);
      assert.equal(c.encoding, "utf8");
      assert.equal(c.signature_encoding, "hex_ed25519_64_bytes");
      assert.match(c.challenge_id, /^[a-f0-9]{64}$/);
      assert.match(c.issued_unix_s, /^(0|[1-9][0-9]*)$/);
      assert.match(c.expires_unix_s, /^(0|[1-9][0-9]*)$/);
      assert.ok(
        BigInt(c.expires_unix_s) > BigInt(c.issued_unix_s) &&
          BigInt(c.expires_unix_s) - BigInt(c.issued_unix_s) <= 120n &&
          BigInt(c.expires_unix_s) * 1000n > BigInt(Date.now()),
      );
      const nonce = /\nNonce: ([a-f0-9]{64})\n/.exec(c.message)?.[1];
      assert.ok(nonce);
      const exact = `Setl8 Wallet Login v1\nPurpose: authenticate browser reads; no order or transaction authorization\nWallet: ${wallet}\nAudience: ${base}\nBrowser-Origin: ${origin}\nChallenge: ${c.challenge_id}\nNonce: ${nonce}\nIssued-Unix-Seconds: ${c.issued_unix_s}\nExpires-Unix-Seconds: ${c.expires_unix_s}`;
      assert.equal(c.message, exact);
      assert.equal(
        signatures++,
        0,
        "One exact login signature per disposable identity",
      );
      const signature = sign(null, Buffer.from(exact, "utf8"), pair.privateKey);
      return {
        body: {
          wallet,
          challenge_id: c.challenge_id,
          message: exact,
          signature_hex: signature.toString("hex"),
        },
        evidence: {
          wallet,
          audience: base,
          browserOrigin: origin,
          purpose: "off_chain_browser_login_only",
          messageSha256: sha(exact),
          signatureSha256: sha(signature),
          expiresUnixS: c.expires_unix_s,
        },
      };
    },
  };
}
