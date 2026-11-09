import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/outfit";
import "../styles.css";
import "./customer.css";
import { CustomerApp } from "./view";
import { createCustomerRuntime } from "./runtime";
const root = createRoot(document.getElementById("root")!);
try {
  root.render(
    <MotionConfig reducedMotion="user">
      <CustomerApp runtime={createCustomerRuntime()} />
    </MotionConfig>,
  );
} catch {
  root.render(
    <main className="purchase-main">
      <h1>Open the customer preview.</h1>
      <p>This entry uses the separate Setl8 customer connection.</p>
    </main>,
  );
}
