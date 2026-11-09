/** Real dev app. Backend processes are controlled exclusively by its owned helper. */
import { setDefaultResultOrder } from "node:dns";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { createServer as netServer, createConnection } from "node:net";
import { open, readFile, unlink, mkdir, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, loadEnv } from "vite";
import {
  PROFILE,
  assertDevelopmentEnvironment,
  startDevelopment,
} from "./development-core.ts";
setDefaultResultOrder("ipv4first");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const back = resolve(root, "../setl8-back"),
  helper = resolve(back, "tools/dev3000.py");
const record = resolve(root, ".local/dev3000-frontend.json");
const mode = process.argv[2] || "start";
const command = promisify(execFile);
const owner = "frontend-" + randomUUID();
const abort = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => abort.abort());
const log = (message) => console.log("[Setl8] " + message);
const paused = () =>
  new Promise((r) =>
    abort.signal.aborted
      ? r()
      : abort.signal.addEventListener("abort", r, { once: true }),
  );
function errorText(e) {
  return e instanceof AggregateError
    ? e.message + " " + e.errors.map(errorText).join(" ")
    : e instanceof Error
      ? e.message
      : String(e);
}
async function backend(action) {
  const args = [
    helper,
    action,
    ...(action === "status" ? [] : ["--owner", owner]),
  ];
  const pulse = setInterval(
    () =>
      log(
        `Waiting for isolated backend ${action} (no legacy services are changed)…`,
      ),
    20000,
  );
  try {
    const { stdout } = await command("python3", args, {
      cwd: back,
      // Keep terminal Ctrl+C on this launcher; settle helper startup before
      // invoking its owner-scoped cleanup, including partially started DBs.
      detached: true,
      timeout: 300000,
      maxBuffer: 1024 * 1024,
    });
    try {
      return JSON.parse(stdout);
    } catch {
      throw Error(
        "Backend helper returned invalid JSON; inspect its own logs.",
      );
    }
  } catch (e) {
    let detail = "";
    try {
      const j = JSON.parse(e.stderr || "{}");
      detail =
        typeof j.error === "string"
          ? j.error
          : typeof j.message === "string"
            ? j.message
            : "";
    } catch {}
    throw Error(
      `Isolated backend ${action} failed${detail ? ": " + detail : ". Check Python, Rust/Postgres dependencies, the backend-owned helper/config and its logs."}`,
    );
  } finally {
    clearInterval(pulse);
  }
}
async function occupied(host, port) {
  return new Promise((resolve, reject) => {
    const s = createConnection({ host, port });
    s.setTimeout(400);
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", (e) => {
      s.destroy();
      if (["ECONNREFUSED", "EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(e.code))
        resolve(false);
      else reject(e);
    });
    s.once("timeout", () => {
      s.destroy();
      reject(
        Error(
          `Cannot verify loopback port ${port}; no process will be taken over.`,
        ),
      );
    });
  });
}
async function portFree(port) {
  for (const host of ["127.0.0.1", "::1"])
    if (await occupied(host, port))
      throw Error(
        `Port ${port} is occupied on loopback. Refusing to kill or replace its owner. Use npm run dev:status or stop that process explicitly.`,
      );
  await new Promise((resolve, reject) => {
    const s = netServer();
    s.once("error", reject);
    s.listen({ host: "127.0.0.1", port, exclusive: true }, () =>
      s.close(resolve),
    );
  });
}
async function claim(mode) {
  await mkdir(resolve(root, ".local"), { recursive: true });
  let file;
  try {
    file = await open(record, "wx");
  } catch (e) {
    if (e.code === "EEXIST")
      throw Error(
        "An existing .local/dev3000-frontend.json ownership record needs inspection. Use npm run dev:status; stale or unknown owners are never killed automatically.",
      );
    throw e;
  }
  await file.writeFile(
    JSON.stringify(
      {
        profile: PROFILE.name,
        owner,
        pid: process.pid,
        mode,
        origin: PROFILE.origin,
        api: PROFILE.api,
        started_at: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  await file.close();
  return async () => {
    const current = JSON.parse(await readFile(record, "utf8"));
    if (current.owner !== owner)
      throw Error("Frontend ownership record changed; refusing to remove it.");
    await unlink(record);
  };
}
async function web(port, api, profile) {
  // Override only this process. There is no request proxy or Origin/Host rewrite.
  process.env.VITE_API_URL = api;
  const origin = port === 3000 ? PROFILE.origin : "http://127.0.0.1:5173";
  const server = await createServer({
    root,
    configFile: resolve(root, "vite.config.ts"),
    clearScreen: false,
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      allowedHosts: ["localhost", "127.0.0.1"],
    },
    plugins: [
      {
        name: "setl8-development-identity",
        configureServer(s) {
          s.middlewares.use("/__setl8/development", (req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify({ profile, owner, origin, api, mode }));
          });
        },
      },
    ],
  });
  try {
    await server.listen();
    const response = await fetch(origin + "/__setl8/development", {
      signal: AbortSignal.timeout(3000),
    });
    const identity = await response.json();
    if (
      !response.ok ||
      identity.owner !== owner ||
      identity.origin !== origin ||
      identity.api !== api
    )
      throw Error(
        "The actual browser URL did not reach this invocation. No unknown listener will be taken over.",
      );
    return server;
  } catch (e) {
    await server.close();
    throw e;
  }
}
async function preflight() {
  assertDevelopmentEnvironment({
    ...loadEnv("development", root, "VITE_"),
    ...process.env,
  });
  await portFree(PROFILE.port);
  try {
    await access(helper);
  } catch {
    throw Error(
      `Backend-owned helper is missing at ${helper}. Complete the isolated dev3000 backend setup; no legacy backend will be substituted.`,
    );
  }
  let handoff;
  try {
    handoff = JSON.parse(
      await readFile(resolve(back, "docs/DEV3000_HANDOFF.json"), "utf8"),
    );
  } catch {
    throw Error(
      "Missing or unreadable backend docs/DEV3000_HANDOFF.json. No legacy backend will be substituted.",
    );
  }
  if (
    handoff.profile !== PROFILE.name ||
    handoff.frontend_origin !== PROFILE.origin ||
    handoff.api_url !== PROFILE.api ||
    handoff.helper !== helper
  )
    throw Error(
      "Backend handoff differs from the reviewed localhost:3000 profile. Startup refused.",
    );
}
async function status() {
  let local = null;
  try {
    local = JSON.parse(await readFile(record, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT")
      throw Error(
        "Frontend ownership record cannot be read. No cleanup attempted.",
      );
  }
  let identity = null;
  try {
    const r = await fetch(PROFILE.origin + "/__setl8/development", {
      signal: AbortSignal.timeout(1500),
    });
    if (r.ok) identity = await r.json();
  } catch {}
  const report = await backend("status");
  console.log(
    JSON.stringify(
      {
        profile: PROFILE.name,
        origin: PROFILE.origin,
        api: PROFILE.api,
        frontend: {
          ready: !!local && identity?.owner === local.owner,
          ownership: local,
          observed_identity: identity,
        },
        backend: report,
      },
      null,
      2,
    ),
  );
}
async function main() {
  if (!["start", "web", "legacy", "status"].includes(mode))
    throw Error("Usage: npm run dev | dev:web | dev:legacy | dev:status.");
  if (mode === "status") return status();
  if (mode === "legacy") {
    // The historical profile is the mocked-gateway e2e stack: it must never reach the private RPC from .env.local.
    process.env.VITE_DEVNET_RPC_URL = "";
    await portFree(5173);
    const server = await web(
      5173,
      "http://127.0.0.1:8788",
      "setl8-historical5173",
    );
    log(
      "Historical web-only profile at http://127.0.0.1:5173. Backend8788 is untouched.",
    );
    try {
      await paused();
    } finally {
      await server.close();
    }
    return;
  }
  if (mode === "web") {
    assertDevelopmentEnvironment({
      ...loadEnv("development", root, "VITE_"),
      ...process.env,
    });
    await portFree(PROFILE.port);
    const release = await claim(mode);
    let server;
    try {
      server = await web(PROFILE.port, PROFILE.api, PROFILE.name);
      log(
        `Web-only ${PROFILE.origin} → ${PROFILE.api}. Backend is not started or stopped by this mode.`,
      );
      await paused();
    } finally {
      await server?.close();
      await release();
    }
    return;
  }
  log(
    `Starting real app ${PROFILE.origin} → ${PROFILE.api}. No seeded account or purchase activation.`,
  );
  const session = await startDevelopment({
    owner,
    signal: abort.signal,
    preflight,
    claim: () => claim(mode),
    backendStart: async () => {
      log(
        "Starting/reusing isolated Rust gateway + Postgres via backend-owned helper…",
      );
      return backend("start");
    },
    backendStop: async () => {
      log("Releasing only backend resources owned by this invocation…");
      return backend("stop");
    },
    webStart: () => web(PROFILE.port, PROFILE.api, PROFILE.name),
  });
  log(`Ready: ${PROFILE.origin}`);
  log(
    `API ${PROFILE.api}; gateway ${session.backend.ownership.gateway}, Postgres ${session.backend.ownership.postgres}. Ctrl+C closes this frontend and only backend resources owned by this invocation.`,
  );
  try {
    await paused();
  } finally {
    await session.stop();
    log(
      "Stopped this invocation. Borrowed services and all database data are preserved.",
    );
  }
}
main().catch((e) => {
  console.error("[Setl8] " + errorText(e));
  process.exitCode = abort.signal.aborted ? 130 : 1;
});
