import bs58 from "bs58";
import { fromHex, same, hash } from "./bytes";
import {
  diagnoseSignedMismatch,
  type SignedMismatchDiagnostics,
} from "./signedDiagnostics";
/** The exact-message refusal, now carrying public-only diagnostics. Same message, same refusal. */
export class SignedPurchaseMismatch extends Error {
  constructor(readonly diagnostics: SignedMismatchDiagnostics | null) {
    super(
      "The wallet changed the exact purchase message. No app broadcast is permitted.",
    );
    this.name = "SignedPurchaseMismatch";
  }
}
export function mismatch(
  packet: Uint8Array,
  messageHex: string,
  reason?: string,
) {
  let diagnostics: SignedMismatchDiagnostics | null = null;
  try {
    diagnostics = diagnoseSignedMismatch(packet, messageHex, reason);
    // Public data only: lengths, counts, flags and program ids. Never signature bytes or keys.
    console.warn(
      "[setl8] wallet message mismatch",
      JSON.stringify(diagnostics),
    );
  } catch {
    // Diagnostics must never change or mask the refusal.
  }
  return new SignedPurchaseMismatch(diagnostics);
}
export async function verifySignedPurchase(
  packet: Uint8Array,
  messageHex: string,
  wallet: string,
  messageSha256: string,
) {
  const message = fromHex(messageHex);
  if (
    packet.length > 1232 ||
    packet.length !== 65 + message.length ||
    packet[0] !== 1 ||
    !same(packet.slice(65), message) ||
    (await hash(message)) !== messageSha256
  )
    throw mismatch(packet, messageHex);
  const publicKey = bs58.decode(wallet);
  if (publicKey.length !== 32) throw Error("Invalid required signer");
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(publicKey),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      new Uint8Array(packet.slice(1, 65)),
      new Uint8Array(message),
    ))
  )
    throw Error(
      "The required wallet signature is invalid. No app broadcast is permitted.",
    );
  return bs58.encode(packet.slice(1, 65));
}
