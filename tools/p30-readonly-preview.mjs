/** Owns ONLY the dedicated frontend5174. Backend8791 and normal5173 are never signalled. */
import { spawn, execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url))),
  statePath = resolve(root, ".local/p30-readonly-preview.json"),
  logPath = resolve(root, "artifacts/p30-readonly-live/frontend5174.log");
const identify = (pid) => {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "lstart=,command="], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
};
const listeners = () => {
  try {
    return execFileSync("lsof", ["-nP", "-t", "-iTCP:5174", "-sTCP:LISTEN"], {
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/);
  } catch {
    return [];
  }
};
const readState = async () => {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return null;
  }
};
const save = async (s) => {
  await mkdir(resolve(root, ".local"), { recursive: true });
  await writeFile(statePath, JSON.stringify(s, null, 2) + "\n");
};
export async function previewStatus() {
  const record = await readState(),
    owners = listeners();
  return {
    record,
    listenerPids: owners,
    owned:
      !!record &&
      record.kind === "p30-readonly-frontend-v1" &&
      identify(record.pid) === record.identity &&
      owners.length === 1 &&
      owners[0] === String(record.pid),
  };
}
export async function startReadOnlyPreview() {
  const current = await previewStatus();
  if (current.owned) return current;
  if (current.listenerPids.length)
    throw Error(
      "Port5174 is occupied by another process. No takeover attempted.",
    );
  if (current.record && identify(current.record.pid))
    throw Error(
      "Existing recorded process identity needs review; no restart attempted.",
    );
  await mkdir(resolve(root, "artifacts/p30-readonly-live"), {
    recursive: true,
  });
  const log = await open(logPath, "a"),
    child = spawn(
      process.execPath,
      [
        resolve(root, "node_modules/vite/bin/vite.js"),
        "--config",
        resolve(root, "vite.p30-readonly.config.ts"),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          VITE_API_URL: "http://127.0.0.1:8791",
          VITE_PROTOTYPE_OPT_IN: "",
        },
        detached: true,
        stdio: ["ignore", log.fd, log.fd],
      },
    );
  await log.close();
  child.unref();
  const record = {
    kind: "p30-readonly-frontend-v1",
    pid: child.pid,
    identity: identify(child.pid),
    origin: "http://127.0.0.1:5174",
    entry: "/p30-live.html",
    config: resolve(root, "vite.p30-readonly.config.ts"),
    startedAt: new Date().toISOString(),
    log: logPath,
    status: "starting",
  };
  await save(record);
  for (let i = 0; i < 50; i++) {
    if (!identify(child.pid))
      throw Error(
        "Owned frontend exited; retained process/log record for inspection",
      );
    if (listeners().includes(String(child.pid))) {
      record.identity = identify(child.pid);
      record.status = "running";
      await save(record);
      return previewStatus();
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(
    "Owned frontend startup not confirmed; record retained, no backend action",
  );
}
export async function stopReadOnlyPreview() {
  const s = await previewStatus();
  if (!s.record) return s;
  if (!s.owned)
    throw Error(
      "Recorded frontend/listener identity does not match; nothing stopped",
    );
  process.kill(s.record.pid, "SIGTERM");
  for (let i = 0; i < 40 && identify(s.record.pid); i++)
    await new Promise((r) => setTimeout(r, 100));
  if (identify(s.record.pid))
    throw Error("Owned frontend did not stop; process record retained");
  await save({
    ...s.record,
    status: "stopped",
    stoppedAt: new Date().toISOString(),
  });
  return previewStatus();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2] || "status";
  if (!["start", "status", "stop"].includes(action))
    throw Error("Use start, status or stop");
  console.log(
    JSON.stringify(
      await {
        start: startReadOnlyPreview,
        status: previewStatus,
        stop: stopReadOnlyPreview,
      }[action](),
      null,
      2,
    ),
  );
}
