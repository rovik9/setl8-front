import { describe, it, expect } from "vitest";
import {
  TIERS,
  feeUsd,
  totalUsd,
  feeMicro,
  totalMicro,
  formatMicro,
  sizeLabel,
  tierByIndex,
} from "../src/buy/tiers";

describe("buy tiers", () => {
  it("has ten tiers indexed 0..9", () => {
    expect(TIERS).toHaveLength(10);
    expect(TIERS.map((t) => t.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it("tier 0 totals 30.12", () => {
    expect(feeUsd(30)).toBe("0.12");
    expect(totalUsd(30)).toBe("30.12");
    expect(tierByIndex(0)!.totalMicro).toBe(30_120_000n);
  });
  it("tier 9 totals 1,605.396", () => {
    expect(feeUsd(1599)).toBe("6.396");
    expect(totalUsd(1599)).toBe("1,605.396");
    expect(tierByIndex(9)!.totalMicro).toBe(1_605_396_000n);
  });
  it("rounds the fee up, never down", () => {
    expect(feeMicro(1n)).toBe(1n); // 0.004 micro rounds up to 1
    expect(feeMicro(2_500n)).toBe(10n); // exact: 2500*40/10000
    expect(feeMicro(2_501n)).toBe(11n); // 10.004 rounds up
    expect(totalMicro(2_501n)).toBe(2_512n);
  });
  it("sizes strictly increase and prices strictly increase", () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].accountSizeUsd).toBeGreaterThan(
        TIERS[i - 1].accountSizeUsd,
      );
      expect(TIERS[i].priceUsd).toBeGreaterThan(TIERS[i - 1].priceUsd);
    }
    expect(TIERS[0].accountSizeUsd).toBe(2500);
    expect(TIERS[9].accountSizeUsd).toBe(200000);
  });
  it("formats without floats and labels sizes", () => {
    expect(formatMicro(0n)).toBe("0.00");
    expect(formatMicro(1_000_000n, false)).toBe("1.00");
    expect(formatMicro(1_234_567_890n)).toBe("1,234.56789");
    expect(sizeLabel(2500)).toBe("$2.5K");
    expect(sizeLabel(10000)).toBe("$10K");
    expect(sizeLabel(200000)).toBe("$200K");
  });
  it("rejects fractional or negative prices", () => {
    expect(() => feeUsd(1.5)).toThrow(RangeError);
    expect(() => totalUsd(-1)).toThrow(RangeError);
  });
});
