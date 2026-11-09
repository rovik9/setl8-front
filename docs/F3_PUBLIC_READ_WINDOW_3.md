# Public A1 read — manual window 3, 1 November 2026

**The unchanged production account reader completed the paired public account/config observation on normal port 5173.** This was one separately authorized corrected capture, with six actual JSON-RPC reads, no polling and no retry. It does not establish authenticated wallet ownership, purchase/payment completion, payout completion, executable-image admission or signing/sending readiness. Public sign/send remains OFF.

## Actual public result

The fresh controlled browser opened `http://127.0.0.1:5173/my-account?wallet=7urBRSkXz6jAoz7j4QnVjgWWVLUxV6nzjZxNEWhxkLeF` using the exact production AccountReader. The six reads ran from 2026-11-01 17:28:43.131 to 17:28:51.192 UTC (22:58 IST), with minimum forward spacing 1001.390 ms. Request forwarding changed timing only; successful response bytes were not replaced or mocked.

| Reads | Methods                                       | api.devnet.solana.com              | solana-devnet.api.onfinality.io/public |
| ----- | --------------------------------------------- | ---------------------------------- | -------------------------------------- |
| 1–2   | getGenesisHash                                | HTTP 200, expected devnet genesis  | HTTP 200, same genesis                 |
| 3–4   | getMultipleAccounts: wallet profile           | HTTP 200, finalized slot 517569740 | HTTP 200, finalized slot 517569747     |
| 5–6   | getMultipleAccounts: account, ruleset, config | HTTP 200, finalized slot 517569749 | HTTP 200, finalized slot 517569753     |

Both profile projections and both account/ruleset/config projections matched. Pinned SDK decoding checked the public profile/account owner, trader, layout and derived addresses. Public profile next_challenge_id is exactly `1`. The account `A3ncHBKQRrRNKVaeH9WuhMmwZ22BNoKyeCFsxK6ZwpvU` is challenge `0`, size `2500000000` micro account units, recorded closed balance B `2745082106`, phase enum `2`, status enum `0`. The dashboard rendered size **2,500.00**, **Phase 2 · Active**, and B **2,745.082106**. The current ruleset decoded as version `1`, fee `40` basis points; config currentRuleset decoded as `1`.

The actual screen also displayed journal sequence 43, closed trades 2, pass state Confirmed, and “Delay elapsed; finalization not observed.” Current equity/P&L remained Unavailable. History coverage remained Partial; separate public reads/pages are explicitly not an atomic snapshot. The optional independent A1 checker below the dashboard was not invoked and correctly remained “Not checked.” Its unchanged recorded rehearsal still marks finalize_pass, settlement and balance evidence Pending. This capture does not turn any of those pending records into completion evidence.

There were no blocked requests, RPC errors, 403/429/Retry-After observations, network failures, browser page errors or visible alerts. The console contains one HTTP 401 resource warning whose response URL was not captured. It did not occur in the six fixed RPC responses, all of which were HTTP 200; the public dashboard rendered successfully without login. No provider substitution or optional A1 request occurred.

## Guard verification and evidence

Before any forwarding, `offline-guard-check.mjs` extracted the reviewed dependency guard directly from the exact window-3 capture source. Using only the saved window-2 profile responses, it confirmed that missing capture dependencies reject and that a delayed capture task is settled before the valid account request is allowed. The offline check made zero RPC reads. The prior reviewed corrected script was copied only into a new distinct window-3 root, with accurate authorization and screenshot names. Both original window-2 scripts and results are preserved unchanged.

The window used an exclusive `one-attempt.marker`; there was no rerun. `results.json` contains exact methods, parameters, statuses, request/response hashes, observed slots, decoded public fields and process identities. Six raw public responses are retained. One actual screenshot, `ACTUAL-PUBLIC-READ-WINDOW3-DESKTOP.png`, was visually inspected: it shows the normal dashboard, actual-read provenance banner, public-only/no-readiness disclosure, account details, unknown valuation and pending rehearsal evidence.

## Preservation and limits

Production account/checkout/RPC/gate/compiler/proof/package source hashes are unchanged. Normal5173 PID25827 and all recorded readonly/prototype/P30 process identities are unchanged. Window-1 and window-2 manifest entries were rechecked with zero mismatches. The only historical correction-manifest difference remains the separately authorized owner-document sequence correction already recorded in window 2; no additional change was made to that document.

No code campaign or full build was run for this capture-only task. The focused offline dependency check and capture-script syntax check passed; the actual browser observation completed. There was no wallet connection or prompt, signing, simulation, preflight, transaction, funding, new synthetic fixture, service restart, backend/SDK/vendor/contracts/pin edit, commit, push or deployment. No phone capture was part of this finite window; prior phone evidence remains historical.

This establishes one bounded paired public observation at the recorded finalized slots, not continuous endpoint availability or complete history. No further acquisition is scheduled. The stable normal dashboard URL is `http://127.0.0.1:5173/my-account`.
