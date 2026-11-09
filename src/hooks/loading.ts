import { useEffect, useSyncExternalStore } from "react";
let pending = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
export function beginWork() {
  pending++;
  notify();
  let done = false;
  return () => {
    if (!done) {
      done = true;
      pending--;
      notify();
    }
  };
}
export function usePending() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => pending > 0,
  );
}
export function LoadingWork() {
  useEffect(() => beginWork(), []);
  return null;
}
