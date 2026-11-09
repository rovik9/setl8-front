/** Owns only frontend + isolated Chromium + in-memory fixture wallet. No operator HTTP server. */
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readFile,
  writeFile,
  mkdir,
  unlink,
  open,
  statfs,
} from "node:fs/promises";
import { createConnection } from "node:net";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import {
  createSyntheticSession,
  FRONT,
  GATEWAY,
  ORIGIN,
} from "./prototype-core.mjs";
const exec = promisify(execFile),
  STATE = FRONT + ".local/prototype-session.json";
async function occupied() {
  return new Promise((resolve) => {
    const s = createConnection({ host: "127.0.0.1", port: 5173 });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}
export async function launchPrototype({
  headless = false,
  logRoot = process.env.SETL8_PROTOTYPE_EVIDENCE_DIR
    ? FRONT +
      process.env.SETL8_PROTOTYPE_EVIDENCE_DIR +
      "/interactive-" +
      Date.now()
    : FRONT + "artifacts/milestone-4/interactive-" + Date.now(),
  entry = "/app/terminal",
} = {}) {
  const storage = await statfs(FRONT);
  const available = Number(storage.bavail) * Number(storage.bsize);
  if (available < 256 * 1024 * 1024)
    throw new Error(
      `Insufficient storage before prototype browser run: ${available} bytes available at ${FRONT}; require 256 MiB. No init/build/restart attempted.`,
    );
  // demo-up.sh may pass the pid of the Vite it started with the prototype environment; that one is reused,
  // never stopped here. Without it the original behavior is unchanged (refuse an occupied 5173, spawn our own).
  const adoptPid = process.env.DEMO_ADOPT_FRONT_PID;
  if (!adoptPid && (await occupied()))
    throw new Error(
      "Port 5173 is occupied. Refusing to take over or stop its owner. Stop the current frontend explicitly, then retry.",
    );
  await mkdir(FRONT + ".local", { recursive: true });
  await mkdir(logRoot, { recursive: true });
  const lock = await open(STATE, "wx").catch(() => {
    throw new Error(
      "An existing frontend prototype ownership record needs inspection; use npm run prototype:stop for its live owner.",
    );
  });
  await lock.close();
  let vite,
    browser,
    page,
    session,
    closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    if (page && session)
      await page
        .evaluate(
          async ({ base, wallet }) => {
            const r = await fetch(base + "/v1/auth/session", {
              credentials: "include",
            });
            if (r.ok) {
              const s = await r.json();
              if (s.wallet === wallet)
                await fetch(base + "/v1/auth/logout", {
                  method: "POST",
                  credentials: "include",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Setl8-Csrf": s.csrf_token,
                  },
                  body: "{}",
                });
            }
          },
          { base: GATEWAY, wallet: session.info.wallet },
        )
        .catch(() => {});
    session?.close();
    await browser?.close().catch(() => {});
    if (!adoptPid && vite && vite.exitCode === null) {
      vite.kill("SIGTERM");
      await new Promise((r) => {
        vite.once("exit", r);
        setTimeout(r, 4000).unref();
      });
    }
    if (!adoptPid && vite && vite.exitCode === null)
      throw new Error(
        "Owned frontend did not stop; ownership record retained for inspection.",
      );
    await unlink(STATE).catch(() => {});
  };
  try {
    session = await createSyntheticSession(logRoot);
    const log = await open(logRoot + "/frontend.log", "a");
    vite = adoptPid
      ? { pid: Number(adoptPid), exitCode: null }
      : spawn(
          process.execPath,
          [
            FRONT + "node_modules/vite/bin/vite.js",
            "--host",
            "127.0.0.1",
            "--port",
            "5173",
            "--strictPort",
          ],
          {
            cwd: FRONT,
            env: {
              ...process.env,
              VITE_API_URL: GATEWAY,
              VITE_PROTOTYPE_OPT_IN: "local-synthetic-v1",
            },
            stdio: ["ignore", log.fd, log.fd],
          },
        );
    await log.close();
    for (let i = 0; i < 50; i++) {
      if (vite.exitCode !== null)
        throw new Error(
          "Owned frontend failed to start; inspect frontend.log.",
        );
      try {
        if ((await fetch(ORIGIN, { signal: AbortSignal.timeout(300) })).ok)
          break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const listener = (
      await exec("lsof", ["-nP", "-t", "-iTCP:5173", "-sTCP:LISTEN"])
    ).stdout
      .trim()
      .split(/\s+/);
    if (
      vite.exitCode !== null ||
      listener.length !== 1 ||
      listener[0] !== String(vite.pid)
    )
      throw new Error(
        "Frontend listener is not the owned Vite process; refusing to attach the disposable controller.",
      );
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    page = await context.newPage();
    const assertPage = (source) => {
      if (
        source.page !== page ||
        source.frame !== page.mainFrame() ||
        new URL(source.frame.url()).origin !== ORIGIN
      )
        throw new Error(
          "Prototype binding is restricted to its launched local page.",
        );
    };
    await page.exposeBinding("__prototypeInfo", (source) => {
      assertPage(source);
      return session.info;
    });
    await page.exposeBinding("__prototypeLogin", (source, bytes) => {
      assertPage(source);
      return session.signLogin(bytes);
    });
    await page.exposeBinding("__prototypeOrder", (source, draft) => {
      assertPage(source);
      return session.signOrder(draft);
    });
    await page.exposeBinding("__prototypeOperate", (source, action) => {
      assertPage(source);
      return session.operate(action);
    });
    await page.addInitScript((info) => {
      window.__SETL8_PROTOTYPE__ = {
        info,
        readInfo: () => window.__prototypeInfo(),
        signLogin: (bytes) => window.__prototypeLogin(bytes),
        signOrder: (draft) => window.__prototypeOrder(draft),
        operate: (action) => window.__prototypeOperate(action),
      };
    }, session.info);
    page.on("response", async (response) => {
      if (
        response.url() === GATEWAY + "/v1/auth/challenge" &&
        response.status() === 200
      )
        session.observeChallenge(await response.json().catch(() => ({})));
    });
    await page.goto(ORIGIN + entry);
    const identity = (
      await exec("ps", ["-p", String(process.pid), "-o", "lstart=,command="])
    ).stdout.trim();
    const state = {
      pid: process.pid,
      identity,
      vitePid: vite.pid,
      info: session.info,
      logRoot,
      headless,
      frontend: ORIGIN,
      gateway: GATEWAY,
      stop: "npm run prototype:stop",
      private_key_persisted: false,
    };
    await writeFile(STATE, JSON.stringify(state, null, 2));
    await writeFile(
      logRoot + "/ownership.json",
      JSON.stringify(state, null, 2),
    );
    return { page, context, browser, session, logRoot, close };
  } catch (error) {
    await close();
    throw error;
  }
}
async function stop() {
  const state = JSON.parse(await readFile(STATE));
  let current;
  try {
    current = (
      await exec("ps", ["-p", String(state.pid), "-o", "lstart=,command="])
    ).stdout.trim();
  } catch {
    throw new Error(
      "Recorded controller is absent. Inspect stale record and any occupied frontend before removing it; no process was signaled.",
    );
  }
  if (current !== state.identity || !current.includes("prototype-session.mjs"))
    throw new Error(
      "Controller process identity mismatch; refusing to signal it.",
    );
  process.kill(state.pid, "SIGTERM");
  console.log(
    "Sent shutdown only to the verified frontend/controller/browser owner; backend services remain running.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const command = process.argv[2] ?? "start";
  if (command === "stop") await stop();
  else if (command === "status") console.log(await readFile(STATE, "utf8"));
  else if (command === "start") {
    const running = await launchPrototype({ entry: "/app/terminal" });
    let exiting = false;
    const finish = async () => {
      if (exiting) return;
      exiting = true;
      await running.close();
      process.exit(0);
    };
    process.on("SIGINT", finish);
    process.on("SIGTERM", finish);
    running.browser.on("disconnected", finish);
    console.log(
      JSON.stringify(
        {
          simulation: true,
          frontend: ORIGIN,
          gateway: GATEWAY,
          account: running.session.info.account,
          wallet: running.session.info.wallet,
          clock: running.session.info.clock,
          logs: running.logRoot,
          stop: "npm run prototype:stop",
          instructions:
            "Choose Disposable synthetic wallet, review/sign login. Select BTC and Order. Stage open, use synthetic clock, enter nonce 1 and quantity 1, confirm account, prepare/inspect/sign/submit. Retry identical, then Evaluate. Stage close, choose Close, nonce 2/use synthetic clock, prepare/inspect/sign/submit/Evaluate. Check status/account/journals. No real funds or chain transaction.",
        },
        null,
        2,
      ),
    );
    setInterval(() => {}, 60000);
  } else throw new Error("Use start, status or stop.");
}
