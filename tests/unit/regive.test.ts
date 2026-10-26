import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Regive } from "../../src/lib/regive";
import { RegiveOptions } from "../../src/lib/regive-options";

// The DAS methods under test are private. Bracket access via a structural
// type lets us exercise them without changing the public surface of Regive.
type RegiveInternals = {
  options: RegiveOptions | undefined;
  parseAmount(value: string | null | undefined): number;
  isRegiveAmountAllowed(amount: string | number): boolean;
  formatAskAmount(amount: string | undefined): string;
  processAmounts(options: RegiveOptions): void;
  getTheme(options: RegiveOptions): string;
  setPaymentMethod(paymentMethod: string): boolean;
  addCustomBanner(paymentMethod: string): void;
  waitForDigitalWalletUI(
    onReady: (wrapper: HTMLElement) => void,
    onTimeout?: () => void
  ): void;
  log(message: string, emoji?: string, data?: unknown): void;
  overrideCaptchaCallbacks(
    captcha: HTMLElement,
    captchaDeadline: number
  ): void;
  exit(): void;
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

describe("setPaymentMethod", () => {
  beforeEach(() => {
    regive.options = { amount: "5", digitalWallets: true };
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const renderForm = (paymentFields: string) => {
    document.body.innerHTML = `
      <form class="en__component">
        ${paymentFields}
        <input type="radio" name="transaction.donationAmt" value="5">
      </form>
    `;
  };

  it("preserves a card brand in paymenttype and selects Card in giveBySelect", () => {
    renderForm(`
      <select name="transaction.paymenttype">
        <option value="">Select payment type</option>
        <option value="VI">Visa</option>
        <option value="MC">Mastercard</option>
      </select>
      <input type="radio" name="transaction.giveBySelect" value="Card" checked>
      <input type="radio" name="transaction.giveBySelect" value="stripedigitalwallet">
    `);

    expect(regive.setPaymentMethod("VI")).toBe(true);
    expect(
      (document.querySelector('[name="transaction.paymenttype"]') as HTMLSelectElement)
        .value
    ).toBe("VI");
    expect(
      (document.querySelector('[name="transaction.giveBySelect"]:checked') as HTMLInputElement)
        .value
    ).toBe("Card");
  });

  it("normalizes wallet aliases and dispatches changes only after both writes", () => {
    renderForm(`
      <select name="transaction.paymenttype">
        <option value="">Select payment type</option>
        <option value="stripedigitalwallet">Apple Pay / Google Pay</option>
      </select>
      <input type="radio" name="transaction.giveBySelect" value="Card" checked>
      <input type="radio" name="transaction.giveBySelect" value="stripedigitalwallet">
    `);
    const select = document.querySelector(
      '[name="transaction.paymenttype"]'
    ) as HTMLSelectElement;
    const walletRadio = document.querySelector(
      '[name="transaction.giveBySelect"][value="stripedigitalwallet"]'
    ) as HTMLInputElement;
    const changeSnapshots: Array<[string, string, boolean]> = [];
    const recordChange = (field: string) => {
      changeSnapshots.push([field, select.value, walletRadio.checked]);
    };
    select.addEventListener("change", () => recordChange("paymenttype"));
    walletRadio.addEventListener("change", () => recordChange("giveBySelect"));

    expect(regive.setPaymentMethod("applepay")).toBe(true);
    expect(select.value).toBe("stripedigitalwallet");
    expect(walletRadio.checked).toBe(true);
    expect(changeSnapshots).toEqual([
      ["paymenttype", "stripedigitalwallet", true],
      ["giveBySelect", "stripedigitalwallet", true],
    ]);
  });

  it("ignores payment fields that are not present", () => {
    renderForm("");

    expect(regive.setPaymentMethod("card")).toBe(true);
    expect(document.querySelector('[name="transaction.paymenttype"]')).toBeNull();
    expect(document.querySelector('[name="transaction.giveBySelect"]')).toBeNull();
  });

  it("rejects a missing select option without dispatching changes", () => {
    renderForm(`
      <select name="transaction.paymenttype">
        <option value="">Select payment type</option>
        <option value="VI">Visa</option>
      </select>
    `);
    const select = document.querySelector(
      '[name="transaction.paymenttype"]'
    ) as HTMLSelectElement;
    const change = vi.fn();
    const log = vi.spyOn(regive, "log");
    select.addEventListener("change", change);

    expect(regive.setPaymentMethod("stripedigitalwallet")).toBe(false);
    expect(select.value).toBe("");
    expect(change).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("transaction.paymenttype"),
      "🔴",
      expect.objectContaining({ requiredValue: "stripedigitalwallet" })
    );
  });

  it("does not guess a card brand for a generic card payment", () => {
    renderForm(`
      <select name="transaction.paymenttype">
        <option value="">Select payment type</option>
        <option value="VI">Visa</option>
        <option value="MC">Mastercard</option>
      </select>
    `);

    expect(regive.setPaymentMethod("card")).toBe(false);
    expect(
      (document.querySelector('[name="transaction.paymenttype"]') as HTMLSelectElement)
        .value
    ).toBe("");
  });

  it("exits before banner or wallet setup when giveBySelect has no match", () => {
    renderForm(`
      <select name="transaction.paymenttype">
        <option value="">Select payment type</option>
        <option value="stripedigitalwallet">Apple Pay / Google Pay</option>
      </select>
      <input type="radio" name="transaction.giveBySelect" value="Card" checked>
    `);
    const exit = vi.spyOn(regive, "exit").mockImplementation(() => {});
    const waitForWallet = vi
      .spyOn(regive, "waitForDigitalWalletUI")
      .mockImplementation(() => {});

    regive.addCustomBanner("stripedigitalwallet");

    expect(exit).toHaveBeenCalledTimes(1);
    expect(waitForWallet).not.toHaveBeenCalled();
    expect(document.querySelector(".regive-embed")).toBeNull();
  });

  it("sets both payment fields before digital wallet initialization", () => {
    renderForm(`
      <select name="transaction.paymenttype">
        <option value="">Select payment type</option>
        <option value="stripedigitalwallet">Apple Pay / Google Pay</option>
      </select>
      <input type="radio" name="transaction.giveBySelect" value="Card" checked>
      <input type="radio" name="transaction.giveBySelect" value="stripedigitalwallet">
    `);
    const select = document.querySelector(
      '[name="transaction.paymenttype"]'
    ) as HTMLSelectElement;
    const walletRadio = document.querySelector(
      '[name="transaction.giveBySelect"][value="stripedigitalwallet"]'
    ) as HTMLInputElement;
    const waitForWallet = vi
      .spyOn(regive, "waitForDigitalWalletUI")
      .mockImplementation(() => {
        expect(select.value).toBe("stripedigitalwallet");
        expect(walletRadio.checked).toBe(true);
      });

    regive.addCustomBanner("googlepay");

    expect(waitForWallet).toHaveBeenCalledTimes(1);
  });

  it("makes the single wallet amount hide important so themes cannot override it", () => {
    renderForm("");
    vi.spyOn(regive, "waitForDigitalWalletUI").mockImplementation(() => {});

    regive.addCustomBanner("stripedigitalwallet");

    const amountsWrapper = document.querySelector(
      ".regive-amounts"
    ) as HTMLElement;
    expect(amountsWrapper.style.getPropertyValue("display")).toBe("none");
    expect(amountsWrapper.style.getPropertyPriority("display")).toBe(
      "important"
    );
  });

  it("restores the wallet payment method after ENgrid falls back to a card", () => {
    renderForm(`
      <select name="transaction.paymenttype">
        <option value="VI" selected>Visa</option>
        <option value="stripedigitalwallet">Apple Pay / Google Pay</option>
      </select>
      <input type="radio" name="transaction.giveBySelect" value="Card" checked>
      <input type="radio" name="transaction.giveBySelect" value="stripedigitalwallet">
      <div id="en__digitalWallet"><iframe></iframe></div>
    `);
    const select = document.querySelector(
      '[name="transaction.paymenttype"]'
    ) as HTMLSelectElement;
    const cardRadio = document.querySelector(
      '[name="transaction.giveBySelect"][value="Card"]'
    ) as HTMLInputElement;
    const walletRadio = document.querySelector(
      '[name="transaction.giveBySelect"][value="stripedigitalwallet"]'
    ) as HTMLInputElement;
    const walletWrapper = document.getElementById(
      "en__digitalWallet"
    ) as HTMLElement;
    vi.spyOn(regive, "waitForDigitalWalletUI").mockImplementation((onReady) => {
      // ENgrid's DigitalWallets loading fallback selects Card when the Stripe
      // UI is not populated yet; this select resolves that fallback to VI.
      select.value = "VI";
      cardRadio.checked = true;
      onReady(walletWrapper);
    });

    regive.addCustomBanner("stripedigitalwallet");

    expect(select.value).toBe("stripedigitalwallet");
    expect(walletRadio.checked).toBe(true);
  });
});

describe("overrideCaptchaCallbacks", () => {
  const captchaWindow = window as typeof window & {
    delayedCaptchaCallback?: (token: string) => void;
  };
  let captcha: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="en__captcha"><div class="g-recaptcha"></div></div>
      <button class="regive-amount-btn" disabled></button>
    `;
    captcha = document.querySelector(".en__captcha") as HTMLElement;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete captchaWindow.delayedCaptchaCallback;
  });

  it("wraps a data-callback attribute that appears after initialization", async () => {
    const original = vi.fn((_: string) => undefined);
    captchaWindow.delayedCaptchaCallback = original;
    const exit = vi.spyOn(regive, "exit").mockImplementation(() => {});

    regive.overrideCaptchaCallbacks(captcha, Date.now() + 5000);

    expect(exit).not.toHaveBeenCalled();
    document
      .querySelector(".g-recaptcha")
      ?.setAttribute("data-callback", "delayedCaptchaCallback");
    await vi.advanceTimersByTimeAsync(0);

    const wrapped = captchaWindow.delayedCaptchaCallback;
    expect(wrapped).toEqual(expect.any(Function));
    expect(wrapped).not.toBe(original);
    wrapped?.("token");
    expect(original).toHaveBeenCalledWith("token");
    expect(
      (document.querySelector(".regive-amount-btn") as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it("waits for the named global callback function to appear", async () => {
    const original = vi.fn((_: string) => undefined);
    const exit = vi.spyOn(regive, "exit").mockImplementation(() => {});
    document
      .querySelector(".g-recaptcha")
      ?.setAttribute("data-callback", "delayedCaptchaCallback");

    regive.overrideCaptchaCallbacks(captcha, Date.now() + 5000);

    expect(exit).not.toHaveBeenCalled();
    captchaWindow.delayedCaptchaCallback = original;
    await vi.advanceTimersByTimeAsync(100);

    expect(captchaWindow.delayedCaptchaCallback).not.toBe(original);
    captchaWindow.delayedCaptchaCallback?.("token");
    expect(original).toHaveBeenCalledWith("token");
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits after five seconds if the callback never becomes usable", async () => {
    const exit = vi.spyOn(regive, "exit").mockImplementation(() => {});

    regive.overrideCaptchaCallbacks(captcha, Date.now() + 5000);

    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("uses only the remaining time from the shared CAPTCHA deadline", async () => {
    const exit = vi.spyOn(regive, "exit").mockImplementation(() => {});
    const captchaDeadline = Date.now() + 5000;

    // Simulate the captcha wrapper taking three seconds to appear.
    await vi.advanceTimersByTimeAsync(3000);
    regive.overrideCaptchaCallbacks(captcha, captchaDeadline);

    await vi.advanceTimersByTimeAsync(1999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
