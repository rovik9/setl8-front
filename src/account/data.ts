import {
  PublicKey,
  p30Devnet,
  type TradingAccount,
  type RuleSet,
  type SectorConfig,
} from "@setl8/p30-sdk";
import descriptor from "../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
import { DirectRpc } from "../buy/rpc";
import { readPair } from "../buy/preflight";
import { un64, u64 } from "../buy/bytes";
import proof from "../data/devnet-proof.json";
export const PAGE_SIZE = 10n;
export const ctx = new p30Devnet.Context(descriptor);
export const A1_WALLET = proof.sections[0].items.find(
  (i) => i.label === "A1 trader wallet",
)!.value;
export const A1_ACCOUNT = proof.sections[0].items.find(
  (i) => i.label === "A1 trading account",
)!.value;
export function publicAddress(value: string) {
  try {
    if (new PublicKey(value).toBase58() !== value) throw Error();
    return value;
  } catch {
    throw Error("Enter a canonical Solana public address.");
  }
}
export function pageIds(counter: string, page: string) {
  const count = BigInt(u64(counter)),
    offset = BigInt(u64(page)) * PAGE_SIZE;
  if (offset >= count) return [];
  const ids: bigint[] = [];
  for (let i = 0n; i < PAGE_SIZE && offset + i < count; i++)
    ids.push(count - 1n - offset - i);
  return ids;
}
export interface AccountRow {
  id: string;
  address: string;
  state: "checked" | "missing" | "unverified";
  account?: TradingAccount;
  reason?: string;
}
export interface AccountPage {
  wallet: string;
  page: string;
  counter: string;
  rows: AccountRow[];
  slots: string[];
  observedAt: string;
  rules: RuleSet | null;
  config: SectorConfig | null;
  rulesError: string | null;
  profileFound: boolean;
}
export interface AccountPort {
  readonly mode: "public_read" | "offline_mock";
  read(wallet: string, page: string, signal: AbortSignal): Promise<AccountPage>;
  demo(signal: AbortSignal): Promise<AccountPage>;
}
export class AccountReader implements AccountPort {
  readonly mode = "public_read" as const;
  private busy = false;
  constructor(
    private rpc = new DirectRpc(),
    private now = () => Date.now(),
  ) {}
  private async genesis(signal: AbortSignal) {
    this.rpc.begin();
    for (const p of [0, 1] as const)
      if (
        (await this.rpc.read(p, "getGenesisHash", [], signal)) !==
        descriptor.genesisHash
      )
        throw Error("Could not check the reviewed devnet identity.");
  }
  async read(
    wallet: string,
    page: string,
    signal: AbortSignal,
  ): Promise<AccountPage> {
    if (this.busy)
      throw Error(
        "Another public check is finishing. Refresh again when it completes.",
      );
    this.busy = true;
    try {
      publicAddress(wallet);
      u64(page);
      await this.genesis(signal);
      const trader = new PublicKey(wallet),
        profile = ctx.wallet(trader)[0],
        first = await readPair(this.rpc, [profile.toBase58()], signal),
        a = first.accounts[profile.toBase58()];
      let counter = "0";
      if (a) {
        if (a.executable)
          throw Error(
            "The wallet profile is executable, not a verified profile.",
          );
        const decoded = ctx.decodeWalletProfile(
          profile,
          new PublicKey(a.owner),
          un64(a.data[0]),
        );
        if (!decoded.trader.equals(trader))
          throw Error("Wallet profile trader mismatch.");
        counter = decoded.nextChallengeId.toString();
      }
      const ids = pageIds(counter, page),
        addresses = ids.map((id) =>
          ctx.tradingAccount(trader, id)[0].toBase58(),
        ),
        last = await readPair(
          this.rpc,
          [...addresses, descriptor.ruleset, descriptor.config],
          signal,
          first.minSlot,
        ),
        rows = ids.map((id, i) =>
          this.decode(wallet, id, addresses[i], last.accounts[addresses[i]]),
        );
      let rules: RuleSet | null = null,
        config: SectorConfig | null = null,
        rulesError: string | null = null;
      try {
        const r = last.accounts[descriptor.ruleset];
        if (!r || r.executable) throw Error();
        rules = ctx.decodeRuleSet(
          ctx.ruleset()[0],
          new PublicKey(r.owner),
          un64(r.data[0]),
        );
        const c = last.accounts[descriptor.config];
        if (!c || c.executable) throw Error();
        config = ctx.decodeSectorConfig(
          ctx.config()[0],
          new PublicKey(c.owner),
          un64(c.data[0]),
        );
      } catch {
        rulesError =
          "Current rules could not be verified. No trading or purchase readiness is implied.";
      }
      if (signal.aborted) throw Error("Public check cancelled.");
      return {
        wallet,
        page,
        counter,
        rows,
        slots: last.slots,
        observedAt: String(this.now()),
        rules,
        config,
        rulesError,
        profileFound: !!a,
      };
    } finally {
      this.busy = false;
    }
  }
  private decode(
    wallet: string,
    id: bigint,
    address: string,
    a: import("../buy/preflight").RpcAccount | null,
  ): AccountRow {
    if (!a)
      return {
        id: id.toString(),
        address,
        state: "missing",
        reason: "Not found at this read; history coverage is unknown.",
      };
    try {
      if (a.executable) throw Error();
      const v = ctx.decodeTradingAccount(
        new PublicKey(address),
        new PublicKey(a.owner),
        un64(a.data[0]),
      );
      if (!v.trader.equals(new PublicKey(wallet)) || v.challengeId !== id)
        throw Error();
      return { id: id.toString(), address, state: "checked", account: v };
    } catch {
      return {
        id: id.toString(),
        address,
        state: "unverified",
        reason:
          "Could not verify owner, trader, layout or PDA. Not shown as a verified account.",
      };
    }
  }
  async demo(signal: AbortSignal): Promise<AccountPage> {
    if (this.busy)
      throw Error("Another public check is finishing. Try again shortly.");
    this.busy = true;
    try {
      await this.genesis(signal);
      const address = ctx
        .tradingAccount(new PublicKey(A1_WALLET), 0n)[0]
        .toBase58();
      if (address !== A1_ACCOUNT)
        throw Error("Recorded A1 address differs from the pinned derivation.");
      const r = await readPair(this.rpc, [address], signal);
      if (signal.aborted) throw Error("Public check cancelled.");
      return {
        wallet: A1_WALLET,
        page: "0",
        counter: "1",
        rows: [this.decode(A1_WALLET, 0n, address, r.accounts[address])],
        slots: r.slots,
        observedAt: String(this.now()),
        rules: null,
        config: null,
        rulesError: null,
        profileFound: false,
      };
    } finally {
      this.busy = false;
    }
  }
}
