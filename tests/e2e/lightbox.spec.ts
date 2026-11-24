import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// <regive lightbox="true"> wraps the parent's existing chained iframe in a
// modal dialog. These specs run against the real dist/regive.js build with
// mock EN pages only - nothing here reaches a real payment account.

const seedTokens = (context: BrowserContext) =>
  context.addInitScript(() => {
    localStorage.setItem("regive-num", "tok_cc_123");
    localStorage.setItem("regive-ver", "tok_cv_456");
    localStorage.setItem("regive-exp", "0130");
    localStorage.setItem("regive-card", "visa");
    localStorage.setItem("regive-paymenttype", "card");
  });

// Records, in order, every regive message the parent receives and every
// lightbox state change or scroll lock change, so a spec can prove the
// dialog never became visible (no empty-overlay flash) and only opened after
// the child reported ready. Message entries are recorded before Regive's own
// listener runs; the mutation entries land right after it.
const recordLightbox = (page: Page) =>
  page.addInitScript(() => {
    if (window !== window.parent) return;
    const events: string[] = [];
    (window as unknown as { __lightboxEvents: string[] }).__lightboxEvents =
      events;
    window.addEventListener("message", (event) => {
      if (event.data?.sender === "regive") {
        events.push(`message:${event.data.action}`);
      }
    });
    const isLightbox = (node: Node): node is Element =>
      node instanceof Element && node.classList.contains("regive-lightbox");
    new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "childList") {
          record.addedNodes.forEach((node) => {
            if (isLightbox(node)) {
              events.push(
                `added:${node.getAttribute("data-regive-lightbox-state")}`
              );
            }
          });
          record.removedNodes.forEach((node) => {
            if (isLightbox(node)) events.push("removed");
          });
        } else if (record.attributeName === "data-regive-lightbox-state") {
          events.push(
            `state:${(record.target as Element).getAttribute(
              "data-regive-lightbox-state"
            )}`
          );
        } else if (record.attributeName === "data-regive-lightbox-open") {
          events.push(
            `lock:${(record.target as Element).getAttribute(
              "data-regive-lightbox-open"
            )}`
          );
        }
      });
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-regive-lightbox-state", "data-regive-lightbox-open"],
    });
  });

const lightboxEvents = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __lightboxEvents: string[] }).__lightboxEvents
  );

// Serves a bare page (no regive.js) in place of the chained iframe, so a spec
// controls exactly which messages the child sends and when.
const stubChild = (page: Page, segment: string) =>
  page.route(new RegExp(`/page/12345/${segment}/1\\?`), (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!DOCTYPE html><html><body><button id="child-button">Child</button></body></html>',
    })
  );

const childFrame = (page: Page, segment: string) =>
  page.frames().find((frame) => frame.url().includes(`/${segment}/1`));

const postFromChild = async (
  page: Page,
  segment: string,
  messages: Array<{ sender: string; action: string; value?: unknown }>
) => {
  await expect.poll(() => !!childFrame(page, segment)).toBe(true);
  await childFrame(page, segment)!.evaluate((list) => {
    list.forEach((message) => window.parent.postMessage(message, "*"));
  }, messages);
};

const lightboxRoot = (page: Page) => page.locator(".regive-lightbox");
const lightboxState = (page: Page) =>
  lightboxRoot(page).getAttribute("data-regive-lightbox-state");

test.describe("opt-in", () => {
  test("leaves the inline embed untouched when lightbox is not set", async ({
    page,
    context,
  }) => {
    await seedTokens(context);
    await page.goto("/page/12345/donate/2");

    await expect(
      page.frameLocator("iframe.regive-iframe").locator(".regive-amount-btn")
    ).toHaveCount(2);
    await expect(lightboxRoot(page)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The container sits where the <regive> tag was
    await expect(page.locator("body > .regive-container")).toHaveCount(1);
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-regive-lightbox-open",
      /.*/
    );
  });

  test("opens a labelled dialog around the existing iframe once the child is ready", async ({
    page,
    context,
  }) => {
    await seedTokens(context);
    await recordLightbox(page);
    await page.goto("/page/12345/lightbox/2");

    const dialog = page.getByRole("dialog", { name: "Double your impact" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(
      dialog.getByRole("button", { name: "Close" })
    ).toBeVisible();

    // The existing container and chained iframe live inside the dialog
    const iframe = dialog.locator(".regive-container iframe.regive-iframe");
    await expect(iframe).toHaveCount(1);
    const src = (await iframe.getAttribute("src")) ?? "";
    expect(src).toContain("/page/12345/lightbox/1");
    expect(src).toMatch(/[?&]chain(&|$)/);
    expect(src).toContain("regive-amount=5%2C10");
    await expect(page.locator("regive")).toHaveCount(0);

    // Current themes and amounts render inside it
    const frame = page.frameLocator("iframe.regive-iframe");
    await expect(frame.locator(".regive-amount-btn")).toHaveCount(2);
    await expect(frame.locator(".regive-heading")).toHaveText(
      "Double your impact"
    );

    // Default width, focus moved in, page scroll locked
    const dialogBox = await dialog.boundingBox();
    expect(Math.round(dialogBox!.width)).toBe(450);
    await expect(dialog).toBeFocused();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

    // It started hidden and opened only after loaded + enabled
    const events = await lightboxEvents(page);
    expect(events[0]).toBe("added:pending");
    const opened = events.indexOf("state:open");
    expect(opened).toBeGreaterThan(events.indexOf("message:loaded"));
    expect(opened).toBeGreaterThan(events.indexOf("message:enabled"));
    expect(events.indexOf("message:loaded")).toBeGreaterThan(-1);
  });

  test("honours lightbox-width and caps it on narrow screens", async ({
    page,
  }) => {
    await page.goto("/page/12345/lightboxtest/2");
    const dialog = page.getByRole("dialog", { name: "Give again" });
    await expect(dialog).toBeVisible();
    expect(Math.round((await dialog.boundingBox())!.width)).toBe(600);

    await page.setViewportSize({ width: 400, height: 800 });
    await expect
      .poll(async () => (await dialog.boundingBox())!.width)
      .toBeLessThanOrEqual(360);
  });
});

test.describe("readiness", () => {
  test("never shows the dialog when the child exits for missing tokens", async ({
    page,
  }) => {
    await recordLightbox(page);
    await page.goto("/page/12345/lightbox/2");

    await expect(lightboxRoot(page)).toHaveCount(0);
    await expect(page.locator("body")).toHaveAttribute(
      "data-regive-enabled",
      "false"
    );
    const events = await lightboxEvents(page);
    expect(events[0]).toBe("added:pending");
    expect(events).toContain("message:exit");
    expect(events).toContain("removed");
    expect(events).not.toContain("state:open");
    expect(events).not.toContain("lock:true");
  });

  test("never shows the dialog when the child exits after enabled but before loaded", async ({
    page,
  }) => {
    await recordLightbox(page);
    await page.goto("/page/12345/lightboxmonthly/2");

    await expect(lightboxRoot(page)).toHaveCount(0);
    const events = await lightboxEvents(page);
    expect(events[0]).toBe("added:pending");
    expect(events).toContain("removed");
    expect(events.indexOf("message:enabled")).toBeGreaterThan(-1);
    expect(events.indexOf("message:exit")).toBeGreaterThan(
      events.indexOf("message:enabled")
    );
    expect(events).not.toContain("message:loaded");
    expect(events).not.toContain("state:open");
    expect(events).not.toContain("lock:true");
  });

  test("creates no lightbox when hide-for-frequency hides regive", async ({
    page,
    context,
  }) => {
    await seedTokens(context);
    await context.addInitScript(() =>
      localStorage.setItem("regive-frequency", "annual")
    );
    await page.goto("/page/12345/lightbox/2");

    await page.waitForTimeout(500);
    await expect(lightboxRoot(page)).toHaveCount(0);
    await expect(page.locator("iframe.regive-iframe")).toHaveCount(0);
    await expect(page.locator("regive")).toBeAttached();
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-regive-lightbox-open",
      /.*/
    );
  });

  test("only opens for messages from its own iframe", async ({ page }) => {
    await stubChild(page, "lightbox");
    await page.goto("/page/12345/lightbox/2");
    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-state",
      "pending"
    );

    // Right sender, wrong window: the top page itself
    await page.evaluate(() => {
      window.postMessage({ sender: "regive", action: "loaded" }, "*");
      window.postMessage({ sender: "regive", action: "enabled" }, "*");
    });
    // Right sender, wrong window: an unrelated iframe
    await page.evaluate(() => {
      const other = document.createElement("iframe");
      other.className = "not-regive";
      document.body.appendChild(other);
      // A script inside the unrelated frame, so event.source is that frame
      const script = other.contentDocument!.createElement("script");
      script.textContent = [
        'window.parent.postMessage({ sender: "regive", action: "loaded" }, "*");',
        'window.parent.postMessage({ sender: "regive", action: "enabled" }, "*");',
      ].join("\n");
      other.contentDocument!.body.appendChild(script);
    });
    // Right window, wrong sender
    await postFromChild(page, "lightbox", [
      { sender: "not-regive", action: "loaded" },
      { sender: "not-regive", action: "enabled" },
    ]);
    await page.waitForTimeout(300);
    expect(await lightboxState(page)).toBe("pending");
    await expect(page.getByRole("dialog")).toBeHidden();

    await postFromChild(page, "lightbox", [
      { sender: "regive", action: "loaded" },
      { sender: "regive", action: "enabled" },
    ]);
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("exit and empty content while open", () => {
  test("removes the open dialog and restores focus and scrolling when the child exits", async ({
    page,
  }) => {
    await stubChild(page, "lightbox");
    await page.goto("/page/12345/lightbox/2");
    await page.locator("#host-focus").focus();
    await postFromChild(page, "lightbox", [
      { sender: "regive", action: "loaded" },
      { sender: "regive", action: "enabled" },
    ]);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

    await postFromChild(page, "lightbox", [
      { sender: "regive", action: "exit" },
    ]);

    await expect(lightboxRoot(page)).toHaveCount(0);
    await expect(page.locator("body")).toHaveCSS("overflow", "visible");
    await expect(page.locator("#host-focus")).toBeFocused();
    await expect(page.locator("body")).toHaveAttribute(
      "data-regive-enabled",
      "false"
    );
  });

  test("closes instead of showing an empty dialog when the banner reports no height", async ({
    page,
  }) => {
    await stubChild(page, "lightbox");
    await page.goto("/page/12345/lightbox/2");
    await postFromChild(page, "lightbox", [
      { sender: "regive", action: "loaded" },
      { sender: "regive", action: "enabled" },
    ]);
    await expect(page.getByRole("dialog")).toBeVisible();

    await postFromChild(page, "lightbox", [
      { sender: "regive", action: "height", value: 0 },
    ]);

    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await lightboxState(page)).toBe("closed");
    await expect(page.locator("body")).toHaveCSS("overflow", "visible");
  });
});

test.describe("keyboard and dismissal", () => {
  test("Escape closes the dialog and restores focus and scrolling", async ({
    page,
  }) => {
    await stubChild(page, "lightbox");
    await page.goto("/page/12345/lightbox/2");
    await page.locator("#host-focus").focus();

    await postFromChild(page, "lightbox", [
      { sender: "regive", action: "loaded" },
      { sender: "regive", action: "enabled" },
    ]);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    await expect(page.locator("html")).toHaveCSS("overflow", "hidden");

    await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
    expect(await lightboxState(page)).toBe("closed");
    await expect(page.locator("#host-focus")).toBeFocused();
    await expect(page.locator("body")).toHaveCSS("overflow", "visible");
    await expect(page.locator("html")).toHaveCSS("overflow", "visible");
  });

  test("Escape inside the iframe closes the dialog", async ({ page }) => {
    await page.goto("/page/12345/lightboxtest/2");
    await expect(page.getByRole("dialog")).toBeVisible();

    const button = page
      .frameLocator("iframe.regive-iframe")
      .locator(".regive-amount-btn");
    await button.focus();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("keeps Tab and Shift+Tab inside the dialog across the iframe boundary", async ({
    page,
  }) => {
    await page.goto("/page/12345/lightboxtest/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeFocused();
    const closeButton = dialog.getByRole("button", { name: "Close" });
    const amountButton = page
      .frameLocator("iframe.regive-iframe")
      .locator(".regive-amount-btn");
    const focusInsideDialog = () =>
      page.evaluate(
        () => !!document.activeElement?.closest(".regive-lightbox__dialog")
      );

    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(amountButton).toBeFocused();
    expect(await focusInsideDialog()).toBe(true);
    // Tabbing out of the iframe wraps back to the start of the dialog
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();
    // Shift+Tab from the first control wraps to the last one, in the iframe
    await page.keyboard.press("Shift+Tab");
    await expect(amountButton).toBeFocused();
    expect(await focusInsideDialog()).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(closeButton).toBeFocused();
  });

  test("closes with the close button", async ({ page }) => {
    await page.goto("/page/12345/lightboxtest/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Close" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.locator("body")).toHaveCSS("overflow", "visible");
  });

  test("closes on a backdrop click", async ({ page }) => {
    await page.goto("/page/12345/lightboxtest/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.mouse.click(10, 10);

    await expect(dialog).toBeHidden();
  });
});

test.describe("close button", () => {
  // WCAG relative luminance contrast between two rgb() colours
  const contrast = (first: string, second: string) => {
    const luminance = (color: string) => {
      const [r, g, b] = (/\(([^)]+)\)/.exec(color) as RegExpExecArray)[1]
        .split(",")
        .slice(0, 3)
        .map((part) => {
          const channel = parseFloat(part) / 255;
          return channel <= 0.03928
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [light, dark] = [luminance(first), luminance(second)].sort(
      (a, b) => b - a
    );
    return (light + 0.05) / (dark + 0.05);
  };

  test("is a white X on black, with distinct dark hover, focus and disabled states", async ({
    page,
  }) => {
    await page.goto("/page/12345/lightboxtest/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeFocused();
    const closeButton = dialog.getByRole("button", { name: "Close" });
    await expect(closeButton).toHaveAttribute("type", "button");
    const look = () =>
      closeButton.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          stroke: getComputedStyle(element, "::before").backgroundColor,
          otherStroke: getComputedStyle(element, "::after").backgroundColor,
          shadow: style.boxShadow,
          cursor: style.cursor,
        };
      });

    const normal = await look();
    expect(normal.background).toBe("rgb(0, 0, 0)");
    expect(normal.stroke).toBe("rgb(255, 255, 255)");
    expect(normal.otherStroke).toBe("rgb(255, 255, 255)");
    expect(normal.shadow).toBe("none");
    expect(contrast(normal.background, normal.stroke)).toBeGreaterThanOrEqual(
      7
    );

    await closeButton.hover();
    const hovered = await look();
    expect(hovered.background).toBe("rgb(51, 51, 51)");
    expect(hovered.stroke).toBe("rgb(255, 255, 255)");
    expect(contrast(hovered.background, hovered.stroke)).toBeGreaterThanOrEqual(
      7
    );

    // Keyboard focus draws a white-then-black ring, visible on light and
    // dark dialogs alike
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();
    const focused = await look();
    expect(focused.background).toBe("rgb(0, 0, 0)");
    expect(focused.shadow).toBe(
      "rgb(255, 255, 255) 0px 0px 0px 2px, rgb(0, 0, 0) 0px 0px 0px 4px"
    );

    // Disabled while the donation processes: muted, still light on dark,
    // and hovering it does not light it up
    await page
      .frameLocator("iframe.regive-iframe")
      .locator(".regive-amount-btn")
      .click();
    await expect(closeButton).toHaveAttribute("aria-disabled", "true");
    await closeButton.hover({ force: true });
    const disabled = await look();
    expect(disabled.background).toBe("rgb(89, 89, 89)");
    expect(disabled.stroke).toBe("rgb(196, 196, 196)");
    expect(disabled.cursor).toBe("not-allowed");
    expect(
      contrast(disabled.background, disabled.stroke)
    ).toBeGreaterThanOrEqual(3);
    expect(disabled.background).not.toBe(hovered.background);
  });
});

test.describe("submission", () => {
  test("locks dismissal while processing, keeps the thank-you, closes, and never reopens", async ({
    page,
  }) => {
    test.setTimeout(45000);
    await recordLightbox(page);
    await page.goto("/page/12345/lightboxtest/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // A CSS locator, so it still resolves once the dialog is hidden
    const container = page.locator(
      ".regive-lightbox__dialog .regive-container"
    );

    await page
      .frameLocator("iframe.regive-iframe")
      .locator(".regive-amount-btn")
      .click();
    await expect(container).toHaveClass(/regive-loading/);
    await expect(
      dialog.getByRole("button", { name: "Close" })
    ).toHaveAttribute("aria-disabled", "true");

    // Every way out is blocked until the outcome is known. force: Playwright
    // would otherwise wait for aria-disabled to clear instead of clicking now
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Close" }).click({ force: true });
    await page.mouse.click(10, 10);
    await expect(dialog).toBeVisible();
    expect(await lightboxState(page)).toBe("open");

    // Test mode reports success after ~3s
    await expect(container).toHaveClass(/regive-success/, { timeout: 8000 });
    await expect(dialog.locator(".regive-thank-you h2")).toHaveText(
      "You did it again!"
    );
    await expect(dialog.locator(".regive-thank-you h2")).toBeInViewport();

    // A zero height after success must not blank the thank-you content
    await postFromChild(page, "lightboxtest", [
      { sender: "regive", action: "height", value: 0 },
    ]);
    await page.waitForTimeout(200);
    await expect(container).not.toHaveCSS("display", "none");
    await expect(dialog.locator(".regive-thank-you h2")).toBeVisible();

    // It closes ~3500ms after success
    await expect(dialog).toBeHidden({ timeout: 6000 });
    await expect(page.locator("body")).toHaveCSS("overflow", "visible");

    // Test mode resets the iframe ~5s after success; that must not reopen it
    await expect(container).not.toHaveClass(/regive-success/, {
      timeout: 10000,
    });
    await page.waitForTimeout(500);
    expect(await lightboxState(page)).toBe("closed");
    const events = await lightboxEvents(page);
    expect(events.filter((event) => event === "state:open")).toHaveLength(1);
    expect(events).toContain("message:reset");
  });

  test("completes one real second donation, ignoring Escape mid-submission", async ({
    page,
    context,
  }) => {
    await seedTokens(context);
    const submissions: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") submissions.push(request.url());
    });
    await page.goto("/page/12345/lightbox/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page
      .frameLocator("iframe.regive-iframe")
      .locator('.regive-amount-btn[data-amount="5"]')
      .click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    const container = dialog.locator(".regive-container");
    await expect(container).toHaveClass(/regive-success/, { timeout: 10000 });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#host-component")).toHaveClass(
      /regive-success/
    );
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toContain("/page/12345/donate/2");

    // Tokens are cleared after a real success, as in the inline embed
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("regive-num")))
      .toBeNull();

    // Auto-close keeps the success hooks working on the host page
    await expect(dialog).toBeHidden({ timeout: 6000 });
    await expect(page.locator("#success-note")).toBeVisible();
    expect(submissions).toHaveLength(1);
  });

  test("releases the lock when the submission lands on a page that never reports back", async ({
    page,
    context,
  }) => {
    test.setTimeout(45000);
    await seedTokens(context);
    const submissions: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") submissions.push(request.url());
    });
    await page.goto("/page/12345/lightboxecho/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page
      .frameLocator("iframe.regive-iframe")
      .locator('.regive-amount-btn[data-amount="5"]')
      .click();
    await expect
      .poll(() => page.frames().some((frame) => frame.url().endsWith("/echo")))
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    // After the grace period the donor can leave instead of being trapped
    await page.waitForTimeout(5500);
    await dialog.focus();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(submissions).toHaveLength(1);
  });
});

test.describe("CAPTCHA and digital wallets", () => {
  test("keeps the CAPTCHA gate working inside the dialog", async ({ page }) => {
    test.setTimeout(45000);
    await page.goto("/page/12345/lightboxcaptcha/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const frame = page.frameLocator("iframe.regive-iframe");
    const button = frame.locator(".regive-amount-btn");
    await expect(
      frame.locator(".regive-captcha-container .g-recaptcha")
    ).toBeAttached();
    await expect(button).toBeDisabled();

    await childFrame(page, "lightboxcaptcha")!.evaluate(() =>
      (window as unknown as { captchaVerified: (t: string) => void })
        .captchaVerified("mock-token")
    );
    await expect(button).toBeEnabled();
    await button.click();
    await expect(dialog.locator(".regive-container")).toHaveClass(
      /regive-success/,
      { timeout: 8000 }
    );
  });

  test("never shows the dialog when the CAPTCHA callback is missing", async ({
    page,
  }) => {
    await recordLightbox(page);
    await page.goto("/page/12345/lightboxcaptcha/2?nocallback");

    await expect(lightboxRoot(page)).toHaveCount(0);
    const events = await lightboxEvents(page);
    expect(events[0]).toBe("added:pending");
    expect(events).toContain("removed");
    expect(events).toContain("message:exit");
    expect(events).not.toContain("state:open");
    expect(events).not.toContain("lock:true");
  });

  test("waits for the digital wallet UI before opening", async ({ page }) => {
    await recordLightbox(page);
    await page.goto("/page/12345/lightboxwallet/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      page
        .frameLocator("iframe.regive-iframe")
        .locator(".regive-wallets-wrapper #en__digitalWallet")
    ).toBeAttached();

    // The wallet child reports loaded first and enabled only once its UI
    // exists - the dialog must have waited for enabled
    const events = await lightboxEvents(page);
    const loaded = events.indexOf("message:loaded");
    const enabled = events.indexOf("message:enabled");
    expect(loaded).toBeGreaterThan(-1);
    expect(enabled).toBeGreaterThan(loaded);
    expect(events.indexOf("state:open")).toBeGreaterThan(enabled);
  });

  test("never shows the dialog when the wallet UI never appears", async ({
    page,
  }) => {
    test.setTimeout(45000);
    await recordLightbox(page);
    await page.goto("/page/12345/lightboxwallet/2?nowallet");

    // Pending (invisible) while the child waits for the wallet UI...
    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-state",
      "pending"
    );
    await expect(page.getByRole("dialog")).toBeHidden();
    // ...then removed when the child gives up and exits
    await expect(lightboxRoot(page)).toHaveCount(0, { timeout: 15000 });
    const events = await lightboxEvents(page);
    expect(events[0]).toBe("added:pending");
    expect(events).toContain("removed");
    expect(events).toContain("message:loaded");
    expect(events).toContain("message:exit");
    expect(events).not.toContain("state:open");
    expect(events).not.toContain("lock:true");
  });
});
