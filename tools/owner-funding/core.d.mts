/** Types for the isolated JS funding helper; no runtime release or transport is provided here. */
import type { TransactionInstruction } from "@solana/web3.js";
export const INTENT: Readonly<{
  id: "owner-first-tier-devnet-funding-2026-11-02-v1";
  genesis: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
  payer: "98j1TXdxt77vsDVcLmABWyMP2bWXVoYqRg85nGVGvcth";
  owner: "J95j3drvYgYNrT3cocwSoR8hWd5zsaqVr12eW7UxL7zC";
  mint: "2kBKxj3TYz2UbQfVcJ5xBbWscC5hrALq7MLzJi3c1fTx";
  ata: "Fo6ASykY9yr5phVCFTFt3HiV79jK3g7QHBpy76z7jHCM";
  amountMicro: "30120000";
  decimals: 6;
  transferLamports: "20000000";
  aggregatePayerCapLamports: "25000000";
}>;
export const TOKEN: string, ATA_PROGRAM: string, JOURNAL_ROOT: string;
export const STAGE2_RELEASE: Readonly<{
  enabled: boolean;
  originReference: string | null;
}>;
export const FUNDING_ADDRESSES: readonly string[];
export interface DecodedFundingMessage {
  legacy: true;
  payer: string;
  requiredSigners: string[];
  accountKeys: string[];
  instructions: {
    index: number;
    program: string;
    accounts: string[];
    dataHex: string;
    kind: string;
    amountMicro?: string;
    decimals?: number;
    lamports?: string;
  }[];
}
export interface FundingBudget {
  transferLamports: string;
  ATA_rentLamports: string;
  networkFeeLamports: string;
  expectedAggregateDebitLamports: string;
  approvedCapLamports: string;
}
export function sha(bytes: string | Uint8Array): string;
export function assertIdentity(value: string): string;
export function checkKeeperIdentity(): {
  publicKey: string;
  matchesApprovedPayer: true;
  actualSignatureCreated: false;
};
export function fundingInstructions(): TransactionInstruction[];
export function compileFunding(blockhash: string): {
  messageHex: string;
  messageHash: string;
  unsignedBase64: string;
  blockhash: string;
  decoded: DecodedFundingMessage;
};
export function inspectFundingMessage(
  bytes: Uint8Array,
  expectedBlockhash: string,
): DecodedFundingMessage;
export function fundingBudget(
  rent: unknown,
  fee: unknown,
  payerBalance: unknown,
): FundingBudget;
export function assertFreshContext(context: unknown, now?: number): void;
export class FundingJournal {
  constructor(root?: string);
  readonly root: string;
  initialize(): this;
  event(kind: string, publicData?: Record<string, unknown>): void;
  claimSigning(hash: string): void;
  recordSignature(signature: string, hash: string): void;
  claimSend(signature: string, hash: string): void;
}
export function executeStagedFunding(
  context: unknown,
  options?: {
    revalidate?: (context: unknown) => Promise<unknown>;
    sendOnce?: (
      packet: Uint8Array,
      signature: string,
      context: unknown,
    ) => Promise<string>;
    journal?: FundingJournal;
  },
): Promise<{ signature: string; state: string }>;
export function inspectFundingAccounts(accounts: unknown): {
  payerLamports: string;
  ATA_rentLamports: string;
  mintSupplyMicro: string;
  ownerAndATAAbsent: true;
};
export function inspectUnsignedSimulation(
  simulation: unknown,
  context: unknown,
  baseline: unknown,
): {
  sameMessageHash: string;
  err: null;
  slot: string;
  unitsConsumed: string;
  observedPayerDebitLamports: string;
  postOwnerLamports: string;
  postATATokensMicro: string;
  advisory: true;
};
export function assertFundingForwardBoundary(
  context: unknown,
  packet: Uint8Array,
  signature: string,
  options?: {
    now?: number;
    release?: Readonly<{ enabled: boolean; originReference: string | null }>;
  },
): void;
