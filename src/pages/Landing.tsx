import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Menu, ShieldCheck, Wallet, X } from "lucide-react";
import {
  liveReleaseConfigured,
  REVIEWED_OWNER_SCOPE,
} from "../buy/executionGate";
import { LoadingWork } from "../hooks/loading";
import { WalletButton } from "../components/WalletDialog";
import { Brand, Button, Modal } from "../components/ui";
import { formatMicro, sizeLabel, tierByIndex, TIERS } from "../buy/tiers";
import { sitePresentation } from "../data/sitePresentation";
import "../landing.css";

const Checkout = lazy(() => import("./Buy"));

export default function Landing() {
  const reduce = useReducedMotion();
  const [menu, setMenu] = useState(false);
  const [phase, setPhase] = useState("evaluation");
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  useEffect(() => {
    if (location.hash !== "#pricing") return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById("pricing")
        ?.scrollIntoView({ behavior: "instant" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [location.hash]);
  const selection = params.get("checkout");
  const selected =
    selection !== null && /^[0-9]$/.test(selection)
      ? tierByIndex(Number(selection))
      : undefined;
  const presentation = sitePresentation();
  const copy = presentation.copy;
  const purchaseTestAvailable = liveReleaseConfigured();
  const testTiers = REVIEWED_OWNER_SCOPE.tiers.map(Number);
  useEffect(() => {
    document.title = "Setl8 — Your trading journey";
  }, []);
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("checkout");
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const choose = (index: number) => {
    const next = new URLSearchParams(params);
    next.set("checkout", String(index));
    setParams(next, { preventScrollReset: true });
  };
  return (
    <div className="landing original-landing">
      <header className="site-header wrap">
        <Brand />
        <nav
          id="landing-navigation"
          aria-label="Main navigation"
          className={menu ? "open" : ""}
          onKeyDown={(e) => {
            if (e.key === "Escape") setMenu(false);
          }}
        >
          {[
            ["#how-it-works", "How it works"],
            ["#challenge", "The challenge"],
            ["#pricing", "Pricing"],
            ["#faq", "FAQ"],
            ["/vault", "Vault"],
          ].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenu(false)}>
              {label}
            </a>
          ))}
        </nav>
        <div className="site-header-actions">
          <WalletButton />
          <Link to={presentation.accountPath} className="button secondary">
            Dashboard
          </Link>
          <Button
            variant="ghost"
            className="menu-toggle"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            aria-controls="landing-navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </header>
      <main id="main-content">
        <section className="original-hero wrap">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.5 }}
          >
            <p className="original-network">
              <span className="status-dot" />
              Built on Solana · Devnet
            </p>
            <h1>
              Trade your way.
              <br />
              Prove your edge.
            </h1>
            <p className="original-lead">
              Choose your challenge. Follow your progress.
              <br />
              Build a trading record you can see.
            </p>
            <div className="hero-actions">
              <a href="#pricing" className="button primary">
                Choose your challenge <ArrowRight size={17} />
              </a>
              <Link to="/vault" className="button secondary">
                <ShieldCheck size={17} /> View vault
              </Link>
            </div>
            <p className="original-test-note">
              Development preview · test tokens, no real funds
            </p>
          </motion.div>
          <div className="original-vault" aria-label="Recorded vault history">
            <div>
              <ShieldCheck size={20} />
              <strong>Follow the payout journey</strong>
              <span className="original-history-label">
                Recorded devnet example
              </span>
            </div>
            <ol>
              <li>
                <span>Account passed</span>
                <Check size={17} />
              </li>
              <li>
                <span>Claim queued</span>
                <Check size={17} />
              </li>
              <li>
                <span>Payment settled</span>
                <strong>200.000000 test USDC</strong>
              </li>
            </ol>
            <p>
              One archived account’s settlement, with its transaction record.
              <Link to="/devnet-history">
                View the receipt <ArrowRight size={14} />
              </Link>
            </p>
          </div>
        </section>
        <div className="original-trust wrap" aria-label="Challenge at a glance">
          <span>
            <Check size={15} />
            8% target per phase
          </span>
          <span>
            <Check size={15} />
            Five challenge phases
          </span>
          <span>
            <Check size={15} />
            100% split in phases 2–5
          </span>
          <span>
            <Check size={15} />
            0.4% purchase fee
          </span>
        </div>
        <section id="how-it-works" className="original-section wrap">
          <div className="original-heading">
            <h2>How it works</h2>
            <p>From your first challenge to your next milestone.</p>
          </div>
          <ol className="original-steps">
            {[
              [
                "Choose your account",
                "Pick from ten sizes. Connect your wallet, review the total, then approve payment in your wallet.",
                Wallet,
              ],
              [
                "Prove your process",
                "Trade a simulated account. Follow your balance and positions toward the 8% phase target.",
                ArrowRight,
              ],
              [
                "Follow your progress",
                "Phase one is evaluation. Phases 2–5 carry a 100% profit split, with payout status in your account.",
                ShieldCheck,
              ],
            ].map(([title, text, Icon], i) => {
              const StepIcon = Icon as typeof Wallet;
              return (
                <li key={String(title)}>
                  <span className="original-step-number">{i + 1}</span>
                  <StepIcon size={23} />
                  <h3>{String(title)}</h3>
                  <p>{String(text)}</p>
                </li>
              );
            })}
          </ol>
        </section>
        <section id="challenge" className="original-section original-band">
          <div className="wrap">
            <div className="original-heading">
              <h2>The journey through your challenge</h2>
              <p>{copy.structure}</p>
            </div>
            <div className="original-phase">
              <div className="segmented" aria-label="Challenge phases">
                {copy.tabs.map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={phase === id}
                    onClick={() => setPhase(id)}
                  >
                    {phase === id && (
                      <motion.span
                        className="segment-active"
                        layoutId="phase-active"
                        transition={{ duration: reduce ? 0 : 0.25 }}
                      />
                    )}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div aria-live="polite" className="original-phase-body">
                <h3>
                  {phase === "evaluation"
                    ? "Start with your evaluation"
                    : phase === "payable"
                      ? "Four payable phases"
                      : "Your next stage"}
                </h3>
                <p>
                  {phase === "evaluation"
                    ? "Reach the 8% target while meeting your account’s rules. Phase one is unpaid."
                    : phase === "payable"
                      ? "An 8% target in each phase, with a 100% profit split. A completed target and a settled payout are separate steps."
                      : copy.afterPhaseFive}
                </p>
                <div className="original-phase-numbers">
                  <div>
                    <strong>{phase === "live" ? "75%" : "8%"}</strong>
                    <span>
                      {phase === "live" ? "Profit split" : "Phase target"}
                    </span>
                  </div>
                  <div>
                    <strong>
                      {phase === "evaluation"
                        ? "1"
                        : phase === "payable"
                          ? "100%"
                          : "None"}
                    </strong>
                    <span>
                      {phase === "evaluation"
                        ? "Evaluation phase"
                        : phase === "payable"
                          ? "Profit split"
                          : "Profit target"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="pricing" className="original-section wrap">
          <div className="original-heading">
            <h2>Choose your account size</h2>
            <p>
              One challenge price, plus a 0.4% fee. All ten sizes, in test USDC.
            </p>
          </div>
          <p className="original-availability" role="status">
            {purchaseTestAvailable
              ? "The current devnet purchase test supports the $2.5K to $15K accounts for the approved wallet. All ten sizes are shown below."
              : "The purchase test is currently unavailable. You can explore all ten account sizes below."}
          </p>
          <div className="original-pricing">
            {TIERS.map((t) => (
              <article
                key={t.index}
                className={
                  purchaseTestAvailable && testTiers.includes(t.index)
                    ? "original-price featured"
                    : "original-price"
                }
              >
                <p>
                  {purchaseTestAvailable && testTiers.includes(t.index)
                    ? "Devnet purchase test"
                    : "Challenge account"}
                </p>
                <h3>{sizeLabel(t.accountSizeUsd)}</h3>
                <div className="original-price-amount">
                  <strong>{formatMicro(t.priceMicro)}</strong>
                  <span>test USDC</span>
                </div>
                <ul>
                  <li>
                    <Check size={14} />
                    8% phase target
                  </li>
                  <li>
                    <Check size={14} />
                    Five challenge phases
                  </li>
                  <li>
                    <Check size={14} />
                    100% split in phases 2–5
                  </li>
                </ul>
                <p className="original-price-total">
                  Total {formatMicro(t.totalMicro)} test USDC
                  <span>Includes {formatMicro(t.feeMicro)} fee</span>
                </p>
                <Button
                  variant={
                    purchaseTestAvailable && testTiers.includes(t.index)
                      ? "primary"
                      : "secondary"
                  }
                  aria-label={
                    "Choose $" +
                    t.accountSizeUsd.toLocaleString("en-US") +
                    " account"
                  }
                  onClick={() => choose(t.index)}
                >
                  Choose {sizeLabel(t.accountSizeUsd)}
                </Button>
              </article>
            ))}
          </div>
          <p className="original-pricing-note">
            Current account terms and network costs are checked before approval.
            Purchase availability depends on the connected wallet.
          </p>
        </section>
        <section className="original-section original-band">
          <div className="wrap original-rules">
            <div>
              <h2>
                Clear targets.
                <br />
                Progress in view.
              </h2>
              <p>
                One workspace for your account, positions and recorded activity.
              </p>
              <Link to="/demo/terminal" className="button secondary">
                Explore the demo
              </Link>
            </div>
            <dl>
              <div>
                <dt>Phase target</dt>
                <dd>8% each phase</dd>
              </div>
              <div>
                <dt>Evaluation</dt>
                <dd>Phase 1 · unpaid</dd>
              </div>
              <div>
                <dt>Payable phases</dt>
                <dd>Phases 2–5 · 100% split</dd>
              </div>
              <div>
                <dt>Account basis</dt>
                <dd>Simulated trading</dd>
              </div>
              <div>
                <dt>Position model</dt>
                <dd>Netting · BTC first</dd>
              </div>
            </dl>
          </div>
        </section>
        <section id="faq" className="original-section wrap">
          <div className="original-heading">
            <h2>Frequently asked questions</h2>
            <p>Before you start.</p>
          </div>
          <div className="original-faq">
            {[
              [
                "How do I buy a challenge?",
                "Choose an account size above. Connect your wallet, review the checked total, and approve the purchase transaction in your wallet when available. Your selected size stays with you through sign-in.",
              ],
              [
                "What does wallet sign-in approve?",
                "Sign-in opens your account dashboard. Payment requires a separate transaction approval in your wallet.",
              ],
              [
                "What is the purchase fee?",
                "The fee is 0.4% of the challenge price, rounded up to the smallest token unit. Your review shows the price, fee and total. Network costs are paid separately in SOL.",
              ],
              [
                "How do the phases work?",
                "The challenge has five phases with an 8% target each. Phase one is unpaid. Phases 2–5 have a 100% profit split. Reaching a target does not automatically settle a payout.",
              ],
              [
                "What is available today?",
                "This development preview uses Solana devnet test tokens. Wallet sign-in and account reads are available. Purchase approval depends on the wallet’s current access. Trading, resets and payouts require their own availability.",
              ],
              [
                "What happens if a payment is delayed?",
                "Your purchase attempt is saved for recovery. Check its status or open your dashboard before trying another payment.",
              ],
              ...(copy.afterPhaseFive
                ? [["What follows phase five?", copy.afterPhaseFive]]
                : []),
            ].map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="original-final wrap">
          <h2>Your next challenge starts here.</h2>
          <a href="#pricing" className="button primary">
            Choose your account <ArrowRight size={17} />
          </a>
        </section>
      </main>
      <footer className="site-footer wrap">
        <Brand />
        <span>Solana devnet · test tokens</span>
        <Link to="/my-account">Dashboard</Link>
        <Link to="/vault">Vault</Link>
        <Link to="/devnet-history">Payout history</Link>
      </footer>
      {selected && (
        <Modal title="Review a purchase" onClose={close}>
          <Suspense
            fallback={
              <>
                <LoadingWork />
                <p role="status">Opening checkout…</p>
              </>
            }
          >
            <Checkout key={selected.index} embedded />
          </Suspense>
        </Modal>
      )}
    </div>
  );
}
