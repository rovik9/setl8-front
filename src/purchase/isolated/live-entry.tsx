import { createRoot } from "react-dom/client";
import "@fontsource-variable/outfit";
import "../../styles.css";
import "./live-view.css";
import { createLiveP30ReadOnlyAdapter } from "./live";
import { ReadOnlyAccounts } from "./live-view";
const root = createRoot(document.getElementById("root")!);
try {
  root.render(<ReadOnlyAccounts connection={createLiveP30ReadOnlyAdapter()} />);
} catch {
  root.render(
    <main className="purchase-main">
      <h1>This read-only connection uses a separate preview.</h1>
      <p>
        Open the owned read-only preview to check its session. No service
        request was sent.
      </p>
    </main>,
  );
}
