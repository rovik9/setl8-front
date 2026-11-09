import type {
  PracticeAccount,
  PracticePrice,
  PracticePrices,
} from "../api/practice-v1";
import type { PracticeHttp } from "./http";
export type PriceView = {
  rows: PracticePrice[];
  through: string | null;
  next: string | null;
  loading: boolean;
  error: string | null;
};
/** Independent immutable replay-frame pages; one fixed through_step per result. */
export class PracticePricesResource {
  private value: PriceView = {
    rows: [],
    through: null,
    next: null,
    loading: false,
    error: null,
  };
  private listeners = new Set<() => void>();
  private abort = new AbortController();
  private busy = false;
  private dirty = false;
  private stopped = false;
  constructor(
    private a: PracticeAccount,
    private http: Pick<PracticeHttp, "prices">,
  ) {}
  getSnapshot = () => this.value;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  private set(v: Partial<PriceView>) {
    if (this.stopped) return;
    this.value = { ...this.value, ...v };
    this.listeners.forEach((f) => f());
  }
  refresh = async () => {
    if (this.busy) {
      this.dirty = true;
      return;
    }
    await this.load(false);
  };
  more = async () => {
    if (!this.busy && this.value.next) await this.load(true);
  };
  private async load(more: boolean) {
    this.busy = true;
    this.set({ loading: true, error: null });
    try {
      let rows = more ? [...this.value.rows] : [],
        after = more ? this.value.next : null,
        through = more ? this.value.through : null,
        next: string | null = null;
      const target = more
        ? Math.min(1000, rows.length + 100)
        : Math.max(100, this.value.rows.length);
      let pages = 0;
      do {
        const p: PracticePrices = await this.http.prices(
          this.a,
          after,
          through,
          this.abort.signal,
        );
        if (this.stopped || this.abort.signal.aborted) return;
        if (
          p.account !== this.a.account ||
          p.purpose !== "synthetic_test" ||
          p.timestamp_basis !== "synthetic_execution_second" ||
          p.interpolation !== false ||
          (through !== null && p.through_step !== through)
        )
          throw Error(
            "Replay history identity/cutoff changed. Refresh the frame view.",
          );
        through = p.through_step;
        if (p.rows.length > 100 || ++pages > 10)
          throw Error(
            "Replay history page limit exceeded. Narrow the displayed frame window.",
          );
        for (const row of p.rows) {
          if (rows.length && BigInt(row.step) <= BigInt(rows.at(-1)!.step))
            throw Error("Duplicate/out-of-order replay frames.");
          rows.push(row);
        }
        next = p.has_more ? p.next_after : null;
        if (next && next === after)
          throw Error("Replay pagination did not advance.");
        after = next;
      } while (next && rows.length < target);
      if (rows.length > 1000)
        throw Error(
          "Replay view exceeds 1,000 frames. No silent truncation was applied.",
        );
      this.set({ rows, through, next, loading: false, error: null });
    } catch (e) {
      if (!this.stopped && !this.abort.signal.aborted)
        this.set({ loading: false, error: (e as Error).message });
    } finally {
      this.busy = false;
      if (this.dirty && !this.stopped) {
        this.dirty = false;
        void this.refresh();
      }
    }
  }
  dispose() {
    this.stopped = true;
    this.abort.abort();
    this.listeners.clear();
  }
}
