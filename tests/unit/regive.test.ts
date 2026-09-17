import { beforeEach, describe, expect, it } from "vitest";
import { Regive } from "../../src/lib/regive";
import { RegiveOptions } from "../../src/lib/regive-options";

// The DAS methods under test are private. Bracket access via a structural
// type lets us exercise them without changing the public surface of Regive.
type RegiveInternals = {
  parseAmount(value: string | null | undefined): number;
  isRegiveAmountAllowed(amount: string | number): boolean;
  formatAskAmount(amount: string | undefined): string;
  processAmounts(options: RegiveOptions): void;
  getTheme(options: RegiveOptions): string;
};

// With no pageJson in the document the constructor exits immediately
// ("not a donation page"), so instances are cheap and side-effect free.
const createRegive = () => new Regive() as unknown as RegiveInternals;

let regive: RegiveInternals;

beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", window.location.origin);
  delete window.pageJson;
  localStorage.clear();
  regive = createRegive();
});

describe("parseAmount", () => {
  it("strips currency formatting", () => {
    expect(regive.parseAmount("$1,250.00")).toBe(1250);
    expect(regive.parseAmount("50")).toBe(50);
  });

  it("rejects unresolved merge tags, including URL-encoded braces", () => {
    expect(regive.parseAmount("{receipt_data~amount~[en1]}")).toBeNaN();
    expect(regive.parseAmount("%7Breceipt_data%7D")).toBeNaN();
  });

  it("returns NaN for empty, null, or undefined values", () => {
    expect(regive.parseAmount("")).toBeNaN();
    expect(regive.parseAmount(null)).toBeNaN();
    expect(regive.parseAmount(undefined)).toBeNaN();
  });
});

describe("isRegiveAmountAllowed", () => {
  it("accepts positive amounts up to and including the 100000 ceiling", () => {
    expect(regive.isRegiveAmountAllowed(5)).toBe(true);
    expect(regive.isRegiveAmountAllowed("5")).toBe(true);
    expect(regive.isRegiveAmountAllowed(100000)).toBe(true);
  });

  it("rejects zero, negative, non-numeric, and over-limit amounts", () => {
    expect(regive.isRegiveAmountAllowed(0)).toBe(false);
    expect(regive.isRegiveAmountAllowed(-1)).toBe(false);
    expect(regive.isRegiveAmountAllowed("abc")).toBe(false);
    expect(regive.isRegiveAmountAllowed(100000.01)).toBe(false);
    expect(regive.isRegiveAmountAllowed("100001")).toBe(false);
  });
});

describe("formatAskAmount", () => {
  it("formats whole-dollar amounts without cents", () => {
    expect(regive.formatAskAmount("5")).toBe("$5");
    expect(regive.formatAskAmount("5.00")).toBe("$5");
    expect(regive.formatAskAmount("1250")).toBe("$1,250");
  });

  it("includes cents only when non-zero", () => {
    expect(regive.formatAskAmount("5.01")).toBe("$5.01");
  });

  it("passes through non-numeric raw values", () => {
    expect(regive.formatAskAmount("abc")).toBe("abc");
    expect(regive.formatAskAmount(undefined)).toBe("");
  });
});

describe("processAmounts", () => {
  it("passes fixed amounts through verbatim - order, duplicates, and formatting", () => {
    const options: RegiveOptions = { amount: "5,10,5.00,5" };
    regive.processAmounts(options);
    expect(options.amount).toBe("5,10,5.00,5");
  });

  it("resolves percentage tokens against the gift-amount attribute", () => {
    const options: RegiveOptions = { giftAmount: "20", amount: "50%" };
    regive.processAmounts(options);
    expect(options.amount).toBe("10");
    expect(options.giftAmount).toBe("20");
  });

  it("falls back to the stored donation amount when no gift-amount attribute", () => {
    localStorage.setItem("regive-donation-amt", "40");
    const options: RegiveOptions = { amount: "50%" };
    regive.processAmounts(options);
    expect(options.amount).toBe("20");
    expect(options.giftAmount).toBe("40");
  });

  it("clamps percentage amounts to the minimum", () => {
    const options: RegiveOptions = {
      giftAmount: "20",
      minAmount: "15",
      amount: "50%",
    };
    regive.processAmounts(options);
    expect(options.amount).toBe("15");
  });

  it("rounds down to an on-step value when a round-up would exceed the maximum", () => {
    // Gift 200 hits the 50:5 tier; 50% = 100, capped at 60
    const options: RegiveOptions = {
      giftAmount: "200",
      maxAmount: "60",
      amount: "50%",
    };
    regive.processAmounts(options);
    expect(options.amount).toBe("60");
  });

  it("ignores the maximum when the minimum is greater", () => {
    const options: RegiveOptions = {
      giftAmount: "20",
      minAmount: "50",
      maxAmount: "10",
      amount: "100%",
    };
    regive.processAmounts(options);
    expect(options.amount).toBe("50");
  });

  it("rounds up by the gift's tier - default 0:1,50:5", () => {
    // Gift 50 hits the increment-5 tier: 33% = 16.5 rounds up to 20
    const atTier: RegiveOptions = { giftAmount: "50", amount: "33%" };
    regive.processAmounts(atTier);
    expect(atTier.amount).toBe("20");
    // Gift 49.99 stays on the increment-1 tier: 33% = 16.4967 rounds up to 17
    const belowTier: RegiveOptions = { giftAmount: "49.99", amount: "33%" };
    regive.processAmounts(belowTier);
    expect(belowTier.amount).toBe("17");
  });

  it("honors custom rounding tiers", () => {
    const options: RegiveOptions = {
      giftAmount: "30",
      roundingTiers: "0:10",
      amount: "50%",
    };
    regive.processAmounts(options);
    expect(options.amount).toBe("20");
  });

  it("skips invalid rounding tiers", () => {
    const options: RegiveOptions = {
      giftAmount: "30",
      roundingTiers: "junk,0:10",
      amount: "50%",
    };
    regive.processAmounts(options);
    expect(options.amount).toBe("20");
  });

  it("dedupes percentage results against fixed amounts numerically", () => {
    const options: RegiveOptions = { giftAmount: "20", amount: "10,50%" };
    regive.processAmounts(options);
    expect(options.amount).toBe("10");
  });

  it("dedupes percentage results against each other", () => {
    const options: RegiveOptions = {
      giftAmount: "20",
      amount: "50%,25%,25%",
    };
    regive.processAmounts(options);
    expect(options.amount).toBe("10,5");
  });

  it("skips percentage tokens when the gift is unavailable and no minimum is set", () => {
    const options: RegiveOptions = { amount: "50%,5" };
    regive.processAmounts(options);
    expect(options.amount).toBe("5");
  });

  it("uses the minimum amount as the gift when the gift is unavailable", () => {
    const options: RegiveOptions = { minAmount: "7", amount: "50%" };
    regive.processAmounts(options);
    expect(options.amount).toBe("7");
  });

  it("previews with a $50 gift in test mode when no gift is available", () => {
    const options: RegiveOptions = { test: true, amount: "50%" };
    regive.processAmounts(options);
    expect(options.amount).toBe("25");
    expect(options.giftAmount).toBe("50");
  });

  it("previews the fallback state in test mode when a minimum is set", () => {
    const options: RegiveOptions = {
      test: true,
      minAmount: "3",
      amount: "50%",
    };
    regive.processAmounts(options);
    expect(options.amount).toBe("3");
  });

  it("treats gifts over the 100000 sanity ceiling as unavailable", () => {
    const options: RegiveOptions = { giftAmount: "150000", amount: "50%,5" };
    regive.processAmounts(options);
    expect(options.amount).toBe("5");
  });

  it("skips fixed tokens over the regive ceiling but allows exactly 100000", () => {
    const over: RegiveOptions = { amount: "150000,25" };
    regive.processAmounts(over);
    expect(over.amount).toBe("25");
    const atCeiling: RegiveOptions = { amount: "100000" };
    regive.processAmounts(atCeiling);
    expect(atCeiling.amount).toBe("100000");
  });

  it("skips percentage results over the regive ceiling", () => {
    const options: RegiveOptions = { giftAmount: "100000", amount: "200%,5" };
    regive.processAmounts(options);
    expect(options.amount).toBe("5");
  });

  it("skips invalid tokens - non-numeric, zero, negative", () => {
    const options: RegiveOptions = { amount: "abc,0,-5,10" };
    regive.processAmounts(options);
    expect(options.amount).toBe("10");
  });

  it("deletes the amount when every token is skipped so the default applies", () => {
    const options: RegiveOptions = { amount: "50%" };
    regive.processAmounts(options);
    expect(options.amount).toBeUndefined();
  });

  it("deletes an empty amount and still normalizes the gift amount", () => {
    const options: RegiveOptions = { giftAmount: "$1,250.00", amount: "  " };
    regive.processAmounts(options);
    expect(options.amount).toBeUndefined();
    expect(options.giftAmount).toBe("1250");
  });

  it("normalizes the gift amount even with no amount attribute", () => {
    const options: RegiveOptions = { giftAmount: "$1,250.00" };
    regive.processAmounts(options);
    expect(options.giftAmount).toBe("1250");
    expect(options.amount).toBeUndefined();
  });
});

describe("getTheme", () => {
  it("applies the highest satisfied threshold", () => {
    const options: RegiveOptions = {
      giftAmount: "600",
      themeRules: "100:big,500:bigger",
    };
    expect(regive.getTheme(options)).toBe("bigger");
  });

  it("applies the theme at the exact threshold", () => {
    const options: RegiveOptions = {
      giftAmount: "100",
      themeRules: "100:big",
    };
    expect(regive.getTheme(options)).toBe("big");
  });

  it("falls back to the theme attribute when no threshold is met", () => {
    const options: RegiveOptions = {
      giftAmount: "99",
      theme: "button-top",
      themeRules: "100:big",
    };
    expect(regive.getTheme(options)).toBe("button-top");
  });

  it("falls back to stacked with no theme and no satisfied rule", () => {
    const options: RegiveOptions = { giftAmount: "99", themeRules: "100:big" };
    expect(regive.getTheme(options)).toBe("stacked");
  });

  it("ignores theme rules when the gift amount is unavailable", () => {
    const options: RegiveOptions = {
      theme: "button-left",
      themeRules: "100:big",
    };
    expect(regive.getTheme(options)).toBe("button-left");
  });

  it("ignores theme rules when the gift exceeds the sanity ceiling", () => {
    const options: RegiveOptions = {
      giftAmount: "100001",
      theme: "button-left",
      themeRules: "100:big",
    };
    expect(regive.getTheme(options)).toBe("button-left");
  });

  it("skips invalid rules and still applies valid ones", () => {
    const options: RegiveOptions = {
      giftAmount: "150",
      themeRules: "abc:broken,100:big",
    };
    expect(regive.getTheme(options)).toBe("big");
  });
});
