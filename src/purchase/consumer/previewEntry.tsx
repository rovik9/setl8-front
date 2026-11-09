import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/outfit";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "../../styles.css";
import "./preview.css";
import { PurchasePreview } from "./Preview";
import { PurchaseClient } from "./client";
import { createPurchaseFixtures, fixtureWallets, fixtureId } from "./fixtures";
const fixtures = createPurchaseFixtures(),
  client = new PurchaseClient(
    {
      wallet: fixtureWallets[0],
      deploymentId: "p30-devnet-rehearsal-v1",
      sessionEpoch: 1,
      evidencePurpose: "synthetic_test",
    },
    fixtures.transport,
  );
let request = 1000;
createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <PurchasePreview
      client={client}
      wallets={fixtureWallets}
      nextId={() => fixtureId(request++)}
      onScenario={fixtures.setScenario}
    />
  </MotionConfig>,
);
