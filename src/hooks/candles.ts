import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type { RecordedCandle, RecordedCandlePage } from "../api/frontend-v1";
import {
  acceptCandlePage,
  candlePath,
  HISTORY_RESPONSE_BYTES,
  historyFailure,
  type CandleScope,
} from "../data/history";
import { beginWork } from "./loading";
type Failure = ReturnType<typeof historyFailure>;
interface CandleState {
  key: string;
  page: RecordedCandlePage | null;
  rows: RecordedCandle[];
  loading: boolean;
  error: Failure | null;
  continuationBlocked: boolean;
}
export function useCandles(scope: CandleScope | null, sessionKey: string) {
  const key = JSON.stringify([sessionKey, scope]);
  const [state, setState] = useState<CandleState>({
    key,
    page: null,
    rows: [],
    loading: false,
    error: null,
    continuationBlocked: false,
  });
  const commands = useRef<{ fresh: () => void; more: () => void } | null>(null);
  useEffect(() => {
    let stopped = false,
      generation = 0,
      busy = false;
    let controller: AbortController | null = null;
    let applied: CandleState = {
      key,
      page: null,
      rows: [],
      loading: false,
      error: null,
      continuationBlocked: false,
    };
    const publish = (patch: Partial<CandleState>) => {
      applied = { ...applied, ...patch };
      if (!stopped) setState(applied);
    };
    const read = async (fresh: boolean) => {
      if (
        !scope ||
        stopped ||
        (!fresh &&
          (busy || !applied.page?.next_cursor || applied.continuationBlocked))
      )
        return;
      controller?.abort();
      const active = new AbortController();
      controller = active;
      const version = ++generation;
      const previous = fresh ? null : applied.page;
      const existing = fresh ? [] : applied.rows;
      busy = true;
      publish({ loading: true, error: null });
      const done = beginWork();
      const timeout = setTimeout(
        () =>
          active.abort(
            new Error("Recorded history timed out. Retry or narrow the range."),
          ),
        12000,
      );
      try {
        const path = candlePath(scope, previous?.next_cursor ?? undefined);
        const page = await api.request<RecordedCandlePage>(path, {
          signal: active.signal,
          maxBytes: HISTORY_RESPONSE_BYTES,
        });
        if (stopped || version !== generation || active.signal.aborted) return;
        const rows = acceptCandlePage(scope, page, previous, existing);
        publish({
          page,
          rows,
          loading: false,
          error: null,
          continuationBlocked: false,
        });
      } catch (error) {
        if (stopped || version !== generation) return;
        // Parent cancellation never publishes an error; timeout is a deliberate bounded failure.
        const failure = historyFailure(
          active.signal.aborted ? active.signal.reason : error,
        );
        const expired = error instanceof ApiError && error.status === 401;
        publish({
          loading: false,
          error: failure,
          continuationBlocked: true,
          ...(expired ? { page: null, rows: [] } : {}),
        });
      } finally {
        clearTimeout(timeout);
        done();
        if (version === generation) busy = false;
      }
    };
    commands.current = {
      fresh: () => void read(true),
      more: () => void read(false),
    };
    setState(applied);
    // Reads begin only after an explicit valid range has been applied by the user.
    if (scope) void read(true);
    return () => {
      stopped = true;
      ++generation;
      controller?.abort();
      commands.current = null;
    };
  }, [key]); // key serializes the complete selector and session identity.
  const visible =
    state.key === key
      ? state
      : {
          key,
          page: null,
          rows: [],
          loading: !!scope,
          error: null,
          continuationBlocked: false,
        };
  return {
    ...visible,
    refresh: () => commands.current?.fresh(),
    more: () => commands.current?.more(),
  };
}
