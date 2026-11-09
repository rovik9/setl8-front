import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";
import bs58 from "bs58";
const exec = promisify(execFile);
export const FRONT = new URL("../", import.meta.url).pathname;
export const BACK = "/Users/rovik/Documents/setl8-back";
export const GATEWAY = "http://127.0.0.1:8790",
  ORIGIN = "http://127.0.0.1:5173";
const EXE_SHA =
  "53a3c64e017e41e593a19a487b4f91f6ee080e688730b47586fffface7836f8b";
export const sha = (data) => createHash("sha256").update(data).digest("hex");
export async function checkedBackend() {
  const config = JSON.parse(
    await readFile(BACK + "/.local/prototype/gateway.json"),
  );
  if (
    config.audience !== GATEWAY ||
    config.browser_origin !== ORIGIN ||
    config.admin_wallets.length
  )
    throw new Error(
      "Reviewed prototype configuration mismatch; no setup/restart will be attempted.",
    );
  if (
    sha(await readFile(BACK + "/.local/prototype/bin/setl8-gateway")) !==
    EXE_SHA
  )
    throw new Error(
      "Reviewed prototype executable hash mismatch; request Origin review.",
    );
  const health = await fetch(GATEWAY + "/healthz", {
    signal: AbortSignal.timeout(3000),
  });
  if (!health.ok)
    throw new Error("Reviewed prototype gateway must already be running.");
  return {
    executable_sha256: EXE_SHA,
    config_sha256: sha(await readFile(BACK + "/.local/prototype/gateway.json")),
    process: JSON.parse(
      await readFile(BACK + "/.local/prototype/gateway-process.json"),
    ),
  };
}
export async function createSyntheticSession(logRoot) {
  await mkdir(logRoot, { recursive: true });
  await import("./verify-order-sdk.mjs");
  const backend = await checkedBackend();
  // Tiny frontend-owned JS translation of the exact verified TS codec; no backend build/cache.
  const codecRoot = logRoot + "/codec";
  await mkdir(codecRoot, { recursive: true });
  for (const name of ["order", "generated"]) {
    const source = await readFile(
      FRONT + `packages/setl8-order-codec/src/${name}.ts`,
      "utf8",
    );
    const output = stripTypeScriptTypes(source, { mode: "transform" });
    await writeFile(
      codecRoot + `/${name}.mjs`,
      output.replace('"./generated.js"', '"./generated.mjs"'),
    );
  }
  const sdk = await import(pathToFileURL(codecRoot + "/order.mjs"));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawKey = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32);
  const wallet = bs58.encode(rawKey),
    walletHex = rawKey.toString("hex");
  let call = 0,
    closed = false,
    busy = false;
  const id = "synthetic-" + Date.now() + "-" + wallet.slice(0, 6);
  let info;
  const cli = async (command, args = []) => {
    if (
      closed ||
      !["init", "advance", "tick", "drain", "work", "recover"].includes(command)
    )
      throw new Error("Local prototype command refused.");
    const result = await exec(
      "python3",
      [BACK + "/tools/prototype.py", command, ...args],
      { cwd: BACK, timeout: 110000, maxBuffer: 1024 * 1024 },
    );
    await writeFile(
      `${logRoot}/operator-${++call}-${command}.log`,
      result.stdout + result.stderr,
    );
    return JSON.parse(result.stdout);
  };
  const fixture = await cli("init", ["--trader", wallet]);
  const account = fixture.account ?? fixture.fixture?.account;
  if (!/^[a-f0-9]{64}$/.test(account))
    throw new Error("Synthetic init did not supply the expected account.");
  info = {
    id,
    account,
    wallet,
    walletHex,
    clock: "1791813600",
    phase: "ready",
    gateway: GATEWAY,
    origin: ORIGIN,
  };
  await writeFile(
    logRoot + "/public-session.json",
    JSON.stringify(
      { info, fixture, backend, private_key_persisted: false },
      null,
      2,
    ),
  );
  let authMessage = null;
  return {
    get info() {
      return { ...info };
    },
    observeChallenge(body) {
      if (
        body.wallet === wallet &&
        body.audience === GATEWAY &&
        body.browser_origin === ORIGIN &&
        typeof body.message === "string"
      )
        authMessage = body.message;
    },
    signLogin(bytes) {
      if (
        closed ||
        !authMessage ||
        Buffer.from(bytes).toString("utf8") !== authMessage
      )
        throw new Error(
          "Only this disposable wallet's inspected prototype challenge may be signed.",
        );
      const signature = Array.from(sign(null, Buffer.from(bytes), privateKey));
      authMessage = null;
      return signature;
    },
    signOrder(draft) {
      if (
        closed ||
        busy ||
        draft.scope.mode !== "prototype" ||
        draft.scope.gateway !== GATEWAY ||
        draft.scope.syntheticSession !== id ||
        draft.scope.account !== account ||
        draft.scope.wallet !== walletHex ||
        draft.scope.market !== "0" ||
        draft.profile !== "setl8-sdk-dev-v1" ||
        draft.sdkVersion !== "0.1.0-dev.4"
      )
        throw new Error(
          "Signing scope is not this disposable synthetic fixture.",
        );
      if (
        !/^[a-f0-9]{96}$/.test(draft.orderHex) ||
        !/^([1-9]\d{0,9})$/.test(draft.nonce) ||
        BigInt(draft.nonce) > 4294967295n
      )
        throw new Error("Invalid inspected order bytes or development nonce.");
      const bytes = Uint8Array.from(Buffer.from(draft.orderHex, "hex")),
        d = sdk.decodeOrder(bytes);
      if (
        d.market !== 0 ||
        d.side !== 0 ||
        d.priceE12 !== 0n ||
        d.slE12 !== 0n ||
        d.tpE12 !== 0n ||
        d.targetNonce !== 0 ||
        d.clientTime !== BigInt(info.clock)
      )
        throw new Error(
          "Synthetic clock/market/side/protective prerequisites not met.",
        );
      if (!(
        (d.kind === 0 && d.qty > 0n && info.phase === "staged-open") ||
        (d.kind === 3 && d.qty === 0n && info.phase === "staged-close")
      ))
        throw new Error(
          "Stage the appropriate synthetic sample; only supported Market/Close is signable.",
        );
      const message = sdk.signingMessage(
        Uint8Array.from(Buffer.from(account, "hex")),
        Number(BigInt(draft.nonce)),
        bytes,
      );
      if (
        Buffer.from(message).toString("hex") !== draft.messageHex ||
        JSON.stringify(sdk.orderToTransport(d)) !==
          JSON.stringify(draft.decoded)
      )
        throw new Error(
          "Inspected order/message/decoded fields differ from exact SDK bytes.",
        );
      return sign(null, Buffer.from(message), privateKey).toString("hex");
    },
    async operate(action) {
      if (closed || busy)
        throw new Error("A local operator command is already active.");
      busy = true;
      try {
        if (action === "stage-open") {
          if (!["ready", "evaluated-close"].includes(info.phase))
            throw new Error(
              "Finish the active synthetic intent before staging another open.",
            );
          const clock =
            info.phase === "ready"
              ? BigInt(info.clock)
              : BigInt(info.clock) + 9n;
          await cli("advance", [account, String(clock), "60000"]);
          info = { ...info, clock: String(clock), phase: "staged-open" };
        } else if (action === "stage-close") {
          if (info.phase !== "evaluated-open")
            throw new Error(
              "Evaluate the opening intent before staging Close.",
            );
          const clock = BigInt(info.clock) + 9n;
          // Manufactured close sample: +1000 USD over the 60000 open, so the closed trade shows a clear profit.
          // The demo runbook's loss scenario may stage a different sample through SETL8_SYNTHETIC_CLOSE_USD (a plain
          // integer of 1 to 6 digits, read here at call time). Unset or malformed means the unchanged 61000 default.
          const override = process.env.SETL8_SYNTHETIC_CLOSE_USD;
          const closeUsd = /^[1-9]\d{0,5}$/.test(override ?? "")
            ? override
            : "61000";
          await cli("advance", [account, String(clock), closeUsd]);
          info = { ...info, clock: String(clock), phase: "staged-close" };
        } else if (action === "evaluate") {
          if (!["staged-open", "staged-close"].includes(info.phase))
            throw new Error(
              "Stage a manufactured sample and submit its intent before evaluation.",
            );
          const clock = BigInt(info.clock) + 1n;
          await cli("tick", [account, String(clock)]);
          await cli("drain", [account, `${id}-${info.clock}`]);
          await cli("work", [account]);
          info = {
            ...info,
            clock: String(clock),
            phase:
              info.phase === "staged-open"
                ? "evaluated-open"
                : "evaluated-close",
          };
        } else if (action === "recover") await cli("recover", [account]);
        else throw new Error("Unknown local operator action.");
        await writeFile(
          logRoot + "/operator-state.json",
          JSON.stringify(info, null, 2),
        );
        return { ...info };
      } finally {
        busy = false;
      }
    },
    close() {
      closed = true;
      authMessage = null;
    },
  };
}
