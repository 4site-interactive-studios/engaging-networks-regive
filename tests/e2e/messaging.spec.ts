import { expect, test } from "@playwright/test";

const gotoTestPageWithBanner = async (
  page: import("@playwright/test").Page
) => {
  await page.goto("/page/12345/test/2");
  // Wait for the banner to exist inside the iframe
  await expect(
    page.frameLocator("iframe.regive-iframe").locator(".regive-amount-btn")
  ).toBeAttached();
};

const regiveFrame = (page: import("@playwright/test").Page) =>
  page.frames().find((f) => f.url().includes("chain"));

test("ignores messages that do not come from the regive iframe", async ({
  page,
}) => {
  await gotoTestPageWithBanner(page);

  // Wrong sender — must be rejected by the sender validation
  await page.evaluate(() =>
    window.postMessage({ sender: "not-regive", action: "exit" }, "*")
  );
  // Correct sender, but posted from the top window rather than the iframe —
  // must be rejected because the source cannot be matched to a regive iframe
  await page.evaluate(() =>
    window.postMessage({ sender: "regive", action: "exit" }, "*")
  );

  await page.waitForTimeout(500);
  await expect(page.locator(".regive-container")).toHaveCount(1);
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-regive-enabled",
    "false"
  );
});

test("applies height and exit actions sent from the iframe", async ({
  page,
}) => {
  await gotoTestPageWithBanner(page);
  const frame = regiveFrame(page);
  expect(frame).toBeDefined();

  await frame!.evaluate(() =>
    window.parent.postMessage(
      { sender: "regive", action: "height", value: 222 },
      "*"
    )
  );
  await expect(page.locator(".regive-container")).toHaveCSS(
    "height",
    "222px"
  );

  await frame!.evaluate(() =>
    window.parent.postMessage({ sender: "regive", action: "exit" }, "*")
  );
  await expect(page.locator(".regive-container")).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute(
    "data-regive-enabled",
    "false"
  );
});
