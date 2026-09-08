import { expect, test } from "@playwright/test";

test("test-mode donation shows the success state and then resets", async ({
  page,
}) => {
  await page.goto("/page/12345/test/2");

  const frame = page.frameLocator("iframe.regive-iframe");
  const button = frame.locator(".regive-amount-btn");

  // The banner renders inside the iframe with the configured amount/heading
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute("data-amount", "7");
  await expect(frame.locator(".regive-heading")).toHaveText("Give again");

  // The donation form itself is hidden inside the iframe
  await expect(frame.locator("form.en__component")).toBeHidden();

  // The parent page is told the banner is enabled
  await expect(page.locator("body")).toHaveAttribute(
    "data-regive-enabled",
    "true"
  );

  await button.click();

  // Test mode simulates the donation: after ~3s the parent celebrates
  const container = page.locator(".regive-container");
  await expect(container).toHaveClass(/regive-loading/);
  await expect(container).toHaveClass(/regive-success/, { timeout: 8000 });
  await expect(page.locator("body > canvas")).toBeAttached();

  // After ~8s the UX resets for another donation
  await expect(container).not.toHaveClass(/regive-success/, {
    timeout: 15000,
  });
});
