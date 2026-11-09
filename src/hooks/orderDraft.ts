import { useEffect, useRef, useState } from "react";
import {
  draftErrors,
  prepareOrderDraft,
  type DraftScope,
  type DraftFields,
  type PreparedDraft,
} from "../data/orderDraft";
import { beginWork } from "./loading";
export function useOrderDraft(
  scope: DraftScope,
  fields: DraftFields,
  prepare = prepareOrderDraft,
) {
  const key = JSON.stringify([scope, fields]);
  const latest = useRef(key);
  latest.current = key;
  const generation = useRef(0);
  const done = useRef<(() => void) | null>(null);
  const [result, setResult] = useState<{
    key: string;
    prepared: PreparedDraft | null;
    busy: boolean;
    error: string | null;
  }>({ key, prepared: null, busy: false, error: null });
  const invalidate = () => {
    ++generation.current;
    done.current?.();
    done.current = null;
    setResult({
      key: latest.current,
      prepared: null,
      busy: false,
      error: null,
    });
  };
  useEffect(() => {
    invalidate();
    return () => {
      ++generation.current;
      done.current?.();
      done.current = null;
    };
  }, [key]);
  const run = async () => {
    if (Object.keys(draftErrors(scope, fields)).length) return;
    const version = ++generation.current;
    done.current?.();
    const finish = beginWork();
    done.current = finish;
    setResult({ key, prepared: null, busy: true, error: null });
    try {
      const prepared = await prepare({ ...scope }, { ...fields });
      if (version === generation.current && latest.current === key)
        setResult({ key, prepared, busy: false, error: null });
    } catch (e) {
      if (version === generation.current && latest.current === key)
        setResult({
          key,
          prepared: null,
          busy: false,
          error: e instanceof Error ? e.message : "Draft preparation failed.",
        });
    } finally {
      finish();
      if (done.current === finish) done.current = null;
    }
  };
  const visible =
    result.key === key ? result : { prepared: null, busy: false, error: null };
  return {
    ...visible,
    errors: draftErrors(scope, fields),
    prepare: run,
    invalidate,
  };
}
