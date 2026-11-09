export const PROFILE = Object.freeze({
  name: "setl8-localhost3000-v1",
  origin: "http://localhost:3000",
  api: "http://localhost:8792",
  bind: "127.0.0.1",
  port: 3000,
});
export type BackendReport = {
  profile: string;
  ready: boolean;
  database_ready: boolean;
  api_ready: boolean;
  api_url: string;
  frontend_origin: string;
  ownership?: { requested_owner: string; gateway: string; postgres: string };
};
export function assertDevelopmentEnvironment(
  env: Record<string, string | undefined>,
) {
  if (env.VITE_API_URL && env.VITE_API_URL !== PROFILE.api)
    throw Error(
      `Conflicting VITE_API_URL. The real localhost:3000 profile requires ${PROFILE.api}; remove the override or use the explicit historical launcher.`,
    );
  if (env.VITE_PROTOTYPE_OPT_IN || env.VITE_DEMO_BUILD)
    throw Error(
      "Synthetic/demo build flags are not allowed in the real localhost:3000 profile. Use the separate historical prototype launcher.",
    );
}
export function assertBackendReady(r: BackendReport, owner: string) {
  if (
    r.profile !== PROFILE.name ||
    r.api_url !== PROFILE.api ||
    r.frontend_origin !== PROFILE.origin ||
    !r.ready ||
    !r.database_ready ||
    !r.api_ready ||
    r.ownership?.requested_owner !== owner ||
    !["owned", "borrowed"].includes(r.ownership.gateway) ||
    !["owned", "borrowed"].includes(r.ownership.postgres)
  )
    throw Error(
      "The isolated backend did not confirm this exact profile, database/API readiness and resource ownership. Frontend not started.",
    );
}
export interface DevelopmentDependencies {
  owner: string;
  signal: AbortSignal;
  preflight(): Promise<void>;
  claim(): Promise<() => Promise<void>>;
  backendStart(owner: string): Promise<BackendReport>;
  backendStop(owner: string): Promise<unknown>;
  webStart(): Promise<{ close(): Promise<void> }>;
}
/** All resource cleanup is scoped to one invocation, including partial startup. */
export async function startDevelopment(d: DevelopmentDependencies) {
  await d.preflight();
  if (d.signal.aborted) throw Error("Startup cancelled.");
  const release = await d.claim();
  let backendAttempted = false,
    web: Awaited<ReturnType<typeof d.webStart>> | undefined;
  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      const failures: unknown[] = [];
      try {
        await web?.close();
      } catch (e) {
        failures.push(e);
      }
      if (backendAttempted) {
        try {
          await d.backendStop(d.owner);
        } catch (e) {
          failures.push(e);
        }
      }
      // Retain the public ownership record if cleanup needs inspection.
      if (failures.length)
        throw new AggregateError(
          failures,
          "Owned cleanup did not complete. Ownership record retained; no unknown process was killed.",
        );
      await release();
    })());
  try {
    if (d.signal.aborted)
      throw Error("Startup cancelled before backend start.");
    backendAttempted = true;
    const backend = await d.backendStart(d.owner);
    assertBackendReady(backend, d.owner);
    if (d.signal.aborted)
      throw Error("Startup cancelled after backend readiness.");
    web = await d.webStart();
    if (d.signal.aborted)
      throw Error("Startup cancelled before frontend readiness.");
    return { backend, stop };
  } catch (error) {
    try {
      await stop();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Startup failed and owned cleanup needs inspection.",
      );
    }
    throw error;
  }
}
