import { expect, test } from "@playwright/test";

// Seed VGS tokens so the embedded donation page inside the iframe renders the
// regive banner instead of exiting (which would remove the container).
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("regive-num", "tok_cc_123");
    localStorage.setItem("regive-ver", "tok_cv_456");
    localStorage.setItem("regive-exp", "0130");
    localStorage.setItem("regive-card", "visa");
    localStorage.setItem("regive-paymenttype", "card");
  });
});

const seedFrequency = (
  context: import("@playwright/test").BrowserContext,
  frequency: string | null
) =>
  context.addInitScript((freq) => {
    if (freq) {
      localStorage.setItem("regive-frequency", freq);
    }
  }, frequency);

test("does not load regive when the original gift's frequency is hidden", async ({
  page,
  context,
}) => {
  await seedFrequency(context, "annual");
  await page.goto("/page/12345/frequency/2");

  // Give the component a moment to (not) act
  await page.waitForTimeout(500);
  await expect(page.locator("iframe.regive-iframe")).toHaveCount(0);
  await expect(page.locator(".regive-container")).toHaveCount(0);
  // The <regive> tag is left untouched
  await expect(page.locator("regive")).toBeAttached();
});

test("loads regive when the original gift's frequency is not hidden", async ({
  page,
  context,
}) => {
  await seedFrequency(context, "onetime");
  await page.goto("/page/12345/frequency/2");

  await expect(page.locator("iframe.regive-iframe")).toBeAttached();
});

test("loads regive when no original frequency was captured", async ({
  page,
}) => {
  await page.goto("/page/12345/frequency/2");

  await expect(page.locator("iframe.regive-iframe")).toBeAttached();
});
