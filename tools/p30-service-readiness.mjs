/** Read-only process/build check. Never starts/stops backend or contacts its API. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
export async function verifyP30ServiceReadiness() {
  const root = "/Users/rovik/Documents/setl8-back",
    reviewPath =
      "/Users/rovik/Documents/ChatGPT/Setl8/coordination/reviews/backend-p30-running-readiness.json";
  const review = JSON.parse(await readFile(reviewPath, "utf8")),
    record = JSON.parse(
      await readFile(root + "/.local/p30-isolated/services.json", "utf8"),
    );
  if (
    review.decision !==
      "read_only_actual_browser_validation_authorized_not_full_backend_acceptance" ||
    record.profile !== "p30-isolated-v1" ||
    record.phase !== "running_disabled" ||
    record.gateway_pid !== review.gateway_pid ||
    record.postgres_pid !== review.postgres_pid ||
    record.gateway_sha256 !== review.gateway_sha256 ||
    record.preflight_sha256 !== review.preflight_sha256 ||
    record.gateway_address !== "127.0.0.1:8791" ||
    record.browser_origin !== "http://127.0.0.1:5174" ||
    record.quote_preparation !== "disabled" ||
    record.chain_submission !== "disabled" ||
    record.database_url !== "postgresql://127.0.0.1:55452/setl8_p30_isolated"
  )
    throw Error(
      "Readiness handoff/profile mismatch; no requests authorized by this runner",
    );
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  if (sha(await readFile(record.gateway_executable)) !== review.gateway_sha256)
    throw Error("Backend executable differs from reviewed build");
  const identity = (pid) =>
    execFileSync("ps", ["-p", String(pid), "-o", "lstart=,command="], {
      encoding: "utf8",
    }).trim();
  const gateway = identity(record.gateway_pid),
    postgres = identity(record.postgres_pid);
  if (
    !gateway.includes(record.gateway_executable) ||
    !postgres.includes(record.postgres_data)
  )
    throw Error("Backend process ownership differs");
  const listener = (port) =>
    execFileSync("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/);
  if (
    !listener(8791).includes(String(record.gateway_pid)) ||
    !listener(55452).includes(String(record.postgres_pid))
  )
    throw Error("Backend listener identity differs");
  return {
    checkedAt: new Date().toISOString(),
    review: reviewPath,
    reviewSha256: sha(await readFile(reviewPath)),
    recordSha256: sha(
      await readFile(root + "/.local/p30-isolated/services.json"),
    ),
    handoffSha256: sha(
      await readFile(root + "/docs/P30_RUNNING_ORIGIN_HANDOFF.md"),
    ),
    gatewayPid: record.gateway_pid,
    gatewayIdentity: gateway,
    gatewaySha256: review.gateway_sha256,
    postgresPid: record.postgres_pid,
    postgresIdentity: postgres,
    api: "http://127.0.0.1:8791",
    browserOrigin: "http://127.0.0.1:5174",
    quotePreparation: false,
    chainSubmission: false,
  };
}
