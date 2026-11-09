import { api, ApiClient, ApiError } from "../api/client";
import { DEV_API_URL, DEV_ORIGIN } from "../api/profile";
import type {
  PracticeAccount,
  PracticeContext,
  PracticeEnrollReceipt,
  PracticeLedger,
  PracticePayoutPage,
  PracticePayoutReceipt,
  PracticePrices,
  PracticeRecordedOrder,
  PracticeSigningWindowReceipt,
} from "../api/practice-v1";
import type {
  IntentReceipt,
  IntentStatus,
  SignedIntent,
} from "../api/frontend-v1";
export const requestId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const accountPath = (id: string) => {
  if (!/^[a-f0-9]{64}$/.test(id))
    throw Error("Invalid practice account identity.");
  return `/v1/accounts/${id}`;
};
export function assertPracticeAccount(a: PracticeAccount, wallet: string) {
  if (
    a.wallet !== wallet ||
    !/^[a-f0-9]{64}$/.test(a.account) ||
    a.provenance.lane !== "practice" ||
    a.provenance.purpose !== "synthetic_test" ||
    a.provenance.chain_origin !== false ||
    a.provenance.real_funds !== false ||
    a.market !== "0" ||
    a.provenance.sdk_profile !== "setl8-sdk-dev-v1" ||
    a.provenance.sdk_version !== "0.1.0-dev.4"
  )
    throw Error(
      "The response is not this wallet's supported synthetic replay practice account.",
    );
  return a;
}
export class PracticeHttp {
  constructor(
    readonly client: ApiClient = api,
    readonly origin = globalThis.location?.origin ?? "",
  ) {}
  private guard() {
    if (this.client.base !== DEV_API_URL || this.origin !== DEV_ORIGIN)
      throw Error(
        "Practice execution is available only in the isolated localhost:3000 profile.",
      );
  }
  private read<T>(path: string, signal?: AbortSignal) {
    this.guard();
    return this.client.request<T>(path, { signal, maxBytes: 262144 });
  }
  private post<T>(path: string, body: unknown, signal?: AbortSignal) {
    this.guard();
    return this.client.request<T>(path, {
      body,
      signal,
      protectedPost: true,
      maxBytes: 262144,
    });
  }
  async context(wallet: string, signal?: AbortSignal) {
    let c: PracticeContext;
    try {
      c = await this.read<PracticeContext>("/v1/practice/context", signal);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404)
        throw Error(
          "The practice backend is not activated yet. Its required routes are unavailable; this is not an empty account.",
        );
      throw e;
    }
    if (
      c.wallet !== wallet ||
      c.practice_version !== "1" ||
      c.automatic_execution !== true
    )
      throw Error("Practice response/session identity mismatch.");
    c.accounts.forEach((a) => assertPracticeAccount(a, wallet));
    return c;
  }
  async enroll(wallet: string, id: string, signal?: AbortSignal) {
    const r = await this.post<PracticeEnrollReceipt>(
      "/v1/practice/accounts",
      { request_id: id },
      signal,
    );
    assertPracticeAccount(r.account, wallet);
    return r;
  }
  async ledger(a: PracticeAccount, signal?: AbortSignal) {
    const r = await this.read<PracticeLedger>(
      `/v1/practice/accounts/${a.account}/ledger`,
      signal,
    );
    assertPracticeAccount(r.account, a.wallet);
    if (r.account.account !== a.account) throw Error("Ledger account changed.");
    return r;
  }
  intent(a: PracticeAccount, body: SignedIntent, signal?: AbortSignal) {
    return this.post<IntentReceipt>(
      accountPath(a.account) + "/intents",
      body,
      signal,
    );
  }
  status(a: PracticeAccount, nonce: string, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(nonce) || BigInt(nonce) > 4294967295n)
      throw Error("Order reference must be an explicit unsigned 32-bit value.");
    return this.read<IntentStatus>(
      accountPath(a.account) + "/intents/" + nonce,
      signal,
    );
  }
  signingWindow(a: PracticeAccount, id: string, signal?: AbortSignal) {
    return this.post<PracticeSigningWindowReceipt>(
      `/v1/practice/accounts/${a.account}/signing-window`,
      { request_id: id },
      signal,
    );
  }
  prices(
    a: PracticeAccount,
    after: string | null,
    through: string | null,
    signal?: AbortSignal,
  ) {
    const q = new URLSearchParams({ limit: "100" });
    if (after !== null) q.set("after", after);
    if (through !== null) q.set("through", through);
    return this.read<PracticePrices>(
      `/v1/practice/accounts/${a.account}/prices?${q}`,
      signal,
    );
  }
  recordedOrder(a: PracticeAccount, nonce: string, signal?: AbortSignal) {
    return this.read<PracticeRecordedOrder>(
      `/v1/practice/accounts/${a.account}/orders/${nonce}`,
      signal,
    );
  }
  payouts(after: string | null, signal?: AbortSignal) {
    return this.read<PracticePayoutPage>(
      "/v1/practice/payouts?limit=25" +
        (after ? "&after=" + encodeURIComponent(after) : ""),
      signal,
    );
  }
  payout(a: PracticeAccount, amount: string, id: string, signal?: AbortSignal) {
    return this.post<PracticePayoutReceipt>(
      "/v1/practice/payouts",
      { request_id: id, account: a.account, amount_micro_usd: amount },
      signal,
    );
  }
  cancelPayout(id: string, request: string, signal?: AbortSignal) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Invalid payout request.");
    return this.post<PracticePayoutReceipt>(
      `/v1/practice/payouts/${id}/cancel`,
      { request_id: request },
      signal,
    );
  }
}
export const practiceHttp = new PracticeHttp();
