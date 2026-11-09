import type { AccountPage, AccountPort } from "./data";
export interface AccountState {
  wallet: string | null;
  page: string;
  loading: boolean;
  data: AccountPage | null;
  error: string | null;
  epoch: number;
}
/** One pending read per resource, with epochs preventing late responses from crossing addresses/pages. */
export class AccountResource {
  private state: AccountState = {
    wallet: null,
    page: "0",
    loading: false,
    data: null,
    error: null,
    epoch: 0,
  };
  private abort = new AbortController();
  private listeners = new Set<() => void>();
  constructor(readonly port: AccountPort) {}
  getSnapshot = () => this.state;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  private set(v: Partial<AccountState>) {
    this.state = Object.freeze({ ...this.state, ...v });
    this.listeners.forEach((f) => f());
  }
  select(wallet: string | null, page = "0") {
    this.abort.abort();
    this.abort = new AbortController();
    this.set({
      wallet,
      page,
      epoch: this.state.epoch + 1,
      loading: false,
      data: null,
      error: null,
    });
  }
  async refresh() {
    if (!this.state.wallet || this.state.loading) return;
    const { wallet, page, epoch } = this.state,
      signal = this.abort.signal;
    this.set({ loading: true, error: null });
    try {
      const data = await this.port.read(wallet, page, signal);
      if (
        epoch === this.state.epoch &&
        !signal.aborted &&
        data.wallet === wallet &&
        data.page === page
      )
        this.set({ data, loading: false });
    } catch (e) {
      if (epoch === this.state.epoch && !signal.aborted)
        this.set({
          loading: false,
          error:
            e instanceof Error ? e.message : "Could not check public state.",
        });
    } finally {
      if (epoch === this.state.epoch) this.set({ loading: false });
    }
  }
  cancel() {
    this.abort.abort();
    this.abort = new AbortController();
    this.set({ epoch: this.state.epoch + 1, loading: false });
  }
  dispose() {
    this.abort.abort();
    this.listeners.clear();
  }
}
export const pollDelay = (failures: number) =>
  Math.min(300000, 60000 * 2 ** Math.min(Math.max(failures, 0), 3));
export function pollAllowed(
  visible: boolean,
  enabled: boolean,
  wallet: string | null,
  loading: boolean,
) {
  return visible && enabled && !!wallet && !loading;
}
