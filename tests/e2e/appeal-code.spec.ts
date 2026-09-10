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

const getAppealCode = (page: import("@playwright/test").Page) =>
  page
    .frames()
    .find((f) => f !== page.mainFrame())
    ?.evaluate(
      () =>
        (
          document.querySelector(
            'input[name="supporter.appealCode"]'
          ) as HTMLInputElement | null
        )?.value
    )
    .catch(() => undefined);

test('writes the default "REGIVE" appeal code into the embedded form', async ({
  page,
}) => {
  await page.goto("/page/12345/donate/2");

  await expect(page.locator("iframe.regive-iframe")).toBeAttached();
  await expect.poll(() => getAppealCode(page)).toBe("REGIVE");
});

test('source="original" reuses the appeal code captured from the first gift', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem("regive-appealcode", "SPRING25");
  });
  await page.goto("/page/12345/original/2");

  await expect(page.locator("iframe.regive-iframe")).toBeAttached();
  await expect.poll(() => getAppealCode(page)).toBe("SPRING25");
});

test('source="original" falls back to "REGIVE" when no appeal code was captured', async ({
  page,
}) => {
  await page.goto("/page/12345/original/2");

  await expect(page.locator("iframe.regive-iframe")).toBeAttached();
  await expect.poll(() => getAppealCode(page)).toBe("REGIVE");
});
