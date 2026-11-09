import { useEffect, useState } from "react";
import { AccountUpdates, type StreamStatus } from "../api/updates";
import { api, errorMessage } from "../api/client";
import {
  accountFromOverview,
  readAccount,
  type AccountBundle,
} from "../data/account";
import { demoAccount } from "../data/demo";
import { beginWork } from "./loading";
import type { AccountOverview } from "../api/frontend-v1";

export function useAccountBundle(
  account: string | null,
  demo: boolean,
  epoch: number,
  expire: () => void,
) {
  const [revision, setRevision] = useState(0);
  const key = [demo ? "demo" : "connected", epoch, account, revision].join(":");
  const [state, setState] = useState<{
    key: string;
    data: AccountBundle | null;
    evidenceRevision: number;
    error: string | null;
    loading: boolean;
  }>({ key, data: null, evidenceRevision: 0, error: null, loading: !!account });
  const [streamState, setStreamState] = useState<{
    key: string;
    status: StreamStatus;
  }>({ key, status: "closed" });

  useEffect(() => {
    if (!account || demo) {
      setState({
        key,
        data: account
          ? accountFromOverview(demoAccount(account).overview)
          : null,
        evidenceRevision: 0,
        error: null,
        loading: false,
      });
      setStreamState({ key, status: "closed" });
      return;
    }
    const controller = new AbortController();
    let stream: AccountUpdates | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let generation = 0;
    let evidenceRevision = 0;
    let appliedCursor: string | null = null;
    let stopped = false;
    let inFlight: {
      controller: AbortController;
      invalidateEvidence: boolean;
      promise: Promise<string | null>;
    } | null = null;
    const done = beginWork();
    setState({ key, data: null, evidenceRevision, error: null, loading: true });

    // One state publication installs the core view AND invalidates independent pages.
    // The returned cursor covers exactly that action, never completion of those pages.
    const apply = (data: AccountBundle, invalidateEvidence: boolean) => {
      if (data.overview.account !== account)
        throw new Error("Account response identity mismatch.");
      if (invalidateEvidence || appliedCursor !== data.overview.update_cursor)
        evidenceRevision++;
      appliedCursor = data.overview.update_cursor;
      setState({ key, data, evidenceRevision, error: null, loading: false });
      return appliedCursor;
    };
    const refresh = (
      signal: AbortSignal,
      invalidateEvidence = true,
    ): Promise<string | null> => {
      if (stopped || signal.aborted) return Promise.resolve(null);
      if (inFlight) {
        inFlight.invalidateEvidence ||= invalidateEvidence;
        return inFlight.promise;
      }
      const version = ++generation;
      const requestController = new AbortController();
      const abort = () => requestController.abort();
      signal.addEventListener("abort", abort, { once: true });
      const operation = {
        controller: requestController,
        invalidateEvidence,
        promise: Promise.resolve<string | null>(null),
      };
      operation.promise = (async () => {
        try {
          const data = await readAccount(account, requestController.signal);
          if (
            stopped ||
            signal.aborted ||
            requestController.signal.aborted ||
            version !== generation
          )
            return null;
          return apply(data, operation.invalidateEvidence);
        } catch (error) {
          if (
            stopped ||
            signal.aborted ||
            requestController.signal.aborted ||
            version !== generation
          )
            return null;
          throw error;
        } finally {
          signal.removeEventListener("abort", abort);
          if (inFlight === operation) inFlight = null;
        }
      })();
      inFlight = operation;
      return operation.promise;
    };
    const snapshot = (overview: AccountOverview): boolean => {
      if (stopped || overview.account !== account) return false;
      generation++;
      const previous = inFlight;
      inFlight = null;
      previous?.controller.abort();
      apply(accountFromOverview(overview), true);
      return true;
    };
    const poll = async () => {
      if (stopped) return;
      try {
        // An unchanged cursor only updates time-derived core fields; it need not
        // reset pagination. Stream refreshes and every streamed snapshot do.
        await refresh(controller.signal, false);
      } catch (e) {
        if (!stopped)
          setState({
            key,
            data: null,
            evidenceRevision: ++evidenceRevision,
            error: errorMessage(e),
            loading: false,
          });
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), 15000);
      }
    };
    void refresh(controller.signal)
      .then(() => {
        if (stopped) return;
        stream = new AccountUpdates({
          client: api,
          account,
          refresh,
          snapshot,
          expired: expire,
          status: (status) => {
            if (!stopped) setStreamState({ key, status });
          },
        });
        stream.start();
        timer = setTimeout(() => void poll(), 15000);
      })
      .catch((e) => {
        if (!stopped)
          setState({
            key,
            data: null,
            evidenceRevision: ++evidenceRevision,
            error: errorMessage(e),
            loading: false,
          });
      })
      .finally(done);
    return () => {
      stopped = true;
      generation++;
      controller.abort();
      inFlight?.controller.abort();
      stream?.stop();
      clearTimeout(timer);
    };
  }, [key]);
  return {
    ...(state.key === key
      ? state
      : {
          key,
          data: null,
          evidenceRevision: 0,
          error: null,
          loading: !!account,
        }),
    status:
      streamState.key === key
        ? streamState.status
        : ("connecting" as StreamStatus),
    refresh: () => setRevision((v) => v + 1),
  };
}
