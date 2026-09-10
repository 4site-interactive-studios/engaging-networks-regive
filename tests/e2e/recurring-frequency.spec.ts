import { expect, test } from "@playwright/test";

// Seed VGS tokens so the embedded donation page inside the iframe attempts to
// render the regive banner instead of exiting for missing tokens.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("regive-num", "tok_cc_123");
    localStorage.setItem("regive-ver", "tok_cv_456");
    localStorage.setItem("regive-exp", "0130");
    localStorage.setItem("regive-card", "visa");
    localStorage.setItem("regive-paymenttype", "card");
  });
});

const embeddedFrame = (page: import("@playwright/test").Page) =>
  page.frames().find((f) => f !== page.mainFrame());

test("sets the configured monthly frequency on the embedded form", async ({
  page,
}) => {
  await page.goto("/page/12345/monthlyok/2");

  await expect(page.locator("iframe.regive-iframe")).toBeAttached();
  await expect
    .poll(() =>
      embeddedFrame(page)
        ?.evaluate(
          () =>
            (
              document.querySelector(
                'input[name="transaction.recurrpay"][value="Y"]'
              ) as HTMLInputElement | null
            )?.checked
        )
        .catch(() => undefined)
    )
    .toBe(true);
  await expect
    .poll(() =>
      embeddedFrame(page)
        ?.evaluate(
          () =>
            (
              document.querySelector(
                'select[name="transaction.recurrfreq"]'
              ) as HTMLSelectElement | null
            )?.value
        )
        .catch(() => undefined)
    )
    .toBe("MONTHLY");
});

test("exits instead of submitting a monthly donation on a one-time-only page", async ({
  page,
}) => {
  await page.goto("/page/12345/monthly/2");

  // The embedded page has no recurrpay "Y" option, so the child exits rather
  // than submitting with a different frequency than configured
  await expect(page.locator(".regive-container")).toHaveCount(0);
  await expect(page.locator("iframe.regive-iframe")).toHaveCount(0);
});

test("exits when the page has no recurrpay field at all", async ({ page }) => {
  await page.goto("/page/12345/nofields/2");

  // The embedded page has no recurring fields whatsoever, so the child exits
  // instead of creating a hidden recurrpay field and submitting anyway
  await expect(page.locator(".regive-container")).toHaveCount(0);
  await expect(page.locator("iframe.regive-iframe")).toHaveCount(0);
});

test("creates a hidden recurrfreq field when the page has none", async ({
  page,
}) => {
  await page.goto("/page/12345/nofreq/2");

  const frame = page.frameLocator("iframe.regive-iframe");
  await expect(frame.locator(".regive-amount-btn")).toHaveCount(2);
  await frame.locator('.regive-amount-btn[data-amount="5"]').click();

  // The embedded form posts to /echo: recurrpay=Y is checked and the missing
  // recurrfreq field is created with the configured frequency
  const echo = frame.locator("#echo");
  await expect(echo).toBeAttached();
  await expect(echo).toContainText("transaction.recurrpay=Y");
  await expect(echo).toContainText("transaction.recurrfreq=MONTHLY");
});

test("exits on an unknown configured frequency instead of falling back to one-time", async ({
  page,
}) => {
  await page.goto("/page/12345/badfreq/2");

  await expect(page.locator(".regive-container")).toHaveCount(0);
  await expect(page.locator("iframe.regive-iframe")).toHaveCount(0);
});
