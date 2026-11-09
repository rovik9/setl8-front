import { it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import bs58 from "bs58";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const wallet = bs58.encode(new Uint8Array(32).fill(31));
vi.mock("../src/auth/context", () => ({
  useAuth: () => ({
    session: { wallet: bs58.encode(new Uint8Array(32).fill(31)) },
    epoch: 4,
    manager: {
      getSnapshot: () => ({
        phase: "authenticated",
        epoch: 4,
        session: { wallet: bs58.encode(new Uint8Array(32).fill(31)) },
      }),
    },
  }),
}));
import { PipelinePanel } from "../src/devnet/PipelinePanel";
import { DEVNET_JOB_RELEASE } from "../src/devnet/pipeline";
it("production job gates stay off: the hooked panel retains public recovery without making HTTP requests", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const fetch = vi.spyOn(globalThis, "fetch");
  localStorage.clear();
  const account = "21".repeat(32);
  try {
    render(
      <MemoryRouter>
        <PipelinePanel
          wallet={wallet}
          account={account}
          accountAddress={bs58.encode(Buffer.from(account, "hex"))}
          operation="purchase"
          signature={bs58.encode(new Uint8Array(64).fill(7))}
          autoStart
        />
      </MemoryRouter>,
    );
    const button = await screen.findByRole("button", {
      name: "Verify original purchase",
    });
    await waitFor(() => expect(button).toBeDisabled());
    expect(DEVNET_JOB_RELEASE).toEqual({ read: false, trigger: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Connection awaiting reviewed activation/),
    ).toBeVisible();
  } finally {
    fetch.mockRestore();
    vi.unstubAllGlobals();
  }
});
