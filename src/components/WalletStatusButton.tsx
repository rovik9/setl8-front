import { useOptionalAuth } from "../auth/context";
import { WalletButton } from "./WalletDialog";

/** Presentation only. The session manager remains responsible for signing eligibility. */
export function WalletStatusButton() {
  const auth = useOptionalAuth();
  return (
    <span className="wallet-chip">
      <WalletButton />
      {auth?.session && !auth.manager.isPurchaseWallet(auth.session.wallet) && (
        <small>Not connected for signing</small>
      )}
    </span>
  );
}
