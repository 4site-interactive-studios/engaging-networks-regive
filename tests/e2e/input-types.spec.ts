import { expect, test } from "@playwright/test";

// These specs cover pages where donationAmt/recurrpay/recurrfreq are <select>
// elements instead of radio buttons - writes must be applied and verified
// regardless of input type.

// Seed VGS tokens so the embedded donation page inside the iframe renders the
// regive banner instead of exiting for missing tokens.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("regive-num", "tok_cc_123");
    localStorage.setItem("regive-ver", "tok_cv_456");
    localStorage.setItem("regive-exp", "0130");
    localStorage.setItem("regive-card", "visa");
    localStorage.setItem("regive-paymenttype", "card");
  });
});

test("captures the frequency from select-based fields on page 1", async ({
  page,
}) => {
  await page.goto("/page/12345/selects/1");

  // The donor picks a monthly recurring gift via selects
  await page
    .locator('select[name="transaction.recurrpay"]')
    .selectOption("Y");
  await page
    .locator('select[name="transaction.recurrfreq"]')
    .selectOption("MONTHLY");

  // Simulate VGS writing a token, which triggers the mutation observer
  await page.evaluate(() => {
    document
      .querySelector('input[name="transaction.ccnumber"]')
      ?.setAttribute("value", "tok_cc_123");
  });

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("regive-frequency")))
    .toBe("monthly");
});

test("submits the configured monthly frequency and chosen amount through select fields", async ({
  page,
}) => {
  await page.goto("/page/12345/selects/2");

  const frame = page.frameLocator("iframe.regive-iframe");
  await expect(frame.locator(".regive-amount-btn")).toHaveCount(2);
  await frame.locator('.regive-amount-btn[data-amount="10"]').click();

  // The embedded form posts to /echo, which renders the submitted body
  const echo = frame.locator("#echo");
  await expect(echo).toBeAttached();
  await expect(echo).toContainText("transaction.donationAmt=10.00");
  await expect(echo).toContainText("transaction.recurrpay=Y");
  await expect(echo).toContainText("transaction.recurrfreq=MONTHLY");
  await expect(echo).toContainText("supporter.appealCode=REGIVE");
});

test("exits when the recurrfreq select has no option for the configured frequency", async ({
  page,
}) => {
  await page.goto("/page/12345/selectsnomonthly/2");

  // The embedded page's recurrfreq select has no MONTHLY option, so the
  // frequency write fails verification and the child exits
  await expect(page.locator(".regive-container")).toHaveCount(0);
  await expect(page.locator("iframe.regive-iframe")).toHaveCount(0);
});

test("exits instead of submitting when the chosen amount has no matching select option", async ({
  page,
}) => {
  await page.goto("/page/12345/selectsbad/2");

  const frame = page.frameLocator("iframe.regive-iframe");
  const button = frame.locator('.regive-amount-btn[data-amount="7"]');
  await expect(button).toBeAttached();
  await button.click();

  // $7 matches no option in the embedded page's donationAmt select (5.00 /
  // 10.00), so the child exits rather than submitting the wrong amount
  await expect(page.locator(".regive-container")).toHaveCount(0);
  await expect(page.locator("iframe.regive-iframe")).toHaveCount(0);
});
