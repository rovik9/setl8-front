import { API_URL } from "../api/client";
import type { PreparedDraft } from "../data/orderDraft";
export const PROTOTYPE_URL = "http://127.0.0.1:8790";
export const PROTOTYPE_ORIGIN = "http://127.0.0.1:5173";
export const PROTOTYPE_OPT_IN = "local-synthetic-v1";
export interface PrototypeInfo {
  id: string;
  account: string;
  wallet: string;
  walletHex: string;
  clock: string;
  phase: string;
  gateway: typeof PROTOTYPE_URL;
  origin: typeof PROTOTYPE_ORIGIN;
}
export interface PrototypeBridge {
  info: PrototypeInfo;
  readInfo(): Promise<PrototypeInfo>;
  signLogin(message: number[]): Promise<number[]>;
  signOrder(draft: PreparedDraft): Promise<string>;
  operate(
    action: "stage-open" | "stage-close" | "evaluate" | "recover",
  ): Promise<PrototypeInfo>;
}
declare global {
  interface Window {
    __SETL8_PROTOTYPE__?: PrototypeBridge;
  }
}
/** Exact explicit developer opt-in, never a backend readiness/admission assertion. */
export function prototypeProfile(
  base: string,
  optIn: string | undefined,
  origin: string,
) {
  return (
    base === PROTOTYPE_URL &&
    optIn === PROTOTYPE_OPT_IN &&
    origin === PROTOTYPE_ORIGIN
  );
}
export function prototypeEnabled() {
  return prototypeProfile(
    API_URL,
    import.meta.env?.VITE_PROTOTYPE_OPT_IN,
    window.location.origin,
  );
}
export function prototypeBridge(): PrototypeBridge | null {
  if (!prototypeEnabled()) return null;
  const b = window.__SETL8_PROTOTYPE__,
    i = b?.info;
  if (
    !b ||
    !i ||
    i.gateway !== PROTOTYPE_URL ||
    i.origin !== PROTOTYPE_ORIGIN ||
    !/^[a-f0-9]{64}$/.test(i.account) ||
    !/^[a-f0-9]{64}$/.test(i.walletHex) ||
    !i.id ||
    !i.wallet
  )
    return null;
  return b;
}
export function assertSyntheticDraft(
  draft: PreparedDraft,
  info: PrototypeInfo,
  walletHex: string,
) {
  if (
    draft.scope.gateway !== PROTOTYPE_URL ||
    draft.scope.mode !== "prototype" ||
    draft.scope.account !== info.account ||
    draft.scope.wallet !== walletHex ||
    walletHex !== info.walletHex ||
    draft.scope.syntheticSession !== info.id ||
    draft.scope.market !== "0" ||
    draft.profile !== "setl8-sdk-dev-v1" ||
    draft.sdkVersion !== "0.1.0-dev.4"
  )
    throw new Error("Draft is outside this disposable synthetic session.");
  const d = draft.decoded;
  if (
    ![0, 3].includes(d.kind) ||
    d.market !== 0 ||
    d.side !== 0 ||
    d.priceE12 !== "0" ||
    d.slE12 !== "0" ||
    d.tpE12 !== "0" ||
    d.targetNonce !== 0
  )
    throw new Error(
      "Only supported Buy Market / whole-position Close with zero protective levels may be submitted in this prototype. Other fields remain preview-only.",
    );
  if (d.kind === 3 && d.qty !== "0")
    throw new Error("Prototype Close uses qty=0 for the whole position.");
}
