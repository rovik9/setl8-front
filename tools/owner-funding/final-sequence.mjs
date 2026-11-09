/** Exactly one explicit reviewed funding sequence; closes isolated release on every exit. */
import {
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
  existsSync,
  copyFileSync,
  mkdirSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { STAGE2_RELEASE, INTENT, FundingJournal } from "./core.mjs";
const root = "artifacts/owner-funding-final-2026-11-02",
  reference =
    "Origin explicit owner funding approval call_a4ffc9f5174d4864914321a7fc71fcd2; source review 2026-11-02",
  core = "tools/owner-funding/core.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const output = {
  started_at_utc: new Date().toISOString(),
  authorizationReference: reference,
  intent: INTENT,
  oneFreshPreparation: true,
  oneFundingAttempt: true,
  stage_max_RPC: 16,
  execute_max_RPC: 9,
  post_read_max_RPC: 10,
  automaticRetryRebuildResend: false,
};
function closeRelease() {
  let s = readFileSync(core, "utf8");
  const pattern =
    /export const STAGE2_RELEASE = Object\.freeze\(\{[\s\S]*?\}\);/;
  if (!pattern.test(s))
    throw Error("Cannot locate isolated release for closure.");
  s = s.replace(
    pattern,
    "export const STAGE2_RELEASE = Object.freeze({\n  enabled: false,\n  originReference: null,\n});",
  );
  const fd = openSync(core, "w");
  try {
    writeFileSync(fd, s);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  output.isolatedReleaseClosed = true;
}
async function run(path, name, arg) {
  const fd = openSync(root + "/" + name + ".log", "wx", 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "./tools/owner-funding/production-loader.mjs",
          path,
          ...(arg ? [arg] : []),
        ],
        { cwd: process.cwd(), stdio: ["ignore", fd, fd] },
      );
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0 ? resolve() : reject(Error(name + " exited" + code)),
      );
    });
  } finally {
    closeSync(fd);
  }
}
try {
  if (!(STAGE2_RELEASE.enabled && STAGE2_RELEASE.originReference === reference))
    throw Error("Exact Origin scoped release unavailable.");
  const proof = {
    at: new Date().toISOString(),
    markers: Object.fromEntries(
      ["sign-once.marker", "signature.json", "submit-once.marker"].map((n) => [
        n,
        existsSync("artifacts/owner-funding-execution/" + n),
      ]),
    ),
  };
  if (Object.values(proof.markers).some(Boolean))
    throw Error(
      "Existing signature/sign/submission marker; reconcile only, never refresh.",
    );
  writeFileSync(
    root + "/before-refresh-marker-proof.json",
    JSON.stringify(proof, null, 2) + "\n",
    { flag: "wx" },
  );
  const claim = openSync(
    "artifacts/owner-funding-execution/approved-final-attempt.marker",
    "wx",
    0o600,
  );
  try {
    writeFileSync(
      claim,
      JSON.stringify({ intentId: INTENT.id, reference }) + "\n",
    );
    fsyncSync(claim);
  } finally {
    closeSync(claim);
  }
  new FundingJournal()
    .initialize()
    .event("explicit_final_attempt_claimed", { reference });
  mkdirSync(root + "/released-source");
  for (const file of [
    "core.mjs",
    "run.mjs",
    "production-loader.mjs",
    "verify-final.mjs",
    "final-sequence.mjs",
  ])
    copyFileSync(
      "tools/owner-funding/" + file,
      root + "/released-source/" + file,
    );
  await run("tools/owner-funding/run.mjs", "fresh-stage", "stage");
  output.stage = JSON.parse(readFileSync(root + "/stage-results.json", "utf8"));
  if (
    output.stage.outcome !==
      "unsigned_funding_staged_for_authorized_immediate_execution" ||
    output.stage.stop_reason
  )
    throw Error(
      "Fresh staging blocked: " +
        (output.stage.stop_reason ?? output.stage.outcome),
    );
  // A full extra second between child processes maintains global pacing across both phases.
  await wait(1100);
  await run("tools/owner-funding/run.mjs", "single-execution", "execute");
  output.execution = JSON.parse(
    readFileSync(root + "/execute-results.json", "utf8"),
  );
} catch (error) {
  output.blocker = String(error.message);
} finally {
  try {
    closeRelease();
  } catch (error) {
    output.releaseClosureError = String(error.message);
  }
  output.funding_phase_completed_at_utc = new Date().toISOString();
}
try {
  const execution = output.execution;
  if (execution?.actualSubmissionAttempted) {
    const denial = execution.requests.some(
      (e) => e.http_status === 403 || e.http_status === 429 || e.retry_after,
    );
    if (denial)
      output.verificationSkippedReason =
        "Submission endpoint denial; stop without more reads.";
    else {
      await wait(1100);
      await run("tools/owner-funding/verify-final.mjs", "bounded-verification");
      output.verification = JSON.parse(
        readFileSync(root + "/verification-results.json", "utf8"),
      );
    }
  }
} catch (error) {
  output.verificationBlocker = String(error.message);
} finally {
  output.completed_at_utc = new Date().toISOString();
  writeFileSync(
    root + "/sequence-results.json",
    JSON.stringify(output, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      stage: output.stage?.outcome,
      execution: output.execution?.outcome,
      verification: output.verification?.outcome,
      signature:
        output.execution?.publicSignature ??
        output.execution?.execution?.signature,
      blocker:
        output.blocker ??
        output.verificationBlocker ??
        output.verification?.blocker,
      isolatedReleaseClosed: output.isolatedReleaseClosed,
    }),
  );
}
