import { beforeEach, describe, expect, it } from "vitest";
import { ENGrid } from "../../src/lib/engrid";

const setUrl = (search: string) => {
  window.history.replaceState({}, "", `${window.location.origin}/${search}`);
};

const setPageJson = (pageJson: Record<string, unknown> | undefined) => {
  if (pageJson) {
    window.pageJson = pageJson as typeof window.pageJson;
  } else {
    delete window.pageJson;
  }
};

const enForm = (innerHtml: string) => {
  document.body.innerHTML = `<form class="en__component">${innerHtml}</form>`;
};

beforeEach(() => {
  document.body.innerHTML = "";
  setUrl("");
  setPageJson(undefined);
});

describe("getUrlParameter", () => {
  it("returns the value of a parameter", () => {
    setUrl("?foo=bar");
    expect(ENGrid.getUrlParameter("foo")).toBe("bar");
  });

  it("returns true for a parameter without a value", () => {
    setUrl("?chain");
    expect(ENGrid.getUrlParameter("chain")).toBe(true);
  });

  it("returns null for a missing parameter", () => {
    setUrl("?foo=bar");
    expect(ENGrid.getUrlParameter("baz")).toBeNull();
  });

  it("returns an array of key/value objects for names ending in []", () => {
    setUrl("?test1=a&test2=b&other=c");
    expect(ENGrid.getUrlParameter("test[]")).toEqual([
      { test1: "a" },
      { test2: "b" },
    ]);
  });

  it("returns null for [] names with no matching parameters", () => {
    setUrl("?foo=bar");
    expect(ENGrid.getUrlParameter("test[]")).toBeNull();
  });
});

describe("page detection", () => {
  it("reads page numbers and IDs from window.pageJson", () => {
    setPageJson({
      pageNumber: 2,
      pageCount: 2,
      campaignPageId: 12345,
      clientId: 678,
    });
    expect(ENGrid.getPageNumber()).toBe(2);
    expect(ENGrid.getPageCount()).toBe(2);
    expect(ENGrid.isThankYouPage()).toBe(true);
    expect(ENGrid.getPageID()).toBe(12345);
    expect(ENGrid.getClientID()).toBe(678);
  });

  it("returns 0s when window.pageJson is absent", () => {
    expect(ENGrid.getPageNumber()).toBe(0);
    expect(ENGrid.getPageCount()).toBe(0);
    // Quirk: with no pageJson, pageNumber and pageCount are both 0, so this
    // is true. Regive is guarded because it checks isDonationPage() first.
    expect(ENGrid.isThankYouPage()).toBe(true);
    expect(ENGrid.getPageID()).toBe(0);
    expect(ENGrid.getClientID()).toBe(0);
  });

  it("isThankYouPage is false on the first of two pages", () => {
    setPageJson({ pageNumber: 1, pageCount: 2 });
    expect(ENGrid.isThankYouPage()).toBe(false);
  });
});

describe("getPageType", () => {
  it.each([
    ["donation", "DONATION"],
    ["premiumgift", "DONATION"],
    ["p2pdonation", "DONATION"],
    ["e-card", "ECARD"],
    ["survey", "SURVEY"],
    ["emailtotarget", "EMAILTOTARGET"],
    ["event", "EVENT"],
    ["made-up-type", "UNKNOWN"],
  ])("maps %s to %s", (pageType, expected) => {
    setPageJson({ pageType });
    expect(ENGrid.getPageType()).toBe(expected);
  });

  it("returns UNKNOWN when window.pageJson is absent", () => {
    expect(ENGrid.getPageType()).toBe("UNKNOWN");
  });
});

describe("checkNested", () => {
  it("returns true when the full path exists", () => {
    expect(ENGrid.checkNested({ a: { b: { c: 1 } } }, "a", "b", "c")).toBe(true);
  });

  it("returns false when an intermediate key is missing", () => {
    expect(ENGrid.checkNested({ a: {} }, "a", "b", "c")).toBe(false);
  });

  it("returns false for a nullish root object", () => {
    expect(ENGrid.checkNested(undefined, "a")).toBe(false);
  });
});

describe("deepMerge", () => {
  it("merges nested objects while preserving existing keys", () => {
    const target = { a: { x: 1 } };
    const result = ENGrid.deepMerge(target, { a: { y: 2 }, b: 3 });
    expect(result).toEqual({ a: { x: 1, y: 2 }, b: 3 });
  });
});

describe("currency", () => {
  it("prefers the data-currency-symbol attribute of the selected option", () => {
    enForm(`
      <select name="transaction.paycurrency">
        <option value="EUR" data-currency-symbol="€">EUR</option>
      </select>
    `);
    expect(ENGrid.getCurrencySymbol()).toBe("€");
    expect(ENGrid.getCurrencyCode()).toBe("EUR");
  });

  it("falls back to the built-in currency map", () => {
    enForm(`
      <select name="transaction.paycurrency">
        <option value="GBP">GBP</option>
      </select>
    `);
    expect(ENGrid.getCurrencySymbol()).toBe("£");
    expect(ENGrid.getCurrencyCode()).toBe("GBP");
  });

  it("defaults to $ and USD when the currency field is absent", () => {
    expect(ENGrid.getCurrencySymbol()).toBe("$");
    expect(ENGrid.getCurrencyCode()).toBe("USD");
  });

  it("defaults to $ for an unknown currency value", () => {
    enForm(`
      <select name="transaction.paycurrency">
        <option value="XXX">XXX</option>
      </select>
    `);
    expect(ENGrid.getCurrencySymbol()).toBe("$");
  });
});

describe("getFieldValue / setFieldValue", () => {
  it("sets and reads a text input", () => {
    enForm(`<input type="text" name="supporter.firstName" value="">`);
    ENGrid.setFieldValue("supporter.firstName", "Ada");
    expect(ENGrid.getFieldValue("supporter.firstName")).toBe("Ada");
  });

  it("selects the matching option of a select field", () => {
    enForm(`
      <select name="supporter.country">
        <option value="us">US</option>
        <option value="gb">GB</option>
      </select>
    `);
    ENGrid.setFieldValue("supporter.country", "gb");
    const select = ENGrid.getField("supporter.country") as HTMLSelectElement;
    expect(select.value).toBe("gb");
  });

  it("checks the matching radio input", () => {
    enForm(`
      <input type="radio" name="transaction.paymenttype" value="card">
      <input type="radio" name="transaction.paymenttype" value="paypal">
    `);
    ENGrid.setFieldValue("transaction.paymenttype", "paypal");
    const paypal = document.querySelector(
      'input[name="transaction.paymenttype"][value="paypal"]'
    ) as HTMLInputElement;
    expect(paypal.checked).toBe(true);
  });

  it("dispatches change events when dispatchEvents is true", () => {
    enForm(`<input type="text" name="supporter.firstName" value="">`);
    const field = ENGrid.getField("supporter.firstName") as HTMLInputElement;
    let events = 0;
    field.addEventListener("change", () => events++);
    ENGrid.setFieldValue("supporter.firstName", "Ada", true);
    expect(events).toBe(1);
  });

  it("does nothing when the value is unchanged", () => {
    enForm(`<input type="text" name="supporter.firstName" value="Ada">`);
    const field = ENGrid.getField("supporter.firstName") as HTMLInputElement;
    let events = 0;
    field.addEventListener("change", () => events++);
    ENGrid.setFieldValue("supporter.firstName", "Ada", true);
    expect(field.getAttribute("engrid-value-changed")).toBeNull();
    expect(events).toBe(0);
  });

  it("joins multiple checked values with a comma", () => {
    enForm(`
      <input type="checkbox" name="supporter.topics" value="a" checked>
      <input type="checkbox" name="supporter.topics" value="b" checked>
      <input type="checkbox" name="supporter.topics" value="c">
    `);
    expect(ENGrid.getFieldValue("supporter.topics")).toBe("a,b");
  });
});

describe("body data attributes", () => {
  it("sets, reads and checks data-regive-* attributes", () => {
    ENGrid.setBodyData("enabled", "true");
    expect(ENGrid.getBodyData("enabled")).toBe("true");
    expect(ENGrid.hasBodyData("enabled")).toBe(true);
  });

  it("removes the attribute when the value is boolean false", () => {
    ENGrid.setBodyData("enabled", "true");
    ENGrid.setBodyData("enabled", false);
    expect(ENGrid.hasBodyData("enabled")).toBe(false);
    expect(ENGrid.getBodyData("enabled")).toBeNull();
  });
});

describe("setAmount", () => {
  it("does nothing when there is no donation amount field", () => {
    enForm(`<input type="text" name="supporter.firstName">`);
    expect(() => ENGrid.setAmount(10)).not.toThrow();
  });

  it("checks the radio matching the amount", () => {
    enForm(`
      <input type="radio" name="transaction.donationAmt" value="5">
      <input type="radio" name="transaction.donationAmt" value="10">
    `);
    ENGrid.setAmount(10);
    const ten = document.querySelector(
      'input[name="transaction.donationAmt"][value="10"]'
    ) as HTMLInputElement;
    const five = document.querySelector(
      'input[name="transaction.donationAmt"][value="5"]'
    ) as HTMLInputElement;
    expect(ten.checked).toBe(true);
    expect(five.checked).toBe(false);
  });

  it("fills the other amount field when no radio matches", () => {
    enForm(`
      <input type="radio" name="transaction.donationAmt" value="5">
      <input type="text" name="transaction.donationAmt.other">
    `);
    ENGrid.setAmount(25);
    const other = document.querySelector(
      'input[name="transaction.donationAmt.other"]'
    ) as HTMLInputElement;
    expect(other.value).toBe("25.00");
  });
});

describe("setPaymentType", () => {
  it("creates a hidden input when no payment type field exists", () => {
    enForm(`<input type="text" name="supporter.firstName">`);
    ENGrid.setPaymentType("card");
    const field = ENGrid.getField(
      "transaction.paymenttype"
    ) as HTMLInputElement;
    expect(field).not.toBeNull();
    expect(field.type).toBe("hidden");
    expect(field.value).toBe("card");
  });

  it("checks the matching radio and dispatches change", () => {
    enForm(`
      <input type="radio" name="transaction.paymenttype" value="card">
      <input type="radio" name="transaction.paymenttype" value="paypal">
    `);
    const card = document.querySelector(
      'input[name="transaction.paymenttype"][value="card"]'
    ) as HTMLInputElement;
    let events = 0;
    card.addEventListener("change", () => events++);
    ENGrid.setPaymentType("card");
    expect(card.checked).toBe(true);
    expect(events).toBe(1);
  });

  it("treats visa and vi as aliases for card", () => {
    enForm(`
      <input type="radio" name="transaction.paymenttype" value="visa">
      <input type="radio" name="transaction.paymenttype" value="paypal">
    `);
    ENGrid.setPaymentType("card");
    const visa = document.querySelector(
      'input[name="transaction.paymenttype"][value="visa"]'
    ) as HTMLInputElement;
    expect(visa.checked).toBe(true);
  });

  it("selects the matching option of a select field", () => {
    enForm(`
      <select name="transaction.paymenttype">
        <option value="VI">Visa</option>
        <option value="paypal">PayPal</option>
      </select>
    `);
    ENGrid.setPaymentType("card");
    const select = ENGrid.getField(
      "transaction.paymenttype"
    ) as HTMLSelectElement;
    expect(select.value).toBe("VI");
  });
});
