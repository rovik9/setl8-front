import { useCallback, useEffect, useRef, useState } from "react";
import { beginWork } from "./loading";
import { errorMessage } from "../api/client";
export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}
/** Effect-scoped storage: no global private cache; identity-keyed owners remount it. */
export function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  enabled = true,
  poll = 0,
): Resource<T> {
  const [value, setValue] = useState<{
    key: string;
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ key, data: null, error: null, loading: enabled });
  const [revision, setRevision] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  useEffect(() => {
    if (!enabled) {
      setValue({ key, data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    setValue({ key, data: null, error: null, loading: true });
    const run = async (initial = false) => {
      if (controller.signal.aborted) return;
      const done = initial ? beginWork() : () => {};
      try {
        const data = await loader.current(controller.signal);
        if (!controller.signal.aborted) {
          setValue({ key, data, error: null, loading: false });
          failures = 0;
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setValue({ key, data: null, error: errorMessage(e), loading: false });
          failures++;
        }
      } finally {
        done();
        if (poll && !controller.signal.aborted && failures < 6)
          timer = setTimeout(
            () => void run(),
            Math.min(60000, poll * 2 ** failures),
          );
      }
    };
    void run(true);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, enabled, poll, revision]);
  return value.key === key
    ? { ...value, refresh }
    : { data: null, error: null, loading: enabled, refresh };
}
