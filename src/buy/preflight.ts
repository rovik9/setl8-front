import { DirectRpc } from "./rpc";
import { hash, hex, un64, b64, u64, safeNumber, fromHex } from "./bytes";
import descriptor from "../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json";
import identity from "../purchase/p30-artifact.json";
import { prepareP30UnsignedPurchase } from "../purchase/prepareUnsigned";
import { exactRent, RENT_SYSVAR } from "./rentEvidence";
import type { CheckedPurchase } from "./direct-types";
export const CLASSIC_TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  LOADER = "BPFLoaderUpgradeab1e11111111111111111111111",
  SYSTEM = "11111111111111111111111111111111";
export interface RpcAccount {
  owner: string;
  executable: boolean;
  lamports: string;
  data: [string, "base64"];
}
function must(v: unknown, message: string): asserts v {
  if (!v) throw Error(message);
}
function bytes(a: RpcAccount) {
  must(
    Array.isArray(a.data) && a.data[1] === "base64",
    "The account encoding could not be checked.",
  );
  return un64(a.data[0]);
}
/** Independent operators overlap; each operator's sequence stays ordered. */
async function bothProviders<T>(
  signal: AbortSignal,
  read: (provider: 0 | 1, signal: AbortSignal) => Promise<T>,
) {
  const group = new AbortController();
  const cancel = () => group.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    return await Promise.all(
      ([0, 1] as const).map((p) => read(p, group.signal)),
    );
  } finally {
    group.abort();
    signal.removeEventListener("abort", cancel);
  }
}
export async function readPair(
  rpc: DirectRpc,
  addresses: string[],
  signal: AbortSignal,
  min = "0",
) {
  const responses = await bothProviders(signal, (p, signal) =>
    rpc.read(
      p,
      "getMultipleAccounts",
      [
        addresses,
        {
          encoding: "base64",
          commitment: "finalized",
          minContextSlot: safeNumber(min),
        },
      ],
      signal,
    ),
  );
  const values: Record<string, RpcAccount | null>[] = [];
  const slots: string[] = [];
  for (const r of responses) {
    const slot = u64(r?.context?.slot);
    must(
      BigInt(slot) >= BigInt(min) &&
        Array.isArray(r.value) &&
        r.value.length === addresses.length,
      "The finalized read context is incomplete.",
    );
    const map: Record<string, RpcAccount | null> = {};
    addresses.forEach((key, i) => {
      const a = r.value[i];
      if (a !== null) {
        must(
          a && typeof a.owner === "string" && typeof a.executable === "boolean",
          "The account response is unavailable.",
        );
        u64(a.lamports);
        bytes(a);
      }
      map[key] =
        a === null
          ? null
          : {
              owner: a.owner,
              executable: a.executable,
              lamports: u64(a.lamports),
              data: a.data,
            };
    });
    values.push(map);
    slots.push(slot);
  }
  // Compare decision bytes/owners/presence, not provider-specific bank/context slots.
  for (const k of addresses) {
    const project = (a: RpcAccount | null) =>
      a === null
        ? null
        : {
            owner: a.owner,
            executable: a.executable,
            lamports: a.lamports,
            data: a.data,
          };
    must(
      JSON.stringify(project(values[0][k])) ===
        JSON.stringify(project(values[1][k])),
      "The public providers disagree. Check again later.",
    );
  }
  return {
    accounts: values[0],
    slots,
    minSlot: slots.reduce((a, b) => (BigInt(a) > BigInt(b) ? a : b)),
    receivedAt: String(Date.now()),
  };
}
export async function verifyProgramImage(
  program: RpcAccount | null,
  data: RpcAccount | null,
  dataAddress: string,
  imageHash: string,
  imageSize: string,
  slot: string,
) {
  must(
    program &&
      data &&
      program.owner === LOADER &&
      program.executable &&
      data.owner === LOADER &&
      !data.executable,
    "The reviewed program identity could not be verified.",
  );
  const p = bytes(program),
    d = bytes(data),
    sdk = await import("@setl8/p30-sdk");
  must(
    p.length === 36 &&
      new DataView(p.buffer, p.byteOffset).getUint32(0, true) === 2 &&
      new sdk.PublicKey(p.slice(4)).toBase58() === dataAddress,
    "Unexpected program-data link.",
  );
  const size = safeNumber(imageSize);
  must(
    d.length >= 45 + size &&
      new DataView(d.buffer, d.byteOffset).getUint32(0, true) === 3 &&
      d[12] === 1 &&
      new sdk.PublicKey(d.slice(13, 45)).toBase58() ===
        descriptor.upgradeAuthority,
    "The program upgrade authority changed.",
  );
  must(
    BigInt(slot) >=
      new DataView(d.buffer, d.byteOffset).getBigUint64(4, true) &&
      d.slice(45 + size).every((x) => x === 0) &&
      (await hash(d.slice(45, 45 + size))) === imageHash,
    "The executable image differs from the reviewed P30 profile.",
  );
}
function token(
  a: RpcAccount | null,
  mint: string,
  owner: string,
  label: string,
) {
  must(
    a && a.owner === CLASSIC_TOKEN && !a.executable,
    `${label} is missing or unavailable. Create/initialize it separately; this page does not create or fund accounts.`,
  );
  const b = bytes(a);
  must(
    b.length === 165 &&
      hex(b.slice(0, 32)) === hexKey(mint) &&
      hex(b.slice(32, 64)) === hexKey(owner) &&
      b[108] === 1,
    `${label} has the wrong owner, mint or usable state.`,
  );
  return new DataView(b.buffer, b.byteOffset).getBigUint64(64, true);
}
// Public-key decoding only, never transaction construction/serialization.
import bs58 from "bs58";
const hexKey = (s: string) => {
  const b = bs58.decode(s);
  must(b.length === 32, "Invalid public address");
  return hex(b);
};
interface ReviewEvidence {
  addresses: string[];
  baseline: Record<string, RpcAccount | null>;
  oldest: number;
  floor: string;
  rentSizes: number[];
  rentQuotes: string[];
}
export class PurchasePreflight {
  private evidence = new WeakMap<CheckedPurchase, ReviewEvidence>();
  contextFloor(c: CheckedPurchase) {
    return this.evidence.get(c)?.floor ?? c.minSlot;
  }
  constructor(
    readonly rpc: DirectRpc,
    private now = () => Date.now(),
  ) {}
  private current(c: CheckedPurchase) {
    const e = this.evidence.get(c);
    must(
      e,
      "Original review evidence is unavailable; explicitly create a new review.",
    );
    must(
      this.now() >= Number(c.checkedAt) &&
        this.now() < Number(c.expiresAt) &&
        this.now() < e.oldest + 60000,
      "The original review expired; do not silently renew or repay.",
    );
    return e;
  }
  async check(
    wallet: string,
    tier: string,
    epoch: number,
    signal: AbortSignal,
    minContextSlot = "0",
  ): Promise<CheckedPurchase> {
    must(/^[0-9]$/.test(tier), "Choose one of the ten challenge sizes.");
    hexKey(wallet);
    const sdk = await import("@setl8/p30-sdk"),
      ctx = new sdk.p30Devnet.Context(descriptor),
      trader = new sdk.PublicKey(wallet),
      started = this.now();
    this.rpc.begin("review");
    const genesis = await bothProviders(signal, (p, signal) =>
      this.rpc.read(p, "getGenesisHash", [], signal),
    );
    must(
      genesis.every((value) => value === descriptor.genesisHash),
      "The public endpoint is not the reviewed Solana devnet.",
    );
    const programs = [descriptor.levProgramId, descriptor.vaultProgramId],
      programData = programs.map((p) =>
        sdk.PublicKey.findProgramAddressSync(
          [new sdk.PublicKey(p).toBytes()],
          new sdk.PublicKey(LOADER),
        )[0].toBase58(),
      );
    const walletAddress = ctx.wallet(trader)[0].toBase58(),
      source = ctx.tokenAccount(trader, "usdc").toBase58(),
      platform = ctx
        .tokenAccount(new sdk.PublicKey(descriptor.vaultSl8Wallet), "usdc")
        .toBase58(),
      feeDest = ctx
        .tokenAccount(new sdk.PublicKey(descriptor.feeWallet), "usdc")
        .toBase58();
    // Discover only the counter first; full executable images are downloaded ONCE per provider at creation.
    const first = await readPair(
        this.rpc,
        [walletAddress],
        signal,
        minContextSlot,
      ),
      initialWallet = first.accounts[walletAddress];
    let next = 0n;
    if (initialWallet !== null) {
      must(!initialWallet.executable, "Wallet profile is not usable.");
      const v = ctx.decodeWalletProfile(
        new sdk.PublicKey(walletAddress),
        new sdk.PublicKey(initialWallet.owner),
        bytes(initialWallet),
      );
      must(
        v.trader.equals(trader) && v.banned === 0 && v.activeCount < 5,
        "Wallet profile does not permit a new account.",
      );
      next = v.nextChallengeId;
    }
    must(next < 18446744073709551615n, "Wallet challenge counter exhausted.");
    const expectedAccount = ctx.tradingAccount(trader, next)[0].toBase58(),
      traderState = ctx.traderState(trader, next)[0].toBase58();
    const base = [
      ...programs,
      ...programData,
      descriptor.config,
      descriptor.ruleset,
      descriptor.registry,
      descriptor.vaultState,
      descriptor.usdcMint,
      descriptor.usdcPool,
      walletAddress,
      wallet,
      source,
      platform,
      feeDest,
      expectedAccount,
      traderState,
      RENT_SYSVAR,
    ];
    const last = await readPair(this.rpc, base, signal, first.minSlot),
      m = last.accounts;
    must(
      JSON.stringify(initialWallet) === JSON.stringify(m[walletAddress]),
      "Wallet counter/state changed during discovery; explicitly refresh.",
    );
    must(
      m[expectedAccount] === null && m[traderState] === null,
      "Next account is occupied; reconcile existing history.",
    );
    const required = (key: string) => {
      const a = m[key];
      must(
        a && !a.executable,
        "A required configuration account is unavailable.",
      );
      return a;
    };
    const configAccount = required(descriptor.config),
      rulesAccount = required(descriptor.ruleset),
      registryAccount = required(descriptor.registry),
      vaultAccount = required(descriptor.vaultState);
    const config = ctx.decodeSectorConfig(
        ctx.config()[0],
        new sdk.PublicKey(configAccount.owner),
        bytes(configAccount),
      ),
      rules = ctx.decodeRuleSet(
        ctx.ruleset()[0],
        new sdk.PublicKey(rulesAccount.owner),
        bytes(rulesAccount),
      ),
      registry = ctx.decodeProductRegistry(
        ctx.registry()[0],
        new sdk.PublicKey(registryAccount.owner),
        bytes(registryAccount),
      ),
      vault = ctx.decodeVaultState(
        ctx.vaultState()[0],
        new sdk.PublicKey(vaultAccount.owner),
        bytes(vaultAccount),
      );
    must(
      config.paused === 0 && registry.active && registry.pauseReason === 0,
      "New purchases are paused in the checked configuration.",
    );
    const index = Number(tier);
    must(
      index < rules.tierCount,
      "This tier is unavailable in the checked configuration.",
    );
    for (let i = 0; i < rules.tierCount; i++) {
      const matches = registry.challengeSizes.filter(
        (t) => t.size === rules.tierSize[i],
      );
      must(
        matches.length === 1 &&
          matches[0].cost === rules.tierCost[i] &&
          rules.tierCost[i] > 0n &&
          rules.tierSize[i] > 0n,
        "Registry and ruleset prices/sizes do not match.",
      );
    }

    for (let i = 0; i < 2; i++)
      await verifyProgramImage(
        m[programs[i]],
        m[programData[i]],
        programData[i],
        i === 0 ? descriptor.levImageSha256 : descriptor.vaultImageSha256,
        i === 0 ? descriptor.levImageSize : descriptor.vaultImageSize,
        last.minSlot,
      );
    const mint = required(descriptor.usdcMint),
      mintBytes = bytes(mint);
    must(
      mint.owner === CLASSIC_TOKEN &&
        mintBytes.length === 82 &&
        mintBytes[44] === 6 &&
        mintBytes[45] === 1,
      "The approved six-decimal classic test-USDC mint is unavailable.",
    );
    const price = rules.tierCost[index],
      fee = (price * BigInt(rules.feeBps) + 9999n) / 10000n,
      total = price + fee;
    u64(total.toString());
    must(
      token(m[source], descriptor.usdcMint, wallet, "Your test-USDC account") >=
        total,
      "Insufficient test USDC. Fund the existing account separately; no tokens are created here.",
    );
    token(
      m[descriptor.usdcPool],
      descriptor.usdcMint,
      ctx.vaultState()[0].toBase58(),
      "The vault pool",
    );
    token(
      m[platform],
      descriptor.usdcMint,
      vault.sl8Wallet.toBase58(),
      "The vault destination",
    );
    token(
      m[feeDest],
      descriptor.usdcMint,
      config.sl8Wallet.toBase58(),
      "The fee destination",
    );
    const payer = required(wallet);
    must(
      payer.owner === SYSTEM && bytes(payer).length === 0,
      "The connected payer is not a usable system wallet.",
    );
    const latest = await this.rpc.read(
        0,
        "getLatestBlockhash",
        [{ commitment: "confirmed", minContextSlot: safeNumber(last.minSlot) }],
        signal,
      ),
      blockhash = latest?.value?.blockhash,
      lastHeight = u64(latest?.value?.lastValidBlockHeight);
    hexKey(blockhash);
    must(
      BigInt(u64(latest.context.slot)) >= BigInt(last.minSlot),
      "Blockhash context is behind the original state.",
    );
    const valid = await this.rpc.read(
      1,
      "isBlockhashValid",
      [
        blockhash,
        { commitment: "confirmed", minContextSlot: safeNumber(last.minSlot) },
      ],
      signal,
    );
    must(
      valid.value === true &&
        BigInt(u64(valid.context.slot)) >= BigInt(last.minSlot),
      "The selected original blockhash is not corroborated.",
    );
    for (const p of [0, 1] as const)
      must(
        BigInt(
          u64(
            await this.rpc.read(
              p,
              "getBlockHeight",
              [{ commitment: "confirmed" }],
              signal,
            ),
          ),
        ) <= BigInt(lastHeight),
        "Original blockhash expired.",
      );
    const prepared = await prepareP30UnsignedPurchase({
      inputKind: "p30-public-unsigned-input-v1",
      sdkProfile: identity.profile,
      descriptor,
      connectedWallet: wallet,
      trader: wallet,
      sessionEpoch: epoch,
      expectedAccount,
      nextChallengeId: next.toString(),
      tierIndex: tier,
      mint: "usdc",
      recentBlockhash: blockhash,
      priorityFee: { kind: "omitted" },
    });
    for (const [k, v] of Object.entries(identity))
      must(
        prepared.sdk[k as keyof typeof identity] === v,
        "Prepared SDK tuple differs.",
      );
    const sizes = [...(initialWallet === null ? [56] : []), 207, 115],
      rentQuotes = sizes.map((size) => exactRent(m[RENT_SYSVAR], size)),
      rent = rentQuotes.reduce((a, b) => a + BigInt(b), 0n),
      fees = await bothProviders(signal, async (p, signal) => {
        const f = await this.rpc.read(
          p,
          "getFeeForMessage",
          [
            b64(fromHex(prepared.messageHex)),
            {
              commitment: "confirmed",
              minContextSlot: safeNumber(last.minSlot),
            },
          ],
          signal,
        );
        must(
          BigInt(u64(f.context.slot)) >= BigInt(last.minSlot),
          "Original fee context is behind the checked state.",
        );
        const fee = u64(f.value);
        for (let i = 0; i < sizes.length; i++)
          must(
            u64(
              await this.rpc.read(
                p,
                "getMinimumBalanceForRentExemption",
                [sizes[i], { commitment: "finalized" }],
                signal,
              ),
            ) === rentQuotes[i],
            "RPC rent and exact verified Rent sysvar disagree.",
          );
        return fee;
      });
    must(
      fees[0] === fees[1],
      "Original exact-message fee observations disagree.",
    );
    const sol = BigInt(fees[0]) + rent;
    must(
      BigInt(payer.lamports) >= sol,
      `Insufficient devnet SOL: exact network fee/rent require ${sol} lamports.`,
    );
    const fingerprint = await hash(JSON.stringify(base.map((k) => [k, m[k]]))),
      created = this.now(),
      expiry = Math.min(created + 30000, started + 60000);
    must(
      created >= started && created < expiry && !signal.aborted,
      "Oldest decision evidence exceeded60s or creation was interrupted.",
    );
    const c = Object.freeze({
      wallet,
      epoch,
      tier,
      size: rules.tierSize[index].toString(),
      price: price.toString(),
      feeBps: String(rules.feeBps),
      fee: fee.toString(),
      total: total.toString(),
      solRequired: sol.toString(),
      networkFee: fees[0],
      rent: rent.toString(),
      blockhash,
      lastValidBlockHeight: lastHeight,
      checkedAt: String(created),
      oldestEvidenceAt: String(started),
      expiresAt: String(expiry),
      minSlot: last.minSlot,
      fingerprint,
      expectedAccount,
      nextChallengeId: next.toString(),
      prepared,
      checks: Object.freeze([
        "Both fixed endpoints report the pinned devnet genesis",
        "Complete executable images and upgrade identities match the pinned tuple",
        "Current config/rules/registry/vault and wallet counter checked",
        "Expected account/trader state are vacant",
        "Existing test-USDC accounts, identities and funds checked",
        "Exact original-message fee and corroborated Rent sysvar budget covered",
      ]),
    });
    this.evidence.set(c, {
      addresses: base,
      baseline: m,
      oldest: started,
      floor: last.minSlot,
      rentSizes: sizes,
      rentQuotes,
    });
    return c;
  }
  async revalidate(
    c: CheckedPurchase,
    signal: AbortSignal,
    phase = "revalidation",
  ) {
    const e = this.current(c);
    must(!signal.aborted, "Original review check cancelled.");
    this.rpc.begin(phase);
    // Reread ALL original mutable dependencies and FULL program/program-data bytes. No discovery/recompilation.
    const fresh = await readPair(this.rpc, e.addresses, signal, e.floor);
    for (const k of e.addresses)
      must(
        JSON.stringify(fresh.accounts[k]) === JSON.stringify(e.baseline[k]),
        "Original program/config/counter/token/rent or vacancy evidence changed. No prompt/send permitted.",
      );
    // Exact original full bytes imply the initial image hash/decoder result; no header-only inference.
    for (let i = 0; i < e.rentSizes.length; i++)
      must(
        exactRent(fresh.accounts[RENT_SYSVAR], e.rentSizes[i]) ===
          e.rentQuotes[i],
        "Original verified rent budget changed.",
      );
    for (const p of [0, 1] as const) {
      // Three independent reads, max3 in flight at ONE provider. Abort siblings on error;
      // the next provider is never scheduled after a denied/failed group. No retry/failover.
      const group = new AbortController(),
        cancel = () => group.abort();
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) group.abort();
      const read = async (method: string, params: unknown[]) => {
        try {
          return await this.rpc.read(p, method, params, group.signal);
        } catch (error) {
          group.abort();
          throw error;
        }
      };
      try {
        const context = {
          commitment: "confirmed",
          minContextSlot: safeNumber(fresh.minSlot),
        };
        const [f, v, height] = await Promise.all([
          read("getFeeForMessage", [
            b64(fromHex(c.prepared.messageHex)),
            context,
          ]),
          read("isBlockhashValid", [c.blockhash, context]),
          read("getBlockHeight", [{ commitment: "confirmed" }]),
        ]);
        must(
          u64(f.value) === c.networkFee &&
            BigInt(u64(f.context.slot)) >= BigInt(fresh.minSlot),
          "Original exact-message fee changed or is unavailable.",
        );
        must(
          v.value === true &&
            BigInt(u64(v.context.slot)) >= BigInt(fresh.minSlot),
          "Original blockhash is not valid.",
        );
        must(
          BigInt(u64(height)) <= BigInt(c.lastValidBlockHeight),
          "Original blockhash expired.",
        );
      } finally {
        signal.removeEventListener("abort", cancel);
        group.abort();
      }
    }
    this.current(c);
    must(!signal.aborted, "Original review check cancelled.");
    e.floor = fresh.minSlot;
  }
}
