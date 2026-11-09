import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Landing from "../src/pages/Landing";
import { demoBuild, stageCopy } from "../src/data/demoScope";

describe("demo build hides the Live account stage and keeps it in the default build", () => {
  it("reads the build flag exactly", () => {
    expect(demoBuild({ VITE_DEMO_BUILD: "1" })).toBe(true);
    expect(demoBuild({ VITE_DEMO_BUILD: "true" })).toBe(false);
    expect(demoBuild({})).toBe(false);
  });
  it("demo copy has no Live stage text; default copy keeps all of it", () => {
    const demo = stageCopy(true);
    expect(demo.tabs.map(([id]) => id)).toEqual(["evaluation", "payable"]);
    expect(demo.afterPhaseFive).toBeNull();
    expect(JSON.stringify(demo)).not.toMatch(/\bLive\b|75%/);
    const dev = stageCopy(false);
    expect(dev.tabs.map(([id]) => id)).toEqual([
      "evaluation",
      "payable",
      "live",
    ]);
    expect(dev.afterPhaseFive).toMatch(/75% profit split/);
  });
  it("the localhost3000 landing keeps five phases without a synthetic build flag", () => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /^Live$/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Phases 2–5" }),
    ).toBeInTheDocument();
  });
});
