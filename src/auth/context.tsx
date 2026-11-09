import { watchWallets } from "./wallet";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api } from "../api/client";
import { SessionManager, type AuthState } from "./session";
const Context = createContext<{
  manager: SessionManager;
  open: () => void;
  close: () => void;
  isOpen: boolean;
} | null>(null);
export function AuthProvider({
  children,
  manager: provided,
}: {
  children: ReactNode;
  manager?: SessionManager;
}) {
  const [manager] = useState(() => provided ?? new SessionManager(api));
  const [isOpen, setOpen] = useState(false);
  useEffect(() => {
    void manager.restore();
    const focus = () => {
      void manager.check();
    };
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 60000);
    const stopWalletWatch = watchWallets(() =>
      manager.restoreConnectedWallet(),
    );
    return () => {
      stopWalletWatch();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      manager.dispose();
    };
  }, [manager]);
  return (
    <Context.Provider
      value={{
        manager,
        isOpen,
        open: () => setOpen(true),
        close: () => {
          manager.cancel();
          setOpen(false);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
const guest: AuthState = {
  phase: "guest",
  session: null,
  challenge: null,
  error: null,
  epoch: 0,
};
const noSubscription = () => () => {};
const guestSnapshot = () => guest;
/** The optional form is only for the existing isolated demo views outside the app provider. */
export function useOptionalAuth() {
  const context = useContext(Context);
  const state = useSyncExternalStore(
    context?.manager.subscribe ?? noSubscription,
    context?.manager.getSnapshot ?? guestSnapshot,
  );
  return context ? { ...context, ...state } : null;
}
export function useAuth() {
  const auth = useOptionalAuth();
  if (!auth) throw new Error("AuthProvider required");
  return auth;
}
