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

test("replaces the <regive> tag with a configured iframe", async ({ page }) => {
  await page.goto("/page/12345/donate/2");

  const iframe = page.locator("iframe.regive-iframe");
  await expect(iframe).toBeAttached();

  const src = (await iframe.getAttribute("src")) ?? "";
  // Points back at page 1 of the same donation form, chained, with the
  // tag attributes serialized as regive-* parameters
  expect(src).toContain("/page/12345/donate/1");
  expect(src).toMatch(/[?&]chain(&|$)/);
  expect(src).toContain("regive-amount=5%2C10");
  expect(src).toContain("regive-heading=Double+your+impact");
  expect(src).toContain("regive-thank-you-message=Thanks+so+much%21");

  const container = page.locator(".regive-container");
  await expect(container).toHaveAttribute(
    "data-thank-you-message",
    "Thanks so much!"
  );
  await expect(container).toHaveAttribute("data-confetti", "default");
  const bgColor = await container.evaluate((el) =>
    (el as HTMLElement).style.getPropertyValue("--regive-bg-color")
  );
  expect(bgColor).toBe("#FFF8F0");

  await expect(page.locator(".regive-thank-you h2")).toHaveText(
    "Thanks so much!"
  );

  // The original tag is gone
  await expect(page.locator("regive")).toHaveCount(0);
});
