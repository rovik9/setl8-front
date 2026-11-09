export const DEV_ORIGIN = "http://localhost:3000";
export const DEV_API_URL = "http://localhost:8792";
export const LEGACY_ORIGIN = "http://127.0.0.1:5173";
export const LEGACY_API_URL = "http://127.0.0.1:8788";

/** Historical 5173 and the explicitly opted-in prototype keep their own profile. */
export function apiForOrigin(configured: string | undefined, origin: string) {
  if (configured) return configured;
  return origin === LEGACY_ORIGIN ? LEGACY_API_URL : DEV_API_URL;
}
