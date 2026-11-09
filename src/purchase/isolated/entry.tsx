import { createRoot } from "react-dom/client";
import "@fontsource-variable/outfit";
import "../../styles.css";
import { IsolatedPurchaseAdapter } from "./adapter";
const connection = new IsolatedPurchaseAdapter(); // No injected mock and no real activation path.
createRoot(document.getElementById("root")!).render(
  <div className="purchase-shell">
    <header className="purchase-header">
      <a href="/" className="brand" aria-label="Setl8 home">
        <img src="/setl8-logo.png" alt="" width="43" height="43" />
        <span>
          SETL8<span className="brand-dot">®</span>
        </span>
      </a>
    </header>
    <main className="purchase-main" id="main-content">
      <h1>Account connection is not enabled.</h1>
      <p>
        The isolated account service is awaiting review. Your existing preview
        remains available.
      </p>
      <a className="button" href="/purchase-preview.html">
        Open the simulated preview
      </a>
      <details>
        <summary>Connection details</summary>
        <p>
          Status: {connection.getSnapshot().phase}. No service request or wallet
          action is enabled.
        </p>
      </details>
    </main>
  </div>,
);
