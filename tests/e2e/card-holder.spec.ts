import { expect, test } from "@playwright/test";

// The fixture pays through a single "CC" payment type radio, and its mandatory
// card holder name stays hidden and disabled until that radio is checked -
// the layout where the chained page reveals an empty name field.

const getStored = (page: import("@playwright/test").Page, key: string) =>
  page.evaluate((k) => localStorage.getItem(k), key);

test("captures the CC payment type and the card holder name on page 1", async ({
  page,
}) => {
  await page.goto("/page/12345/cardholder/1");

  await page.locator('input[name="transaction.paymenttype"]').check();
  await page
    .locator('input[name="supporter.creditCardHolderName"]')
    .fill("Ada Lovelace");

  // Simulate VGS writing a token, which triggers the mutation observer
  await page.evaluate(() => {
    document
      .querySelector('input[name="transaction.ccnumber"]')
      ?.setAttribute("value", "tok_cc_123");
  });

  await expect.poll(() => getStored(page, "regive-num")).toBe("tok_cc_123");
  await expect.poll(() => getStored(page, "regive-paymenttype")).toBe("CC");
  await expect.poll(() => getStored(page, "regive-cardholder")).toBe(
    "Ada Lovelace"
  );
});

test.describe("chained page", () => {
  // Seed VGS tokens as if the donor had just paid with the "CC" radio
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem("regive-num", "tok_cc_123");
      localStorage.setItem("regive-ver", "tok_cv_456");
      localStorage.setItem("regive-exp", "0130");
      localStorage.setItem("regive-card", "visa");
      localStorage.setItem("regive-paymenttype", "CC");
    });
  });

  test("restores the card holder name and submits with the CC payment type", async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      localStorage.setItem("regive-cardholder", "Ada Lovelace");
    });
    await page.goto("/page/12345/cardholder/2");

    const frame = page.frameLocator("iframe.regive-iframe");
    await expect(frame.locator(".regive-amount-btn")).toHaveCount(2);
    await frame.locator('.regive-amount-btn[data-amount="5"]').click();

    const echo = frame.locator("#echo");
    await expect(echo).toBeAttached();
    await expect(echo).toContainText("transaction.paymenttype=CC");
    await expect(echo).toContainText(
      "supporter.creditCardHolderName=Ada+Lovelace"
    );
    await expect(echo).toContainText("transaction.ccnumber=tok_cc_123");
  });

  test("exits instead of submitting when no card holder name was captured", async ({
    page,
  }) => {
    await page.goto("/page/12345/cardholder/2");

    const frame = page.frameLocator("iframe.regive-iframe");
    const button = frame.locator('.regive-amount-btn[data-amount="5"]');
    await expect(button).toBeAttached();
    await button.click();

    // Checking the "CC" radio revealed the mandatory name field, which is
    // still empty, so the child exits rather than submitting
    await expect(page.locator(".regive-container")).toHaveCount(0);
    await expect(page.locator("iframe.regive-iframe")).toHaveCount(0);
  });
});
