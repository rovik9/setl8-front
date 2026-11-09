import verified from "../data/devnet-day2-verified-history.json";
import historyDto from "../data/devnet-day2-settlement-history.json";
import type { DevnetSettlementHistory } from "../api/devnet-settlement-history-v1";
import observation from "../data/devnet-day2-observation.json";
import accepted from "../data/devnet-proof.json";
/** A display consumer for the reviewed immutable DTO, never transaction authority. */
export function verifiedHistoryMatches(dto: DevnetSettlementHistory) {
  try {
    if (
      dto.format !== "setl8-devnet-public-rehearsal-settlement-history-v1" ||
      dto.visibility !== "public_rehearsal_example" ||
      dto.example_id !== "A1" ||
      dto.lane !== "devnet" ||
      dto.chain.cluster !== "devnet" ||
      dto.chain.genesis_hash !== verified.genesis_hash ||
      dto.chain.lev_program !== accepted.programs.lev.id ||
      dto.chain.vault_program !== accepted.programs.vault.id ||
      dto.account !== verified.account.address ||
      dto.trader !== verified.account.trader
    )
      return false;
    const t = dto.transfer,
      s = verified.settlement;
    if (
      t.state !== "finalized_token_transfer_verified" ||
      t.amount_atoms !== s.amount_micro_usdc ||
      t.decimals !== "6" ||
      t.mint !== s.mint ||
      t.source_pool !== s.source ||
      t.destination !== s.destination ||
      t.vault_authority !== s.authority ||
      t.recipient_balance_before_atoms !== s.before_micro_usdc ||
      t.recipient_balance_after_atoms !== s.after_micro_usdc ||
      BigInt(t.recipient_balance_after_atoms) -
        BigInt(t.recipient_balance_before_atoms) !==
        BigInt(t.amount_atoms) ||
      t.balance_basis !==
        "this_finalized_settlement_transaction_not_current_wallet_balance" ||
      t.instruction !== "classic_spl_transfer_checked" ||
      t.outer_instruction_index !== "1" ||
      t.stack_height !== "2"
    )
      return false;
    if (
      dto.api_version !== "1" ||
      dto.settlement_history_version !== "1" ||
      dto.transfer.display_symbol !== "TEST_USDC" ||
      dto.claim.correlation !==
        "referenced_in_finalize_and_settle_instruction_accounts" ||
      dto.claim.reported_status_is_not_independent_claim_decode !== true ||
      dto.provenance.infrastructure_independence !== "not_established" ||
      dto.provenance.raw_evidence_manifest_sha256 !==
        historyDto.provenance.raw_evidence_manifest_sha256 ||
      dto.limits.history_coverage !== "five_explicit_receipts_only" ||
      dto.limits.index_cursor !== null ||
      dto.limits.backend_submitted_transactions !== "0" ||
      dto.limits.current_token_balance_proven !== false
    )
      return false;
    if (
      dto.claim.address !== verified.claim ||
      dto.claim.typed_claim_fields_verified !== false ||
      dto.limits.connected_owner_history !== false ||
      dto.limits.application_live_execution_proven !== false ||
      dto.limits.repeated_finalization_or_settlement_authorized !== false
    )
      return false;
    if (
      dto.provenance.public_manifest_sha256 !==
        verified.source_manifest_sha256 ||
      dto.provenance.origin_review_sha256 !== verified.review_sha256 ||
      dto.provenance.receipt_result_sha256 !==
        verified.review_evidence_sha256 ||
      dto.provenance.operators.join(",") !==
        "solana_public_devnet,onfinality_public_devnet" ||
      verified.corroborated !== true ||
      verified.offline_verified !== true ||
      dto.receipts.length !== 5
    )
      return false;
    return (
      dto.receipts.every((r) => {
        const first = verified.providers.solana.receipts[r.action],
          second = verified.providers.onfinality.receipts[r.action];
        return (
          !!first &&
          !!second &&
          r.commitment === "finalized" &&
          r.transaction_error === null &&
          r.signature_verified === true &&
          r.anchor_discriminator_verified === true &&
          r.signature === first.signature &&
          r.signature === second.signature &&
          r.slot === first.slot &&
          r.slot === second.slot &&
          r.program === first.program &&
          r.packet_sha256 === first.packet_sha256 &&
          r.packet_sha256 === second.packet_sha256 &&
          r.message_sha256 === first.message_sha256 &&
          r.message_sha256 === second.message_sha256 &&
          r.source_response_sha256[0] === first.response_sha256 &&
          r.source_response_sha256[1] === second.response_sha256
        );
      }) && new Set(dto.receipts.map((r) => r.action)).size === 5
    );
  } catch {
    return false;
  }
}
const historical = historyDto as DevnetSettlementHistory;

/** Static source reporting is distinct from independent finalized receipt verification. */
export function day2HistoryStatus(sessionWallet: string | null) {
  const samePrograms = ["lev", "vault"].every((k) => {
    const key = k as "lev" | "vault";
    return (
      observation.programs[key].id === accepted.programs[key].id &&
      observation.programs[key].sha256 === accepted.programs[key].sha256
    );
  });
  const arithmeticMatches =
    BigInt(observation.reported.balance_after_micro_usdc) -
      BigInt(observation.reported.balance_before_micro_usdc) ===
      BigInt(observation.reported.delta_micro_usdc) &&
    observation.reported.delta_micro_usdc ===
      observation.reported.paid_micro_usdc;
  return {
    samePrograms,
    arithmeticMatches,
    receiptVerified: verifiedHistoryMatches(historical),
    label: verifiedHistoryMatches(historical)
      ? "Historical token settlement verified · two named RPC operators"
      : "Receipt verification unavailable",
    settlementHistory: historical,
    verification: verified,
    belongsToSession:
      !!sessionWallet && sessionWallet === observation.account.trader,
    canTransact: false as const,
    historySource: observation,
  };
}
import { recordedPurchaseFor } from "./recordedPurchase";
export type JourneyScope = {
  sessionWallet: string | null;
  observedWallet: string | null;
  account: string | null;
  trader: string | null;
  checked: boolean;
  slots: string[];
  passPending?: string;
  passRequestedAt?: string;
  passProposedAt?: string;
  /** Every local record (retained or archived) this browser holds, whatever wallet is signed in. */
  localRecords?: { wallet: string; expectedAccount: string }[];
  retainedAttempt?: {
    wallet: string;
    expectedAccount: string;
    stage?: string;
    signature?: string | null;
  } | null;
};
export function devnetJourney(scope: JourneyScope) {
  const owned =
    scope.checked &&
    !!scope.sessionWallet &&
    scope.sessionWallet === scope.observedWallet &&
    scope.trader === scope.sessionWallet;
  const attempt =
    scope.retainedAttempt?.wallet === scope.sessionWallet
      ? scope.retainedAttempt
      : null;
  // A local record always takes precedence; the recorded purchase is shown only when there is none.
  const recorded = attempt ? null : recordedPurchaseFor(scope);
  const localCopy =
    !!recorded &&
    (scope.localRecords ?? []).some(
      (r) =>
        r.wallet === recorded.wallet && r.expectedAccount === recorded.account,
    );
  return {
    owned,
    account: scope.account,
    steps: [
      {
        id: "wallet",
        title: "Wallet sign-in",
        state: scope.sessionWallet ? "Authenticated session" : "Connect wallet",
        description:
          "Message login verifies wallet control. It is not a token debit.",
      },
      {
        id: "purchase",
        title: "Wallet-approved purchase",
        recorded,
        localCopy,
        state: attempt
          ? "Recovery record retained"
          : recorded
            ? recorded.label
            : "No purchase receipt verified here",
        description: attempt
          ? "A local attempt/signature is not financial authority. Reconcile its exact signature in checkout."
          : recorded
            ? "Recorded data from the earlier purchase. It is not re-verified in this browser; check the purchase in checkout to verify it again."
            : "Choose a tier and inspect the exact transaction before wallet approval. Purchase signing is enabled only for the reviewed owner wallet, on devnet, for a limited demo window.",
      },
      {
        id: "account",
        title: "Owned devnet account",
        state: owned
          ? "Observed for this wallet"
          : scope.checked
            ? "Public account observation"
            : "Account verification unavailable",
        description: owned
          ? "Trader and derived address were checked by the accepted decoder at the shown slots. This is not proof of the purchase payment."
          : "A public account or rehearsal identity never becomes the signed-in wallet’s account.",
      },
      {
        id: "execution",
        title: "On-chain trade execution",
        state: "Devnet connection awaiting activation",
        description:
          "Signed intent, backend acceptance, journal publication and confirmed chain execution remain separate steps.",
      },
      {
        id: "queue",
        title: "Pass and claim queue",
        state:
          owned && scope.passPending && scope.passPending !== "0"
            ? "Pass flag observed · claim not attested"
            : "No claim queue attested for this account",
        description:
          "Elapsed delay alone is not finalization, queue admission or payment. A fresh account may require its actual configured pass delay.",
      },
      {
        id: "settlement",
        title: "Settled token receipt",
        state: "No verified settlement bound to this account",
        description:
          "A finalized successful receipt and exact token destination/mint/balance evidence are required. Public rehearsal history is shown separately.",
      },
    ],
  };
}
