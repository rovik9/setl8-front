/** No preparation contract/routes are inferred from the read/auth contract. */
export interface CustomerPreparationPort {
  readonly state: "awaiting_reviewed_versioned_contract";
  readonly canQuote: false;
  readonly canPrepare: false;
  readonly canRecordAttempt: false;
}
export const preparationUnavailable: CustomerPreparationPort = Object.freeze({
  state: "awaiting_reviewed_versioned_contract",
  canQuote: false,
  canPrepare: false,
  canRecordAttempt: false,
});
