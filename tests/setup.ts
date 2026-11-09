import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
// Tests never see the operator's private RPC URL from .env.local; they run on the two public operators.
vi.stubEnv("VITE_DEVNET_RPC_URL", "");
afterEach(cleanup);
