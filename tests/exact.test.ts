import { describe, it, expect } from "vitest";
import { fixed, usd, quantity, age, timestamp } from "../src/data/exact";
describe("exact financial and protocol values", () => {
  it("formats amounts beyond Number safe integer without losing micro dollars", () => {
    expect(usd("9007199254740993123456789", 6, 6)).toBe(
      "$9,007,199,254,740,993,123.456789",
    );
  });
  it("rounds half away from zero exactly and suppresses negative zero", () => {
    expect(usd("123455000")).toBe("$123.46");
    expect(usd("-123455000")).toBe("$−123.46");
    expect(usd("-1")).toBe("$0.00");
  });
  it("preserves e12, e18 and signed quantity values", () => {
    expect(fixed("67842500000000000000000", 18, 6)).toBe("67,842.500000");
    expect(usd("1", 12, 12)).toBe("$0.000000000001");
    expect(quantity("-2000001")).toBe("−2.000001");
    expect(quantity("10000000")).toBe("10");
    expect(quantity("0")).toBe("0");
  });
  it("distinguishes missing amounts and zero, signed ages and timestamps", () => {
    expect(usd(null)).toBe("—");
    expect(usd("0")).toBe("$0.00");
    expect(age("-1500000000")).toBe("−1.5 s");
    expect(timestamp("0")).toContain("Jan 1");
    expect(fixed("NaN", 6)).toBe("—");
  });
});
