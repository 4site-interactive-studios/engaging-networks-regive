import { expect, test } from "@playwright/test";

// Seed VGS tokens so the embedded donation page inside the iframe renders the
// regive banner instead of exiting (which would remove the container).
// regive-donation-amt is deliberately not seeded: the gift amount comes from
// the fixtures' gift-amount attributes, and the no-gift test needs it absent.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("regive-num", "tok_cc_123");
    localStorage.setItem("regive-ver", "tok_cv_456");
    localStorage.setItem("regive-exp", "0130");
    localStorage.setItem("regive-card", "visa");
    localStorage.setItem("regive-paymenttype", "card");
  });
});

test("resolves percentage amounts against the gift-amount attribute", async ({
  page,
}) => {
  await page.goto("/page/12345/percent/2");

  // Percentage tokens survive the iframe URL encoding round trip
  const src =
    (await page.locator("iframe.regive-iframe").getAttribute("src")) ?? "";
  expect(src).toContain("regive-amount=50%25%2C100%25");
  expect(src).toContain("regive-gift-amount=20");

  // 50% and 100% of the $20 gift resolve to $10 and $20 buttons
  const buttons = page
    .frameLocator("iframe.regive-iframe")
    .locator(".regive-amount-btn");
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveAttribute("data-amount", "10");
  await expect(buttons.nth(1)).toHaveAttribute("data-amount", "20");
});

test("skips percentage tokens when no gift amount is available", async ({
  page,
}) => {
  await page.goto("/page/12345/nogift/2");

  const buttons = page
    .frameLocator("iframe.regive-iframe")
    .locator(".regive-amount-btn");
  await expect(buttons).toHaveCount(1);
  await expect(buttons.nth(0)).toHaveAttribute("data-amount", "5");
});

test("skips fixed amounts over the 100000 ceiling", async ({ page }) => {
  await page.goto("/page/12345/overlimit/2");

  const buttons = page
    .frameLocator("iframe.regive-iframe")
    .locator(".regive-amount-btn");
  await expect(buttons).toHaveCount(1);
  await expect(buttons.nth(0)).toHaveAttribute("data-amount", "25");
});

test("applies the theme rule and replaces the ask-amount merge tag", async ({
  page,
}) => {
  await page.goto("/page/12345/themerules/2");

  const frame = page.frameLocator("iframe.regive-iframe");

  // The custom theme from the embedded page's <template id="big"> rendered...
  await expect(frame.locator(".big-theme")).toBeAttached();
  await expect(frame.locator(".regive-heading")).toHaveText("Big donor");
  // ...and the template element was consumed
  await expect(frame.locator("#big")).toHaveCount(0);

  // {{ask-amount}} is replaced in the template content ("$10" from amount="10")
  const ask = frame.locator(".regive-ask");
  await expect(ask).toHaveText("Ask again:");
  // ...and inside the <style> block's pseudo-element content
  const pseudoContent = await ask.evaluate(
    (el) => getComputedStyle(el, "::after").content
  );
  expect(pseudoContent).toContain("$10");
});

test("falls back to the stacked theme when no theme rule is satisfied", async ({
  page,
}) => {
  await page.goto("/page/12345/themeruleslow/2");

  const frame = page.frameLocator("iframe.regive-iframe");
  await expect(frame.locator(".regive-banner")).toHaveAttribute(
    "data-theme",
    "stacked"
  );
});
