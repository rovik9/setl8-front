import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useResource } from "../src/hooks/resource";
import { usePaged } from "../src/hooks/paged";
import type { Page } from "../src/api/frontend-v1";
describe("private read isolation", () => {
  it("clears a prior account synchronously and aborts obsolete requests", async () => {
    const pending = new Map<
      string,
      { resolve: (v: string) => void; signal: AbortSignal }
    >();
    function View({ identity }: { identity: string }) {
      const r = useResource(
        identity,
        (signal) =>
          new Promise<string>((resolve) =>
            pending.set(identity, { resolve, signal }),
          ),
      );
      return <div>{r.data ?? "Loading " + identity}</div>;
    }
    const view = render(<View identity="wallet-a:account-a" />);
    await act(async () =>
      pending.get("wallet-a:account-a")!.resolve("Private A"),
    );
    expect(screen.getByText("Private A")).toBeVisible();
    view.rerender(<View identity="wallet-b:account-b" />);
    expect(screen.queryByText("Private A")).toBeNull();
    expect(pending.get("wallet-a:account-a")!.signal.aborted).toBe(true);
    await act(async () =>
      pending.get("wallet-b:account-b")!.resolve("Private B"),
    );
    expect(screen.getByText("Private B")).toBeVisible();
  });
  it("never applies a late response from an abandoned wallet scope", async () => {
    const pending = new Map<string, (v: string) => void>();
    function View({ id }: { id: string }) {
      const r = useResource(
        id,
        () => new Promise<string>((resolve) => pending.set(id, resolve)),
      );
      return <div>{r.data ?? "Loading"}</div>;
    }
    const view = render(<View id="a" />);
    view.rerender(<View id="b" />);
    await act(async () => pending.get("a")!("Old private data"));
    expect(screen.queryByText("Old private data")).toBeNull();
    await act(async () => pending.get("b")!("Current data"));
    expect(screen.getByText("Current data")).toBeVisible();
  });
  it("paginates using the server cursor and discards pages on wallet change", async () => {
    const load = vi.fn(async (after: string | null): Promise<Page<string>> => ({
      api_version: "1",
      rows: after ? ["a2"] : ["a1"],
      next_after: after ? null : "opaque-after",
      has_more: !after,
    }));
    function View({ identity }: { identity: string }) {
      const r = usePaged(identity, load);
      return (
        <>
          <p>{r.rows.join(",")}</p>
          <button onClick={r.more}>More</button>
        </>
      );
    }
    const view = render(<View identity="wallet-a" />);
    await screen.findByText("a1");
    await act(async () => screen.getByRole("button", { name: "More" }).click());
    await screen.findByText("a1,a2");
    expect(load.mock.calls[1][0]).toBe("opaque-after");
    view.rerender(<View identity="wallet-b" />);
    expect(screen.queryByText("a1,a2")).toBeNull();
  });
});

it("invalidates a delayed evidence continuation and cannot append its rows into a new generation", async () => {
  let finish!: (page: Page<string>) => void;
  let oldSignal: AbortSignal | undefined;
  function View({ generation }: { generation: number }) {
    const page = usePaged(`evidence:${generation}`, (after, signal) => {
      if (after) {
        oldSignal = signal;
        return new Promise<Page<string>>((resolve) => {
          finish = resolve;
        });
      }
      return Promise.resolve({
        api_version: "1" as const,
        rows: [`generation-${generation}`],
        next_after: generation === 1 ? "old-after" : null,
        has_more: generation === 1,
      });
    });
    return (
      <>
        <p>{page.rows.join(",")}</p>
        <button onClick={page.more}>More</button>
      </>
    );
  }
  const view = render(<View generation={1} />);
  await screen.findByText("generation-1");
  await act(async () => screen.getByRole("button", { name: "More" }).click());
  view.rerender(<View generation={2} />);
  expect(oldSignal?.aborted).toBe(true);
  expect(screen.queryByText("generation-1")).not.toBeInTheDocument();
  await screen.findByText("generation-2");
  await act(async () =>
    finish({
      api_version: "1",
      rows: ["old-late-evidence"],
      next_after: null,
      has_more: false,
    }),
  );
  expect(screen.getByText("generation-2")).toBeVisible();
  expect(screen.queryByText(/old-late-evidence/)).not.toBeInTheDocument();
});
