import { useEffect, useState, useRef, useCallback } from "react";
import type { Page } from "../api/frontend-v1";
import { errorMessage } from "../api/client";
import { beginWork } from "./loading";
export function usePaged<T>(
  key: string,
  load: (after: string | null, signal: AbortSignal) => Promise<Page<T>>,
  enabled = true,
) {
  const [state, setState] = useState<{
    key: string;
    rows: T[];
    next: string | null;
    loading: boolean;
    error: string | null;
  }>({ key, rows: [], next: null, loading: enabled, error: null });
  const [request, setRequest] = useState<{
    key: string;
    after: string | null;
    revision: number;
  }>({ key, after: null, revision: 0 });
  const loadRef = useRef(load);
  loadRef.current = load;
  const effective =
    request.key === key ? request : { key, after: null, revision: 0 };
  useEffect(() => {
    if (!enabled) {
      setState({ key, rows: [], next: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    const done = beginWork();
    setState((old) => ({
      key,
      rows: old.key === key && effective.after ? old.rows : [],
      next: null,
      loading: true,
      error: null,
    }));
    void loadRef
      .current(effective.after, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted)
          setState((old) => ({
            key,
            rows: effective.after ? [...old.rows, ...page.rows] : page.rows,
            next: page.next_after,
            loading: false,
            error: null,
          }));
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setState((old) => ({
            ...old,
            loading: false,
            error: errorMessage(e),
          }));
      })
      .finally(done);
    return () => controller.abort();
  }, [key, enabled, effective.after, effective.revision]);
  const more = useCallback(() => {
    if (state.key === key && state.next && !state.loading)
      setRequest({ key, after: state.next, revision: effective.revision });
  }, [state, key, effective.revision]);
  const refresh = useCallback(
    () => setRequest({ key, after: null, revision: effective.revision + 1 }),
    [key, effective.revision],
  );
  return {
    ...(state.key === key
      ? state
      : { key, rows: [], next: null, loading: enabled, error: null }),
    more,
    refresh,
  };
}
