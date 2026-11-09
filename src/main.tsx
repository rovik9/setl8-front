import { PrototypeProvider } from "./prototype/context";
import React, { Suspense, lazy, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router-dom";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/outfit";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles.css";
import { AuthProvider } from "./auth/context";
import { WalletDialog } from "./components/WalletDialog";
import { LoadingWork, usePending } from "./hooks/loading";
import { Button, Empty } from "./components/ui";
const Landing = lazy(() => import("./pages/Landing"));
const Workspace = lazy(() => import("./components/Workspace"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Accounts = lazy(() => import("./pages/Accounts"));
const Purchase = lazy(() => import("./pages/Purchase"));
const LivePreview = lazy(() => import("./live/Preview"));
const Terminal = lazy(() => import("./pages/Terminal"));
const Admin = lazy(() => import("./pages/Admin"));
const DevnetTerminal = lazy(() => import("./pages/DevnetTerminal"));
const DevnetHistory = lazy(() => import("./pages/DevnetHistory"));
const DevnetProof = lazy(() => import("./pages/DevnetProof"));
const Buy = lazy(() => import("./pages/Buy"));
const MyAccount = lazy(() => import("./pages/MyAccount"));
class ErrorBoundary extends React.Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <Empty
        title="This view couldn’t open"
        action={
          <Button onClick={() => window.location.reload()}>Reload app</Button>
        }
      >
        Reload to recover your workspace. Your backend session stays in its
        HttpOnly cookie.
      </Empty>
    ) : (
      this.props.children
    );
  }
}
function Progress() {
  const pending = usePending();
  return (
    <div
      className={"top-progress " + (pending ? "busy" : "")}
      role={pending ? "progressbar" : undefined}
      aria-label={pending ? "Loading workspace" : undefined}
    >
      {pending && <span />}
    </div>
  );
}
function RouteEffects() {
  const location = useLocation();
  useEffect(() => {
    document.title =
      location.pathname === "/"
        ? "Setl8 — Your edge. A bigger stage."
        : location.pathname === "/devnet-proof"
          ? "Setl8 — Devnet proof"
          : `Setl8 — ${location.pathname.includes("purchase") ? "Purchase" : location.pathname.includes("terminal") ? "Terminal" : location.pathname.endsWith("/list") ? "Accounts" : "Overview"}`;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  return null;
}
const Vault = lazy(() => import("./pages/Vault"));
const TerminalEntry = lazy(() => import("./pages/TerminalEntry"));
function PurchaseEntry() {
  const location = useLocation();
  const tier = new URLSearchParams(location.search).get("tier");
  return (
    <Navigate
      to={
        tier !== null && /^[0-9]$/.test(tier)
          ? "/buy" + location.search
          : "/#pricing"
      }
      replace
    />
  );
}
function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <PrototypeProvider>
          <AuthProvider>
            <a className="skip-link" href="#main-content">
              Skip to content
            </a>
            <Progress />
            <ErrorBoundary>
              <RouteEffects />
              <Suspense
                fallback={
                  <>
                    <LoadingWork />
                    <div className="route-loading" role="status">
                      Opening workspace…
                    </div>
                  </>
                }
              >
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/live-prices" element={<LivePreview />} />
                  <Route path="/devnet-proof" element={<DevnetProof />} />
                  <Route path="/devnet-history" element={<DevnetHistory />} />
                  <Route path="/devnet-terminal" element={<DevnetTerminal />} />
                  <Route path="/buy" element={<Buy />} />
                  <Route path="/vault" element={<Vault />} />
                  <Route path="/my-account" element={<MyAccount />} />
                  <Route path="/purchase" element={<PurchaseEntry />} />
                  <Route
                    path="/demo/purchase"
                    element={<Purchase key="purchase-demo" demo />}
                  />
                  {["app", "demo"].map((mode) => (
                    <Route
                      key={mode}
                      path={"/" + mode}
                      element={<Workspace demo={mode === "demo"} />}
                    >
                      <Route
                        index
                        element={<Navigate to="accounts" replace />}
                      />
                      <Route path="accounts" element={<Dashboard />} />
                      <Route path="accounts/list" element={<Accounts />} />
                      <Route
                        path="terminal"
                        element={
                          mode === "app" ? <TerminalEntry /> : <Terminal />
                        }
                      />
                      {mode === "app" && (
                        <Route path="admin" element={<Admin />} />
                      )}
                    </Route>
                  ))}
                  <Route
                    path="*"
                    element={
                      <Empty
                        title="Page not found"
                        action={
                          <Link to="/" className="button secondary">
                            Return to Setl8
                          </Link>
                        }
                      >
                        Choose a page from the workspace navigation.
                      </Empty>
                    }
                  />
                </Routes>
              </Suspense>
            </ErrorBoundary>
            <WalletDialog />
          </AuthProvider>
        </PrototypeProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
