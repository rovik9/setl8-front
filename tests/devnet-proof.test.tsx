import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DevnetProof, { explorerUrl } from "../src/pages/DevnetProof";
import proof from "../src/data/devnet-proof.json";

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;

describe("devnet proof page", () => {
  it("pins a devnet manifest by hash and holds only public, valid identifiers", () => {
    expect(proof.format).toBe("setl8-front-devnet-proof");
    expect(proof.cluster).toBe("devnet");
    expect(proof.source.manifest.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(proof.source.demo.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(proof.genesis_hash).toMatch(ADDRESS);
    expect(proof.programs.lev.id).toMatch(ADDRESS);
    expect(proof.programs.vault.id).toMatch(ADDRESS);
    for (const section of proof.sections)
      for (const item of section.items)
        expect(item.value).toMatch(item.kind === "tx" ? SIGNATURE : ADDRESS);
    const text = JSON.stringify(proof);
    expect(text).not.toMatch(/key_file|keypair|secret|seed|\/Users\/|~\/\./i);
  });

  it("renders every step with Explorer links on devnet and marks day-2 steps pending", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<DevnetProof />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Devnet proof/ }),
    ).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(proof.sections.length);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(
        /^https:\/\/explorer\.solana\.com\/(tx|address)\/[1-9A-HJ-NP-Za-km-z]+\?cluster=devnet$/,
      );
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    const purchase = proof.sections[0].items.find((i) => i.kind === "tx")!;
    expect(
      links.some(
        (l) => l.getAttribute("href") === explorerUrl("tx", purchase.value),
      ),
    ).toBe(true);
    // day-2 steps are pending until the owner regenerates the pinned data; none may be pending afterwards
    const pending = proof.sections.filter((s) => s.pending);
    expect(screen.queryAllByRole("status")).toHaveLength(pending.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is about the leveraged challenge only", () => {
    const { container } = render(<DevnetProof />);
    expect(container.textContent).not.toMatch(
      /prediction|predict|hft|simfunded|vindex|options[- ]trading|sector 2|roadmap/i,
    );
  });
});
