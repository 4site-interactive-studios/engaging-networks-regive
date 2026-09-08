import { expect, test } from "@playwright/test";

// Seed VGS tokens as if the donor had just completed the first donation
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("regive-num", "tok_cc_123");
    localStorage.setItem("regive-ver", "tok_cv_456");
    localStorage.setItem("regive-exp", "0130");
    localStorage.setItem("regive-card", "visa");
    localStorage.setItem("regive-paymenttype", "card");
  });
});

test("completes a real second donation and celebrates in the parent", async ({
  page,
}) => {
  await page.goto("/page/12345/donate/2");

  const frame = page.frameLocator("iframe.regive-iframe");
  await expect(frame.locator(".regive-amount-btn")).toHaveCount(2);

  const regiveFrame = () =>
    page.frames().find((f) => f.url().includes("donate/1"));
  const frameValue = (selector: string) =>
    regiveFrame()
      ?.evaluate(
        (sel) =>
          (document.querySelector(sel) as HTMLInputElement | null)?.value,
        selector
      )
      .catch(() => undefined);

  // The stored tokens are written into the embedded form's hidden fields
  await expect.poll(() => frameValue('input[name="transaction.ccnumber"]')).toBe(
    "tok_cc_123"
  );
  await expect.poll(() => frameValue('input[name="transaction.ccvv"]')).toBe(
    "tok_cv_456"
  );

  await frame.locator('.regive-amount-btn[data-amount="5"]').click();

  // The embedded form submits and the iframe lands on the thank-you page
  await expect
    .poll(() =>
      page
        .frames()
        .some((f) => f.url().includes("donate/2") && f.url().includes("chain"))
    )
    .toBe(true);

  // The parent page shows the success state and fires confetti
  const container = page.locator(".regive-container");
  await expect(container).toHaveClass(/regive-success/, { timeout: 10000 });
  await expect(page.locator("body > canvas")).toBeAttached();

  // Tokens are cleared after a successful (non-test) donation
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("regive-num")))
    .toBeNull();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("regive-card")))
    .toBeNull();
});
