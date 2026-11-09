import browser from "../p30-artifact.json";
import installed from "../../../interfaces/p30-unsigned-sdk-pin.json";
import descriptorBytes from "../../../dependencies/p30/3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d/p30-descriptor.json?raw";
import type { DeploymentRef } from "../../api/purchase-foundation-v1";
/** One exact reviewed source release → installed browser artifact mapping; no interchangeable hash set. */
export const P30_RELEASE = Object.freeze({
  version: "0.1.0-dev.5",
  alias: "@setl8/p30-sdk",
  profile: "p30-devnet-2026-10-31-v1",
  source_archive_sha256:
    "b95cd2ccc6351c393e98db4acd069df7df23ee027e155d85b04c5559fec4e84f",
  npm_sha256:
    "3e33090cf9193fd909f57ed75e10f9e59b9409e3c8a8f6c186272d8ee185f86d",
  descriptor_sha256:
    "077ff530b2e8b48e676622dd1d5b1369e9c99d5c3ddcd8e5e7edd315783bd6b6",
});
const fail = (): never => {
  throw Error("The isolated SDK release mapping needs review.");
};
function checkBrowser(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, expected] of Object.entries(P30_RELEASE)) {
    const property = descriptors[key];
    if (!property || !("value" in property) || property.value !== expected)
      fail();
  }
}
/** Testable pure metadata comparison. Installed bytes are independently checked by verify:p30 at build/start. */
export function assertReleaseMapping(
  service: DeploymentRef,
  browserMetadata: unknown = browser,
  installedPin: unknown = installed,
) {
  checkBrowser(browserMetadata);
  checkBrowser(installedPin);
  // The API field means SOURCE archive, never the browser npm archive.
  if (
    service.sdk_release !== P30_RELEASE.version ||
    service.sdk_profile !== P30_RELEASE.profile ||
    service.sdk_artifact_sha256 !== P30_RELEASE.source_archive_sha256 ||
    service.compatibility !== "approved_for_purchase_reads"
  )
    fail();
}
export function assertPreparedRelease(
  service: DeploymentRef,
  preparedSdk: unknown,
) {
  assertReleaseMapping(service);
  checkBrowser(preparedSdk);
}
let descriptorCheck: Promise<void> | undefined;
export function verifyDescriptorBytes() {
  return (descriptorCheck ??= (async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(descriptorBytes),
    );
    const hex = Array.from(new Uint8Array(digest), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    if (hex !== P30_RELEASE.descriptor_sha256) fail();
  })());
}
