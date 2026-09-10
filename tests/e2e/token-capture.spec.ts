import { expect, test } from "@playwright/test";

const getStored = (page: import("@playwright/test").Page, key: string) =>
  page.evaluate((k) => localStorage.getItem(k), key);

test("captures VGS token fields into localStorage", async ({ page }) => {
  await page.goto("/page/12345/donate/1");

  // Any stale tokens from a previous session are cleared on load
  expect(await getStored(page, "regive-num")).toBeNull();

  // Simulate VGS writing token values into the hidden fields. VGS does this
  // via setAttribute, which is what the component's MutationObserver reacts to.
  await page.evaluate(() => {
    const set = (name: string, value: string) =>
      document
        .querySelector(`input[name="${name}"]`)
        ?.setAttribute("value", value);
    set("transaction.paymenttype", "card");
    set("transaction.ccnumber", "tok_cc_123");
    set("transaction.ccvv", "tok_cv_456");
    set("transaction.ccexpire", "0130");
    set("transaction.vgs.cardType", "visa");
    set("supporter.appealCode", "SPRING25");
  });

  await expect.poll(() => getStored(page, "regive-num")).toBe("tok_cc_123");
  await expect.poll(() => getStored(page, "regive-ver")).toBe("tok_cv_456");
  await expect.poll(() => getStored(page, "regive-exp")).toBe("0130");
  await expect.poll(() => getStored(page, "regive-card")).toBe("visa");
  await expect.poll(() => getStored(page, "regive-paymenttype")).toBe("card");
  await expect.poll(() => getStored(page, "regive-appealcode")).toBe(
    "SPRING25"
  );
  // The fixture's default is a one-time gift (recurrpay=N is checked)
  await expect.poll(() => getStored(page, "regive-frequency")).toBe("onetime");
});

test("captures the original gift's frequency into localStorage", async ({
  page,
}) => {
  await page.goto("/page/12345/donate/1");

  // The donor switches to a monthly recurring gift
  await page.locator('input[name="transaction.recurrpay"][value="Y"]').check();
  await page
    .locator('select[name="transaction.recurrfreq"]')
    .selectOption("MONTHLY");

  // Simulate VGS writing a token, which triggers the mutation observer
  await page.evaluate(() => {
    document
      .querySelector('input[name="transaction.ccnumber"]')
      ?.setAttribute("value", "tok_cc_123");
  });

  await expect.poll(() => getStored(page, "regive-frequency")).toBe("monthly");
});
