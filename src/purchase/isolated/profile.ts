/** Source-contract candidate only. No reviewed running-service activation is represented by this profile. */
export const P30_PROFILE = Object.freeze({
  api: "http://127.0.0.1:8791",
  browserOrigin: "http://127.0.0.1:5174",
  audience: "http://127.0.0.1:8791",
  deployment: "p30-devnet-rehearsal-v1" as const,
  contract: "mocked-current-source-awaiting-running-profile-review" as const,
  cookies: Object.freeze({
    login: "setl8_p30_login",
    session: "setl8_p30_session",
  }),
  actions: Object.freeze({
    quote: false,
    unsignedPreparation: false,
    durableAttempt: false,
    wallet: false,
    sign: false,
    send: false,
    signatureReport: false,
  }),
});
/** Read-only source references: gateway lib.rs/auth.rs/purchase/mod.rs, NOT a live capability claim. */
export const P30_SOURCE_ROUTES = Object.freeze({
  session: "/v1/auth/session",
  logout: "/v1/auth/logout",
  catalog: "/v1/purchase-catalog",
  purchases: "/v1/purchases",
  owned: "/v1/owned-accounts",
  preWalletAttempt: "/v1/purchase-attempts",
});
