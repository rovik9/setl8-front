import { it, expect } from "vitest";
import {
  accountContext,
  initialAccount,
  isAgedRead,
  recordedStatus,
} from "../src/data/accountPresentation";
import { demoAccount } from "../src/data/demo";
it("configuration remains distinct from current balance/phase", () => {
  const overview = demoAccount().overview;
  overview.initial_config = {
    params: { size_micro: "9007199254740993000", phase: "2" },
  };
  overview.evaluator_state = null;
  expect(accountContext(overview)).toEqual({
    size: "9007199254740993000",
    phase: "2",
    initial: true,
  });
  expect(overview.evaluator_state).toBeNull();
  expect(recordedStatus(null)).toBe("Awaiting state");
});
it("committed zero capital is preserved, never replaced with configuration", () => {
  const o = demoAccount().overview;
  o.initial_config = { params: { size_micro: "1000000", phase: "3" } };
  o.evaluator_state!.size_micro = "0";
  o.evaluator_state!.phase = "1";
  expect(accountContext(o)).toEqual({ size: "0", phase: "1", initial: false });
});
it("opaque or malformed config does not acquire financial meaning", () => {
  for (const config of [
    null,
    "bad",
    [],
    { params: [] },
    { params: { size_micro: 3, phase: "NaN" } },
    { params: { size_micro: "1.5", phase: "1e2" } },
  ])
    expect(initialAccount(config as never)).toEqual({
      size: undefined,
      phase: undefined,
    });
});
it("recorded terminal flags are displayed without guessing eligibility", () => {
  const s = demoAccount().overview.evaluator_state!;
  expect(recordedStatus(s)).toBe("Active");
  s.frozen = true;
  expect(recordedStatus(s)).toBe("Active · Frozen");
  s.ended = true;
  expect(recordedStatus(s)).toBe("Active · Frozen · Ended");
  s.status = "Failed";
  expect(recordedStatus(s)).toBe("Failed · Frozen · Ended");
});
it("read-age comparison retains ns precision and does not use the synthetic clock", () => {
  expect(isAgedRead("0", 60000)).toBe(false);
  expect(isAgedRead("0", 60001)).toBe(true);
  expect(isAgedRead("999999999999999999999", 60001)).toBe(false);
  expect(isAgedRead("invalid", 60001)).toBe(false);
});
