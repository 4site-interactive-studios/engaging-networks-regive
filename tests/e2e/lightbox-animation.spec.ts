import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// <regive lightbox="true" lightbox-animate="true">: the dialog grows in with a
// gentle overshoot, and leaves with a dismissal or a post-success motion, all
// driven by @keyframes from the template rendered inside the chained iframe.
// These specs run the real dist/regive.js build against mock EN pages only.

type Sample = { transform: string; opacity: string; background: string };
type MotionEntry = {
  type: "animationstart" | "animationend" | "animationcancel";
  target: "backdrop" | "dialog";
  lightbox: number;
  name: string;
  t: number;
  duration?: number;
  keyframes?: Array<{
    offset: number;
    transform: string | null;
    opacity: string | null;
  }>;
  samples?: { start: Sample; overshoot: Sample; end: Sample };
};
type Recorded = {
  timeline: Array<{ entry: string; t: number }>;
  motion: MotionEntry[];
};

const seedTokens = (context: BrowserContext) =>
  context.addInitScript(() => {
    localStorage.setItem("regive-num", "tok_cc_123");
    localStorage.setItem("regive-ver", "tok_cv_456");
    localStorage.setItem("regive-exp", "0130");
    localStorage.setItem("regive-card", "visa");
    localStorage.setItem("regive-paymenttype", "card");
  });

// Records, with timestamps, every regive message the parent receives, every
// lightbox state / motion / scroll lock change, and every CSS animation on a
// lightbox backdrop or dialog. When an animation starts, it captures the
// keyframes the PARENT page is actually running plus the computed style at
// the start, at 60% (the default overshoot) and just before the end - by
// briefly pausing and seeking the animation, then restoring it exactly.
const recordMotion = (page: Page) =>
  page.addInitScript(() => {
    if (window !== window.parent) return;
    const recorded = {
      timeline: [] as Array<{ entry: string; t: number }>,
      motion: [] as unknown[],
    };
    (window as unknown as { __recorded: typeof recorded }).__recorded =
      recorded;
    const note = (entry: string) =>
      recorded.timeline.push({ entry, t: performance.now() });

    window.addEventListener("message", (event) => {
      if (event.data?.sender === "regive") note(`message:${event.data.action}`);
    });

    const labels: Record<string, string> = {
      "data-regive-lightbox-state": "state",
      "data-regive-lightbox-motion": "motion",
      "data-regive-lightbox-open": "lock",
    };
    new MutationObserver((records) => {
      // Each record's new value is the next record's old value for the same
      // element and attribute, or the current value for the last one
      records.forEach((record, index) => {
        const name = record.attributeName as string;
        const next = records
          .slice(index + 1)
          .find(
            (later) =>
              later.target === record.target && later.attributeName === name
          );
        const value = next
          ? next.oldValue
          : (record.target as Element).getAttribute(name);
        note(`${labels[name]}:${value}`);
      });
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: Object.keys(labels),
    });

    const roleOf = (element: Element) =>
      element.classList.contains("regive-lightbox__dialog")
        ? "dialog"
        : element.classList.contains("regive-lightbox")
          ? "backdrop"
          : null;
    const read = (element: Element) => {
      const style = getComputedStyle(element);
      return {
        transform: style.transform,
        opacity: style.opacity,
        background: style.backgroundColor,
      };
    };
    ["animationstart", "animationend", "animationcancel"].forEach((type) =>
      document.addEventListener(
        type,
        (event) => {
          const animationEvent = event as AnimationEvent;
          const element = animationEvent.target as Element;
          const role = roleOf(element);
          if (!role) return;
          const entry: Record<string, unknown> = {
            type,
            target: role,
            name: animationEvent.animationName,
            t: performance.now(),
            lightbox: Array.from(
              document.querySelectorAll(".regive-lightbox")
            ).indexOf(element.closest(".regive-lightbox") as Element),
          };
          if (type === "animationstart") {
            const animation = element
              .getAnimations()
              .find(
                (candidate) =>
                  (candidate as CSSAnimation).animationName ===
                  animationEvent.animationName
              );
            const effect = animation?.effect as KeyframeEffect | undefined;
            if (animation && effect) {
              entry.keyframes = effect.getKeyframes().map((frame) => ({
                offset: frame.computedOffset,
                transform: (frame.transform as string | undefined) ?? null,
                opacity:
                  frame.opacity === undefined ? null : String(frame.opacity),
              }));
              const end = Number(effect.getComputedTiming().endTime);
              entry.duration = end;
              const resumeAt = animation.currentTime;
              animation.pause();
              const at = (time: number) => {
                animation.currentTime = time;
                return read(element);
              };
              entry.samples = {
                start: at(0),
                overshoot: at(end * 0.6),
                end: at(Math.max(0, end - 1)),
              };
              animation.currentTime = resumeAt;
              animation.play();
            }
          }
          recorded.motion.push(entry);
        },
        true
      )
    );
  });

const recorded = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __recorded: Recorded }).__recorded
  );

const timelineEntries = async (page: Page) =>
  (await recorded(page)).timeline.map(({ entry }) => entry);

const timeOf = async (page: Page, entry: string) =>
  (await recorded(page)).timeline.find((item) => item.entry === entry)?.t;

const animationStart = async (
  page: Page,
  target: "backdrop" | "dialog",
  namePattern: RegExp,
  lightbox = 0
) => {
  let found: MotionEntry | undefined;
  await expect
    .poll(async () => {
      found = (await recorded(page)).motion.find(
        (entry) =>
          entry.type === "animationstart" &&
          entry.target === target &&
          entry.lightbox === lightbox &&
          namePattern.test(entry.name)
      );
      return !!found;
    })
    .toBe(true);
  return found as MotionEntry;
};

const transformsOf = (entry: MotionEntry) =>
  (entry.keyframes ?? []).map((frame) => frame.transform);

// [a, b, c, d, e, f] of a 2D matrix() transform
const matrixOf = (transform: string) => {
  if (transform === "none") return [1, 0, 0, 1, 0, 0];
  const match = /^matrix\(([^)]+)\)$/.exec(transform);
  if (!match) throw new Error(`Not a 2D matrix: ${transform}`);
  return match[1].split(",").map(Number);
};

const alphaOf = (color: string) => {
  const match = /^rgba?\(([^)]+)\)$/.exec(color);
  if (!match) throw new Error(`Not an rgb() colour: ${color}`);
  const parts = match[1].split(",").map((part) => parseFloat(part));
  return parts.length === 4 ? parts[3] : 1;
};

// Serves a bare page (no regive.js) in place of the chained iframe, so a spec
// controls exactly which messages the child sends and when
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

const lightboxRoot = (page: Page) => page.locator(".regive-lightbox").first();
const lightboxState = (page: Page) =>
  lightboxRoot(page).getAttribute("data-regive-lightbox-state");
const waitForEntrance = (page: Page) =>
  expect(lightboxRoot(page)).not.toHaveAttribute(
    "data-regive-lightbox-motion",
    /.*/
  );

test.describe("built-in template motion", () => {
  test("grows the PARENT dialog in with one gentle overshoot while the backdrop fades in", async ({
    page,
  }) => {
    await recordMotion(page);
    await page.goto("/page/12345/lightboxanimate/2");
    const dialog = page.getByRole("dialog", { name: "Give again" });
    await expect(dialog).toBeVisible();

    const entrance = await animationStart(
      page,
      "dialog",
      /^regive-lightbox-in--[a-z0-9]+$/
    );
    // The defaults travelled from the built-in template's CSS block
    expect(transformsOf(entrance)).toEqual([
      "scale(0.8)",
      "scale(1.04)",
      "scale(1)",
    ]);
    expect(entrance.keyframes!.map((frame) => frame.offset)).toEqual([
      0, 0.6, 1,
    ]);
    expect(matrixOf(entrance.samples!.start.transform)[0]).toBeCloseTo(0.8, 2);
    expect(Number(entrance.samples!.start.opacity)).toBe(0);
    expect(matrixOf(entrance.samples!.overshoot.transform)[0]).toBeCloseTo(
      1.04,
      2
    );
    expect(matrixOf(entrance.samples!.end.transform)[0]).toBeCloseTo(1, 2);
    expect(entrance.duration).toBe(450);

    const backdrop = await animationStart(
      page,
      "backdrop",
      /^regive-lightbox-backdrop-in$/
    );
    expect(alphaOf(backdrop.samples!.start.background)).toBe(0);
    expect(alphaOf(backdrop.samples!.end.background)).toBeGreaterThan(0.45);

    // It settles: no motion left, no transform, full backdrop
    await waitForEntrance(page);
    await expect(dialog).toHaveCSS("transform", "none");
    await expect(lightboxRoot(page)).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0.5)"
    );

    // The template's motion arrived before the child reported ready, so the
    // dialog opened with it rather than racing it
    const timeline = await timelineEntries(page);
    const config = timeline.indexOf("message:lightbox-animations");
    expect(config).toBeGreaterThan(-1);
    expect(config).toBeLessThan(timeline.indexOf("message:enabled"));
    expect(config).toBeLessThan(timeline.indexOf("message:loaded"));
    expect(config).toBeLessThan(timeline.indexOf("state:open"));
    expect(timeline.indexOf("motion:in")).toBeGreaterThan(-1);
    // Exactly one entrance, no continuous motion
    expect(
      (await recorded(page)).motion.filter(
        (entry) => entry.type === "animationstart" && entry.target === "dialog"
      )
    ).toHaveLength(1);
  });

  test("keeps the dialog up through the dismissal motion, then closes once and restores focus and scrolling", async ({
    page,
  }) => {
    await recordMotion(page);
    // No template metadata from this child: the parent's built-in fallback
    await stubChild(page, "lightboxanimate");
    await page.goto("/page/12345/lightboxanimate/2");
    await page.locator("#host-focus").focus();
    await postFromChild(page, "lightboxanimate", [
      { sender: "regive", action: "loaded" },
      { sender: "regive", action: "enabled" },
    ]);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const entrance = await animationStart(page, "dialog", /^regive-lightbox-in--/);
    expect(transformsOf(entrance)).toContain("scale(1.04)");
    await waitForEntrance(page);

    await page.keyboard.press("Escape");

    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-state",
      "closing"
    );
    await expect(dialog).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-state",
      "closed"
    );
    await expect(dialog).toBeHidden();
    await expect(page.locator("#host-focus")).toBeFocused();
    await expect(page.locator("body")).toHaveCSS("overflow", "visible");

    const exit = await animationStart(page, "dialog", /^regive-lightbox-out--/);
    expect(transformsOf(exit)).toEqual(["scale(1)", "scale(0.92)"]);
    expect(Number(exit.samples!.end.opacity)).toBeLessThan(0.05);
    const backdropExit = await animationStart(
      page,
      "backdrop",
      /^regive-lightbox-backdrop-out$/
    );
    expect(alphaOf(backdropExit.samples!.start.background)).toBeCloseTo(0.5, 2);
    expect(alphaOf(backdropExit.samples!.end.background)).toBeLessThan(0.05);

    // The overlay stayed up for the 250ms default dismissal motion
    const closing = (await timeOf(page, "state:closing"))!;
    const closed = (await timeOf(page, "state:closed"))!;
    expect(closed - closing).toBeGreaterThanOrEqual(200);
    expect(closed - closing).toBeLessThan(1500);
    const timeline = await timelineEntries(page);
    // Released once (ENGrid removes the attribute rather than writing "false")
    expect(timeline.filter((entry) => entry === "lock:null")).toHaveLength(1);
    expect(timeline.filter((entry) => entry === "state:open")).toHaveLength(1);
  });

  test("switches straight from the entrance to the dismissal motion when closed mid-entrance", async ({
    page,
  }) => {
    await recordMotion(page);
    await stubChild(page, "lightboxanimate");
    await page.goto("/page/12345/lightboxanimate/2");
    await page.addStyleTag({
      content: ":root { --regive-lightbox-in-duration: 1800ms; }",
    });
    await postFromChild(page, "lightboxanimate", [
      { sender: "regive", action: "loaded" },
      { sender: "regive", action: "enabled" },
    ]);
    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-motion",
      "in"
    );

    await page.keyboard.press("Escape");

    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-motion",
      "out"
    );
    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-state",
      "closed"
    );
    const timeline = await timelineEntries(page);
    const motions = timeline.filter((entry) => entry.startsWith("motion:"));
    expect(motions).toEqual(["motion:in", "motion:out", "motion:null"]);
    const states = timeline.filter((entry) => entry.startsWith("state:"));
    expect(states).toEqual(["state:open", "state:closing", "state:closed"]);
    // Well before the 1800ms entrance would have finished
    const closed = (await timeOf(page, "state:closed"))!;
    const opened = (await timeOf(page, "state:open"))!;
    expect(closed - opened).toBeLessThan(1500);
  });

  test("exits with the success motion 3.5s after a gift and never reopens", async ({
    page,
  }) => {
    test.setTimeout(45000);
    await recordMotion(page);
    await page.goto("/page/12345/lightboxanimate/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const container = page.locator(".regive-lightbox__dialog .regive-container");

    await page
      .frameLocator("iframe.regive-iframe")
      .locator(".regive-amount-btn")
      .click();
    await expect(container).toHaveClass(/regive-success/, { timeout: 8000 });
    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-state",
      "closing",
      { timeout: 6000 }
    );
    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-motion",
      "success-out"
    );
    await expect(dialog.locator(".regive-thank-you h2")).toBeVisible();
    await expect(dialog).toBeHidden({ timeout: 3000 });

    const exit = await animationStart(
      page,
      "dialog",
      /^regive-lightbox-success-out--/
    );
    expect(transformsOf(exit)).toEqual([
      "translateY(0px) scale(1)",
      "translateY(-24px) scale(0.95)",
    ]);
    const success = (await timeOf(page, "message:success"))!;
    const closing = (await timeOf(page, "state:closing"))!;
    const closed = (await timeOf(page, "state:closed"))!;
    expect(closing - success).toBeGreaterThanOrEqual(3450);
    expect(closed - closing).toBeGreaterThanOrEqual(350);

    // Test mode resets the banner later; the dialog stays closed
    await expect(container).not.toHaveClass(/regive-success/, {
      timeout: 10000,
    });
    expect(await lightboxState(page)).toBe("closed");
    const timeline = await timelineEntries(page);
    expect(timeline.filter((entry) => entry === "state:open")).toHaveLength(1);
    expect(
      timeline.filter((entry) => entry === "motion:out")
    ).toHaveLength(0);
  });
});

test.describe("custom template motion", () => {
  test("animates the PARENT dialog with the selected template's keyframes, not the host page's", async ({
    page,
  }) => {
    await recordMotion(page);
    await page.goto("/page/12345/lightboxanimatecustom/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const entrance = await animationStart(page, "dialog", /^regive-lightbox-in--/);
    expect(transformsOf(entrance)).toEqual([
      "translateY(-200px) rotate(-12deg)",
      "translateY(0px) rotate(0deg)",
    ]);
    const [a, b, , , e, f] = matrixOf(entrance.samples!.start.transform);
    expect(f).toBeCloseTo(-200, 0);
    expect(e).toBeCloseTo(0, 0);
    expect(b).toBeCloseTo(Math.sin((-12 * Math.PI) / 180), 2);
    expect(a).toBeCloseTo(Math.cos((-12 * Math.PI) / 180), 2);

    // The host page's own @keyframes regive-lightbox-in is never used
    const all = (await recorded(page)).motion.flatMap((entry) =>
      (entry.keyframes ?? []).map((frame) => frame.transform ?? "")
    );
    expect(all.join(" ")).not.toContain("999px");

    // The template still renders with its merge tags resolved
    const frame = page.frameLocator("iframe.regive-iframe");
    await expect(frame.locator(".motion-bold .motion-ask")).toHaveText(
      "Bold $7"
    );
    expect(
      await frame
        .locator(".motion-bold .motion-ask")
        .evaluate((element) => getComputedStyle(element, "::after").content)
    ).toBe('" ($7)"');
  });

  test("plays the template's dismissal motion, blocking every interaction until it finishes", async ({
    page,
  }) => {
    await recordMotion(page);
    const submissions: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") submissions.push(request.url());
    });
    await page.goto("/page/12345/lightboxanimatecustom/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await waitForEntrance(page);
    const closeButton = dialog.getByRole("button", { name: "Close" });

    await closeButton.click();

    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-state",
      "closing"
    );
    const exit = await animationStart(page, "dialog", /^regive-lightbox-out--/);
    // The template's exit - not page 1's own stylesheet rule
    expect(transformsOf(exit)).toEqual(["translateY(0px)", "translateY(120px)"]);
    expect(matrixOf(exit.samples!.end.transform)[5]).toBeGreaterThan(110);

    // While closing: the banner and the close button take no input, focus
    // stays on the dialog, and the page behind stays locked
    const container = dialog.locator(".regive-container");
    await expect(container).toHaveAttribute("inert", "");
    await expect(closeButton).toHaveAttribute("inert", "");
    await expect(dialog).toBeFocused();
    // A real pointer press where the amount button is drawn
    const amountBox = await page
      .frameLocator("iframe.regive-iframe")
      .locator(".regive-amount-btn")
      .boundingBox();
    expect(amountBox).not.toBeNull();
    await page.mouse.click(
      amountBox!.x + amountBox!.width / 2,
      amountBox!.y + amountBox!.height / 2
    );
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await page.mouse.click(10, 10);
    await page.locator("#host-focus").focus();
    await expect(dialog).toBeFocused();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    expect(await lightboxState(page)).toBe("closing");

    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-state",
      "closed",
      { timeout: 4000 }
    );
    const closing = (await timeOf(page, "state:closing"))!;
    const closed = (await timeOf(page, "state:closed"))!;
    // The host page set a 1500ms dismissal
    expect(closed - closing).toBeGreaterThanOrEqual(1400);
    expect(closed - closing).toBeLessThan(2100);
    const timeline = await timelineEntries(page);
    expect(timeline).not.toContain("message:loading");
    expect(submissions).toHaveLength(0);
    await expect(page.locator("body")).toHaveCSS("overflow", "visible");
  });

  test("plays the template's success motion, distinct from its dismissal", async ({
    page,
  }) => {
    test.setTimeout(45000);
    await recordMotion(page);
    await page.goto("/page/12345/lightboxanimatecustom/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page
      .frameLocator("iframe.regive-iframe")
      .locator(".regive-amount-btn")
      .click();
    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-motion",
      "success-out",
      { timeout: 10000 }
    );
    const exit = await animationStart(
      page,
      "dialog",
      /^regive-lightbox-success-out--/
    );
    expect(transformsOf(exit)).toEqual([
      "scale(1)",
      "translateY(-120px) scale(1.2)",
    ]);
    const [a, , , , , f] = matrixOf(exit.samples!.end.transform);
    expect(f).toBeLessThan(-110);
    expect(a).toBeGreaterThan(1.15);
    await expect(dialog).toBeHidden({ timeout: 4000 });
    const closing = (await timeOf(page, "state:closing"))!;
    const closed = (await timeOf(page, "state:closed"))!;
    // The host page set a 1200ms success exit
    expect(closed - closing).toBeGreaterThanOrEqual(1100);
    expect(
      (await recorded(page)).motion.some((entry) =>
        /^regive-lightbox-out--/.test(entry.name)
      )
    ).toBe(false);
  });

  test("follows the theme the gift amount selected, not the tag's theme attribute", async ({
    page,
  }) => {
    await recordMotion(page);
    await page.goto("/page/12345/lightboxanimaterules/2");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.frameLocator("iframe.regive-iframe").locator(".motion-bold")
    ).toBeVisible();

    const entrance = await animationStart(page, "dialog", /^regive-lightbox-in--/);
    expect(transformsOf(entrance)).toContain("translateY(-200px) rotate(-12deg)");
    expect(transformsOf(entrance).join(" ")).not.toContain("translateX(-240px)");
  });

  test("uses the template on the base page", async ({ page }) => {
    await recordMotion(page);
    await page.goto("/page/12345/lightboxanimatebase/2");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.locator("iframe.regive-iframe").getAttribute("src")
    ).toContain("/page/24680/donate/1");

    const entrance = await animationStart(page, "dialog", /^regive-lightbox-in--/);
    expect(transformsOf(entrance)).toEqual([
      "translateX(-240px)",
      "translateX(0px)",
    ]);
    expect(matrixOf(entrance.samples!.start.transform)[4]).toBeCloseTo(-240, 0);
  });

  test("keeps two lightboxes' motions apart", async ({ page }) => {
    await recordMotion(page);
    await page.goto("/page/12345/lightboxanimatetwo/2");
    await expect(page.getByRole("dialog", { name: "Bold motion" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Calm motion" })).toBeVisible();

    const bold = await animationStart(page, "dialog", /^regive-lightbox-in--/, 0);
    const calm = await animationStart(page, "dialog", /^regive-lightbox-in--/, 1);
    expect(bold.name).not.toBe(calm.name);
    expect(transformsOf(bold)).toContain("translateY(-200px) rotate(-12deg)");
    expect(transformsOf(calm)).toEqual(["translateX(-240px)", "translateX(0px)"]);
  });
});

test.describe("untrusted motion metadata", () => {
  test("falls back to the default entrance for an unsafe template rule, without fetching it", async ({
    page,
  }) => {
    const fetched: string[] = [];
    await page.route(/evil\.example/, (route) => {
      fetched.push(route.request().url());
      return route.abort();
    });
    await recordMotion(page);
    await page.goto("/page/12345/lightboxanimateunsafe/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const entrance = await animationStart(page, "dialog", /^regive-lightbox-in--/);
    expect(transformsOf(entrance)).toContain("scale(1.04)");
    await waitForEntrance(page);
    // The template's valid dismissal rule still applies
    await page.keyboard.press("Escape");
    const exit = await animationStart(page, "dialog", /^regive-lightbox-out--/);
    expect(transformsOf(exit)).toContain("rotate(30deg)");
    await expect(dialog).toBeHidden();

    const parentCss = await page.evaluate(() =>
      Array.from(document.querySelectorAll("style"))
        .map((style) => style.textContent)
        .join("\n")
    );
    expect(parentCss).not.toContain("evil.example");
    expect(parentCss).not.toContain("url(");
    expect(fetched).toEqual([]);
  });

  test("only takes metadata from its own iframe, and rejects an unsafe payload", async ({
    page,
  }) => {
    const fetched: string[] = [];
    await page.route(/evil\.example/, (route) => {
      fetched.push(route.request().url());
      return route.abort();
    });
    await recordMotion(page);
    await stubChild(page, "lightboxanimate");
    await page.goto("/page/12345/lightboxanimate/2");

    const spoofed = {
      sender: "regive",
      action: "lightbox-animations",
      value: {
        keyframes: [
          "@keyframes regive-lightbox-in { 0% { transform: translateX(555px); } 100% { transform: none; } }",
        ],
      },
    };
    // Right sender, wrong window: the top page itself
    await page.evaluate((message) => window.postMessage(message, "*"), spoofed);
    // Right window, wrong sender
    await postFromChild(page, "lightboxanimate", [
      { ...spoofed, sender: "not-regive" },
    ]);
    // Right window and sender, unsafe payloads
    await postFromChild(page, "lightboxanimate", [
      {
        sender: "regive",
        action: "lightbox-animations",
        value: {
          keyframes: [
            "@import url(https://evil.example/x.css); @keyframes regive-lightbox-in { 0% { opacity: 0; } }",
          ],
        },
      },
      {
        sender: "regive",
        action: "lightbox-animations",
        value: {
          keyframes: [
            "@keyframes regive-lightbox-in { 0% { opacity: 0; } } body { display: none; }",
          ],
        },
      },
      {
        sender: "regive",
        action: "lightbox-animations",
        value: "<style>body{display:none}</style>",
      },
      { sender: "regive", action: "loaded" },
      { sender: "regive", action: "enabled" },
    ]);
    await expect(page.getByRole("dialog")).toBeVisible();

    const entrance = await animationStart(page, "dialog", /^regive-lightbox-in--/);
    expect(transformsOf(entrance)).toEqual([
      "scale(0.8)",
      "scale(1.04)",
      "scale(1)",
    ]);
    await expect(page.locator("body")).toBeVisible();
    const parentCss = await page.evaluate(() =>
      Array.from(document.querySelectorAll("style"))
        .map((style) => style.textContent)
        .join("\n")
    );
    expect(parentCss).not.toContain("555px");
    expect(parentCss).not.toContain("evil.example");
    expect(fetched).toEqual([]);
  });
});

test.describe("compatibility", () => {
  test("without lightbox-animate nothing animates and closing is immediate", async ({
    page,
  }) => {
    await recordMotion(page);
    await page.goto("/page/12345/lightboxtest/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      page.frameLocator("iframe.regive-iframe").locator(".regive-amount-btn")
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const timeline = await timelineEntries(page);
    expect(timeline).not.toContain("message:lightbox-animations");
    expect(timeline.some((entry) => entry.startsWith("motion:"))).toBe(false);
    expect(timeline.filter((entry) => entry.startsWith("state:"))).toEqual([
      "state:open",
      "state:closed",
    ]);
    expect((await recorded(page)).motion).toEqual([]);
    await expect(lightboxRoot(page).locator("style")).toHaveCount(0);
  });

  test("lightbox-animate alone leaves the inline embed untouched", async ({
    page,
  }) => {
    await recordMotion(page);
    await page.goto("/page/12345/animatenolightbox/2");

    await expect(
      page.frameLocator("iframe.regive-iframe").locator(".regive-amount-btn")
    ).toHaveCount(1);
    await expect(page.locator(".regive-lightbox")).toHaveCount(0);
    await expect(page.locator(".en__component > .regive-container")).toHaveCount(
      1
    );
    await expect
      .poll(async () => (await timelineEntries(page)).includes("message:loaded"))
      .toBe(true);
    expect(await timelineEntries(page)).not.toContain(
      "message:lightbox-animations"
    );
  });
});

test.describe("reduced motion", () => {
  test("skips every motion when the donor prefers reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordMotion(page);
    await page.goto("/page/12345/lightboxanimate/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("transform", "none");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const timeline = await timelineEntries(page);
    expect(timeline).toContain("message:lightbox-animations");
    expect(timeline.some((entry) => entry.startsWith("motion:"))).toBe(false);
    expect(timeline).not.toContain("state:closing");
    expect((await recorded(page)).motion).toEqual([]);
  });

  test("completes a running exit as soon as reduced motion is switched on", async ({
    page,
  }) => {
    await recordMotion(page);
    await page.goto("/page/12345/lightboxanimatecustom/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await waitForEntrance(page);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-state",
      "closing"
    );

    await page.emulateMedia({ reducedMotion: "reduce" });

    await expect(dialog).toBeHidden();
    const closing = (await timeOf(page, "state:closing"))!;
    const closed = (await timeOf(page, "state:closed"))!;
    // Far sooner than the host page's 1500ms dismissal
    expect(closed - closing).toBeLessThan(1000);
    await expect(page.locator("body")).toHaveCSS("overflow", "visible");
  });
});

test.describe("submission with motion", () => {
  test("completes one real second donation, then leaves with the success motion", async ({
    page,
    context,
  }) => {
    test.setTimeout(45000);
    await seedTokens(context);
    await recordMotion(page);
    const submissions: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") submissions.push(request.url());
    });
    await page.goto("/page/12345/lightboxanimatereal/2");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await waitForEntrance(page);

    await page
      .frameLocator("iframe.regive-iframe")
      .locator('.regive-amount-btn[data-amount="5"]')
      .click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    const container = dialog.locator(".regive-container");
    await expect(container).toHaveClass(/regive-success/, { timeout: 10000 });
    await expect(page.locator("#host-component")).toHaveClass(/regive-success/);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toContain("/page/12345/donate/2");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("regive-num")))
      .toBeNull();

    await expect(lightboxRoot(page)).toHaveAttribute(
      "data-regive-lightbox-motion",
      "success-out",
      { timeout: 6000 }
    );
    await expect(dialog).toBeHidden({ timeout: 3000 });
    await expect(page.locator("#success-note")).toBeVisible();
    await animationStart(page, "dialog", /^regive-lightbox-success-out--/);
    const timeline = await timelineEntries(page);
    expect(timeline.filter((entry) => entry === "state:open")).toHaveLength(1);
    expect(timeline).not.toContain("motion:out");
    expect(submissions).toHaveLength(1);
  });
});
