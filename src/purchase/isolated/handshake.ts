import type {
  PurchaseAttemptRequest,
  PurchaseAcknowledgment,
} from "../../api/purchase-foundation-v1";
import {
  assertPurchaseScope,
  parsePurchase,
  type PurchaseScope,
} from "../consumer/runtime";
import { P30_PROFILE, P30_SOURCE_ROUTES } from "./profile";
import bs58 from "bs58";
import { assertReleaseMapping } from "./identity";
const hex = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const decimal = (v: unknown): v is string =>
  typeof v === "string" &&
  /^(0|[1-9][0-9]*)$/.test(v) &&
  v.length <= 20 &&
  BigInt(v) <= 18446744073709551615n;
/** Pure, unsent request description. POST is PRE-WALLET persistence, never post-signature reporting or broadcasting. */
export function describePreWalletAttempt(
  scope: PurchaseScope,
  input: PurchaseAttemptRequest,
  csrf: string,
) {
  assertPurchaseScope(scope);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw Error("Public attempt object required.");
  const properties = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(input).some(
      (k) => typeof k !== "string" || !("value" in properties[k]),
    )
  )
    throw Error("Public attempt data properties required.");
  input = Object.freeze(
    Object.fromEntries(
      Object.entries(properties).map(([k, v]) => [k, v.value]),
    ),
  ) as unknown as PurchaseAttemptRequest;
  if (
    scope.evidencePurpose !== "chain_observation" ||
    input.deployment_id !== scope.deploymentId ||
    !hex(csrf) ||
    Object.keys(input).sort().join(",") !==
      "deployment_id,expected_account,last_valid_block_height,message_sha256,quote_id,recent_blockhash,request_id" ||
    ![
      input.request_id,
      input.quote_id,
      input.expected_account,
      input.message_sha256,
    ].every(hex) ||
    input.recent_blockhash === null ||
    !decimal(input.last_valid_block_height)
  )
    throw Error("Nonnull public blockhash and validity context is required.");
  const block = bs58.decode(input.recent_blockhash);
  if (block.length !== 32 || bs58.encode(block) !== input.recent_blockhash)
    throw Error("Canonical blockhash required.");
  return Object.freeze({
    url: P30_PROFILE.api + P30_SOURCE_ROUTES.preWalletAttempt,
    method: "POST" as const,
    credentials: "include" as const,
    redirect: "error" as const,
    headers: Object.freeze({
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Setl8-Csrf": csrf,
    }),
    body: JSON.stringify({ ...input }),
    semantics: "durable_public_context_before_wallet_prompt_or_send" as const,
  });
}
/** Shape/context consistency only. A mock acknowledgment cannot establish durable database persistence. */
export function validatePreWalletAcknowledgment(
  raw: unknown,
  scope: PurchaseScope,
  request: PurchaseAttemptRequest,
  known?: PurchaseAcknowledgment["purchase"],
) {
  const ack = parsePurchase("ack", raw, scope),
    p = ack.purchase;
  assertReleaseMapping(p.deployment);
  if (
    p.request_id !== request.request_id ||
    p.quote_id !== request.quote_id ||
    p.expected_account !== request.expected_account ||
    p.expected_message_sha256 !== request.message_sha256 ||
    p.recent_blockhash !== request.recent_blockhash ||
    p.last_valid_block_height !== request.last_valid_block_height ||
    (known &&
      (p.purchase_id !== known.purchase_id ||
        (known.transaction_signature !== null &&
          p.transaction_signature !== known.transaction_signature)))
  )
    throw Error(
      "Public attempt acknowledgment changed context; reconcile the original identity.",
    );
  return ack;
}
