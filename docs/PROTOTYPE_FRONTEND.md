# Local synthetic browser session

From `/Users/rovik/Documents/setl8-front`:

```sh
npm run prototype
npm run prototype:status
npm run prototype:stop
```

`prototype` starts the frontend, an in-memory disposable wallet/controller and a headed Chromium window. It requires the already reviewed backend prototype gateway **127.0.0.1:8790** and PostgreSQL **127.0.0.1:55450** to be running. It verifies the existing executable/configuration and never runs backend setup/build/start/restart. It refuses occupied frontend port **5173**, a stale ownership record or less than 256 MiB free storage. Do not launch a second frontend over an existing one.

Use the Chromium window opened by the launcher. Other tabs intentionally do not inherit the disposable controller or signing key. Opening the URL alone does not enable synthetic signing. The simulation banner identifies the profile and disabled deployed/live capabilities. Real wallet choices are excluded in this opt-in profile.

1. Click Connect wallet, select **Disposable synthetic wallet**, inspect the login challenge and sign in. This is a newly generated public trader identity. No real key is loaded or saved.
2. Choose BTC / market 0 and the Order tab. Click **Stage manufactured open sample**. This uses the guarded local CLI to provide a labeled synthetic price at clock **1791813600**; it is not a live quote or provider request. The recording directory refreshes so its explicitly selectable synthetic stream can be charted separately.
3. Choose Market / Buy, enter quantity **1**, confirm the selected account, enter explicit development nonce **1**, and click **Use synthetic clock**. Keep SL/TP off for executable prototype orders. Prepare the development preview.
4. Inspect the exact SDK fields, 48-byte order and 93-byte signing message. Check the inspection confirmation, then **Sign inspected synthetic bytes**. The local controller independently decodes/rebuilds the exact message before signing with its disposable key.
5. Click **Submit synthetic intent**. A durable received receipt is not execution. **Retry identical signed intent** reuses the same bytes/signature; it does not allocate a nonce or resign. **Check explicit nonce status** is an evidence read. A status read alone cannot bind an uncertain payload; an identical POST retry confirms that exact payload.
6. Click **Evaluate received synthetic intent**. The local controller invokes the reviewed tick/drain/work CLI. Inspect the account's stored position and journal evidence; check intent status. There is no operator HTTP route or automatic price pump.
7. Click **Stage manufactured close sample**, choose **Close**, enter nonce **2** and use the synthetic clock. Close encodes qty=0 for the whole position, side=0, price/SL/TP/target nonce=0. Inspect/sign/submit/evaluate as above. Positions become empty and canonical journals record the supported Close effect. Complete outcomes, chain finality and deployed compatibility remain unavailable.
8. Log out when finished. `npm run prototype:stop` stops only the identified frontend/controller/browser owner and attempts logout of its own disposable session. It leaves both backend profiles and their databases running. Browser closure also disposes the in-memory key; explicit logout before closing gives a visible server revocation confirmation.

Nonces 1/2 above are explicit choices for this newly initialized exclusive disposable account. There is no nonce allocator. Additional cycles require deliberate developer values and must remain within the backend prototype's bounded CLI history/receipt/account resources. A refused bound or interrupted operator sequence requires inspection, not reset, truncation, guessed nonces or a runtime workaround. Interrupted intent submission may already have committed. If a field/scope change clears its signed material, the warning directs you to its explicit nonce/operator evidence; it does not recreate the old signature.

Limit/Stop/SL/TP draft previews remain available; their missing complete outcome semantics are not simulated. Prototype signing is restricted to supported Buy Market and whole-position Close with zero protective fields, market 0, this account/wallet/session and the staged synthetic clock. No purchase, reset, payout, scaling or lifecycle actions are supplied.

To return to normal frontend mode:

```sh
npm run prototype:stop
npm run dev
```

Normal development uses gateway **8788** and keeps order execution gated. Only exact URL `http://127.0.0.1:8790`, explicit `VITE_PROTOTYPE_OPT_IN=local-synthetic-v1`, exact frontend Origin 5173 and the launcher-owned bridge can expose synthetic submission. A backend/page readiness claim cannot override the gate. Prototype cookies have distinct names and do not clear the source cookies.

The public ownership record is `.local/prototype-session.json`. A stop command verifies controller PID/start-command identity before signaling it. If ownership is stale or a process fails to stop, inspect the record and listeners; the launcher will not kill an unrelated owner. Full public fixture/operator/frontend logs are under the session directory printed at startup in `artifacts/milestone-4/`. Private keys, login tokens, CSRF values and client retry signatures are not logged. The backend intentionally persists its ordinary canonical signed synthetic inputs; that is separate from frontend signature retention.

Reload/navigation synchronizes current public controller clock/phase through a read-only local binding with a three-second bound. It does not stage, sign, allocate nonces or restore old drafts/signatures. Synthetic controls stay disabled until success. On timeout or metadata mismatch, use “Resync controller info” or restart the owned session explicitly. After a reload, inspect account/status evidence and enter development values again; do not infer a next nonce from an empty form.
