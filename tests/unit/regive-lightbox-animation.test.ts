import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegiveLightbox } from "../../src/lib/regive-lightbox";
import {
  collectLightboxKeyframes,
  lightboxKeyframeDefaults,
  lightboxMotionHooks,
  parseLightboxAnimations,
} from "../../src/lib/regive-lightbox-keyframes";

// lightbox-animate: the entrance, dismissal and post-success exit motions.
// jsdom cascades animation longhands from stylesheets but never runs
// animations, so these tests drive the motion CSS with literal names and
// durations, fire animation events by hand and advance mocked time.

type Setup = {
  lightbox: RegiveLightbox;
  root: HTMLElement;
  dialog: HTMLElement;
  closeButton: HTMLButtonElement;
  container: HTMLElement;
  iframe: HTMLIFrameElement;
};

const setup = (options: { animate?: boolean } = {}): Setup => {
  const container = document.createElement("div");
  container.className = "regive-container";
  const iframe = document.createElement("iframe");
  iframe.className = "regive-iframe";
  container.appendChild(iframe);
  const lightbox = new RegiveLightbox({
    container,
    iframe,
    label: "Double your impact",
    animate: options.animate ?? true,
  });
  lightbox.mount();
  const root = lightbox.element;
  return {
    lightbox,
    root,
    dialog: root.querySelector('[role="dialog"]') as HTMLElement,
    closeButton: root.querySelector(
      ".regive-lightbox__close"
    ) as HTMLButtonElement,
    container,
    iframe,
  };
};

const open = (lightbox: RegiveLightbox) => {
  lightbox.markEnabled();
  lightbox.markLoaded();
};

const pressEscape = (target: EventTarget = document) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
  );

const clickOn = (target: HTMLElement) => {
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

const fireAnimation = (
  target: Element,
  type: "animationend" | "animationcancel",
  animationName: string
) => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "animationName", { value: animationName });
  target.dispatchEvent(event);
};

const scrollLocked = () =>
  document.body.getAttribute("data-regive-lightbox-open") === "true";
const motion = (root: HTMLElement) =>
  root.getAttribute("data-regive-lightbox-motion");
const hostButton = () =>
  document.getElementById("host-button") as HTMLButtonElement;

// Donor dismissals settle one task later (see requestDismiss)
const settle = () => vi.advanceTimersByTime(0);

// Timers still pending once zero-delay tasks have run. jsdom queues a 0ms
// selectionchange task whenever focus moves, which is not Regive's; the
// motion, success and grace timers are never zero-delay.
const pendingTimers = () => {
  settle();
  return vi.getTimerCount();
};

// Stand-in for the motion rules in style.scss, with literal animation names
// (jsdom does not resolve var()) and per-test timing
type MotionTiming = {
  name?: string;
  duration?: string;
  delay?: string;
  count?: string;
};
const motionStyle = document.createElement("style");
const setMotionCss = (
  dialog: Partial<Record<"in" | "out" | "success-out", MotionTiming>> = {},
  backdrop: Partial<Record<"in" | "out" | "success-out", MotionTiming>> = {}
) => {
  const defaults = {
    in: { name: "test-in", duration: "0.4s" },
    out: { name: "test-out", duration: "0.25s" },
    "success-out": { name: "test-success-out", duration: "0.3s" },
  };
  const declarations = (timing: MotionTiming) =>
    [
      timing.name !== undefined ? `animation-name: ${timing.name};` : "",
      timing.duration !== undefined
        ? `animation-duration: ${timing.duration};`
        : "",
      timing.delay !== undefined ? `animation-delay: ${timing.delay};` : "",
      timing.count !== undefined
        ? `animation-iteration-count: ${timing.count};`
        : "",
    ].join(" ");
  motionStyle.textContent = (["in", "out", "success-out"] as const)
    .map((kind) => {
      const dialogRule = `.regive-lightbox[data-regive-lightbox-motion="${kind}"] .regive-lightbox__dialog { ${declarations(
        { ...defaults[kind], ...dialog[kind] }
      )} }`;
      const backdropRule = backdrop[kind]
        ? `.regive-lightbox[data-regive-lightbox-motion="${kind}"] { ${declarations(
            backdrop[kind]!
          )} }`
        : "";
      return dialogRule + "\n" + backdropRule;
    })
    .join("\n");
};

// prefers-reduced-motion, switchable mid-test
let reducedMotion = false;
const reducedMotionListeners = new Set<(event: { matches: boolean }) => void>();
const setReducedMotion = (matches: boolean) => {
  reducedMotion = matches;
  reducedMotionListeners.forEach((listener) => listener({ matches }));
};

const keyframesStyleText = (root: HTMLElement) =>
  root.querySelector("style")?.textContent ?? "";
const keyframesName = (root: HTMLElement, hook: string) =>
  root.style.getPropertyValue(`--${hook}-keyframes`).trim();

// Tests run from the repository root (npm test)
const repoRoot = process.cwd();

const customIn =
  "@keyframes regive-lightbox-in { 0% { opacity: 0; transform: translateY(-200px) rotate(-12deg); } 100% { opacity: 1; transform: translateY(0) rotate(0deg); } }";

beforeEach(() => {
  vi.useFakeTimers();
  document.head.appendChild(motionStyle);
  setMotionCss();
  document.body.innerHTML = '<button id="host-button">Host</button>';
  document.body.removeAttribute("data-regive-lightbox-open");
  reducedMotion = false;
  reducedMotionListeners.clear();
  window.matchMedia = vi.fn((query: string) => ({
    get matches() {
      return query.includes("prefers-reduced-motion: reduce") && reducedMotion;
    },
    media: query,
    onchange: null,
    addEventListener: (
      _type: string,
      listener: (event: { matches: boolean }) => void
    ) => reducedMotionListeners.add(listener),
    removeEventListener: (
      _type: string,
      listener: (event: { matches: boolean }) => void
    ) => reducedMotionListeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.useRealTimers();
  motionStyle.remove();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("lightbox-animate opt-in", () => {
  it("keeps the instant, unanimated lifecycle when animate is off", () => {
    const { lightbox, root } = setup({ animate: false });
    const states: Array<string | null> = [];
    new MutationObserver(() =>
      states.push(root.getAttribute("data-regive-lightbox-state"))
    ).observe(root, { attributeFilter: ["data-regive-lightbox-state"] });

    open(lightbox);
    expect(motion(root)).toBeNull();
    expect(root.querySelector("style")).toBeNull();
    expect(keyframesName(root, "regive-lightbox-in")).toBe("");
    expect(lightbox.acceptAnimations({ keyframes: [customIn] })).toBe(false);
    expect(root.querySelector("style")).toBeNull();

    pressEscape();
    settle();
    expect(lightbox.state).toBe("closed");
    expect(root.hidden).toBe(true);
    expect(motion(root)).toBeNull();
    return Promise.resolve().then(() =>
      expect(states).not.toContain("closing")
    );
  });

  it("plays the entrance once the child is ready, without delaying focus or interaction", () => {
    const { lightbox, root, dialog } = setup();
    hostButton().focus();

    lightbox.markEnabled();
    expect(motion(root)).toBeNull();
    lightbox.markLoaded();

    expect(lightbox.state).toBe("open");
    expect(motion(root)).toBe("in");
    expect(document.activeElement).toBe(dialog);
    expect(root.hasAttribute("inert")).toBe(false);
    expect(scrollLocked()).toBe(true);

    vi.advanceTimersByTime(399);
    expect(motion(root)).toBe("in");
    vi.advanceTimersByTime(1);
    expect(motion(root)).toBeNull();
    expect(lightbox.state).toBe("open");
  });
});

describe("lightbox-animate closing phase", () => {
  it("keeps the dialog visible and modal, but inert to input, until the dismissal motion finishes", () => {
    const { lightbox, root, dialog, closeButton, container } = setup();
    hostButton().focus();
    open(lightbox);
    vi.advanceTimersByTime(400);
    closeButton.focus();

    pressEscape();
    settle();

    expect(lightbox.state).toBe("closing");
    expect(root.getAttribute("data-regive-lightbox-state")).toBe("closing");
    expect(motion(root)).toBe("out");
    expect(root.hidden).toBe(false);
    expect(scrollLocked()).toBe(true);
    expect(document.activeElement).toBe(dialog);
    expect(closeButton.hasAttribute("inert")).toBe(true);
    expect(container.hasAttribute("inert")).toBe(true);
    // The backdrop itself must stay hit-testable so clicks never reach the page
    expect(root.hasAttribute("inert")).toBe(false);

    // Every way out (and back in) is a no-op while closing
    pressEscape();
    clickOn(closeButton);
    clickOn(root);
    settle();
    expect(lightbox.dismiss()).toBe(false);
    hostButton().focus();
    expect(document.activeElement).toBe(dialog);

    vi.advanceTimersByTime(249);
    expect(lightbox.state).toBe("closing");
    vi.advanceTimersByTime(1);
    expect(lightbox.state).toBe("closed");
    expect(root.getAttribute("data-regive-lightbox-state")).toBe("closed");
    expect(root.hidden).toBe(true);
    expect(motion(root)).toBeNull();
    expect(scrollLocked()).toBe(false);
    expect(document.activeElement).toBe(hostButton());
  });

  it("restores focus exactly once, even when removed after closing", () => {
    const { lightbox } = setup();
    hostButton().focus();
    open(lightbox);
    const focusSpy = vi.spyOn(hostButton(), "focus");

    pressEscape();
    settle();
    vi.advanceTimersByTime(250);
    lightbox.remove();

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("uses the success-out hook after the 3500ms thank-you hold", () => {
    const { lightbox, root } = setup();
    hostButton().focus();
    open(lightbox);
    lightbox.markLoading();
    lightbox.markSuccess();

    vi.advanceTimersByTime(3499);
    expect(lightbox.state).toBe("open");
    vi.advanceTimersByTime(1);
    expect(lightbox.state).toBe("closing");
    expect(motion(root)).toBe("success-out");
    expect(root.hidden).toBe(false);
    vi.advanceTimersByTime(299);
    expect(lightbox.state).toBe("closing");
    vi.advanceTimersByTime(1);
    expect(lightbox.state).toBe("closed");
    expect(scrollLocked()).toBe(false);
    expect(document.activeElement).toBe(hostButton());
  });

  it("uses the dismissal hook when the donor closes the thank-you early", () => {
    const { lightbox, root } = setup();
    open(lightbox);
    lightbox.markSuccess();

    pressEscape();
    settle();
    expect(motion(root)).toBe("out");
    vi.advanceTimersByTime(250);
    expect(lightbox.state).toBe("closed");
    // The cancelled success timer never starts a second exit
    vi.advanceTimersByTime(5000);
    expect(lightbox.state).toBe("closed");
    expect(motion(root)).toBeNull();
  });

  it("switches straight from the entrance to the dismissal motion", () => {
    setMotionCss({ in: { duration: "1s" }, out: { duration: "0.3s" } });
    const { lightbox, root } = setup();
    open(lightbox);
    vi.advanceTimersByTime(100);
    expect(motion(root)).toBe("in");

    pressEscape();
    settle();
    expect(lightbox.state).toBe("closing");
    expect(motion(root)).toBe("out");
    // The entrance's cancellation arrives late and must not end the exit
    fireAnimation(root.querySelector(".regive-lightbox__dialog")!, "animationcancel", "test-in");
    expect(lightbox.state).toBe("closing");

    vi.advanceTimersByTime(299);
    expect(lightbox.state).toBe("closing");
    vi.advanceTimersByTime(1);
    expect(lightbox.state).toBe("closed");
    // The entrance's old deadline is gone too
    vi.advanceTimersByTime(2000);
    expect(lightbox.state).toBe("closed");
    expect(pendingTimers()).toBe(0);
  });

  it("never reopens or restarts the exit from late child messages", () => {
    const { lightbox, root } = setup();
    open(lightbox);
    pressEscape();
    settle();
    expect(lightbox.state).toBe("closing");

    lightbox.markLoaded();
    lightbox.markEnabled();
    lightbox.markSuccess();
    lightbox.markLoading();
    lightbox.close();
    // close() is the immediate system close (nothing left to show)
    expect(lightbox.state).toBe("closed");

    lightbox.markLoaded();
    lightbox.markEnabled();
    lightbox.markSuccess();
    vi.advanceTimersByTime(10000);
    expect(lightbox.state).toBe("closed");
    expect(root.hidden).toBe(true);
    expect(motion(root)).toBeNull();
    expect(scrollLocked()).toBe(false);
  });

  it("closes without motion when regive has nothing left to show", () => {
    const { lightbox, root } = setup();
    open(lightbox);
    vi.advanceTimersByTime(400);

    lightbox.close();

    expect(lightbox.state).toBe("closed");
    expect(root.hidden).toBe(true);
    expect(motion(root)).toBeNull();
    expect(scrollLocked()).toBe(false);
  });

  it("finishes as soon as the dialog's exit animation is cancelled", () => {
    const { lightbox, dialog } = setup();
    open(lightbox);
    pressEscape();
    settle();

    fireAnimation(dialog, "animationcancel", "test-out");

    expect(lightbox.state).toBe("closed");
    expect(pendingTimers()).toBe(0);
  });

  it("finishes on animationend without waiting for the deadline", () => {
    const { lightbox, dialog } = setup();
    open(lightbox);
    pressEscape();
    settle();

    fireAnimation(dialog, "animationend", "test-out");

    expect(lightbox.state).toBe("closed");
  });

  it("ignores animation events from other elements or other motions", () => {
    const { lightbox, dialog, container } = setup();
    open(lightbox);
    pressEscape();
    settle();

    fireAnimation(dialog, "animationend", "test-in");
    fireAnimation(dialog, "animationcancel", "spin");
    // The container's loading spinner bubbles through the dialog
    fireAnimation(container, "animationend", "test-out");
    fireAnimation(container, "animationcancel", "test-out");
    expect(lightbox.state).toBe("closing");

    vi.advanceTimersByTime(250);
    expect(lightbox.state).toBe("closed");
  });

  it("releases focus and the scroll lock once when removed mid-exit, leaving no timers", () => {
    const { lightbox, root } = setup();
    hostButton().focus();
    open(lightbox);
    const focusSpy = vi.spyOn(hostButton(), "focus");
    pressEscape();
    settle();

    lightbox.remove();

    expect(lightbox.state).toBe("removed");
    expect(root.isConnected).toBe(false);
    expect(scrollLocked()).toBe(false);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(pendingTimers()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(lightbox.state).toBe("removed");
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("releases when the host page removes the lightbox mid-exit", async () => {
    const { lightbox, root } = setup();
    hostButton().focus();
    open(lightbox);
    pressEscape();
    settle();

    root.remove();
    await Promise.resolve();
    await Promise.resolve();

    expect(lightbox.state).toBe("removed");
    expect(scrollLocked()).toBe(false);
    expect(document.activeElement).toBe(hostButton());
    expect(pendingTimers()).toBe(0);
  });

  it("keeps a stacked lightbox from taking Escape until the top one has finished closing", () => {
    const first = setup();
    const second = setup();
    open(first.lightbox);
    open(second.lightbox);

    pressEscape();
    settle();
    expect(second.lightbox.state).toBe("closing");
    pressEscape();
    settle();
    expect(first.lightbox.state).toBe("open");

    vi.advanceTimersByTime(250);
    expect(second.lightbox.state).toBe("closed");
    expect(document.activeElement).toBe(first.dialog);
    expect(scrollLocked()).toBe(true);
  });
});

describe("lightbox-animate timing fallbacks", () => {
  it("closes immediately when the exit has zero duration", () => {
    setMotionCss({ out: { duration: "0s" } });
    const { lightbox } = setup();
    open(lightbox);
    pressEscape();
    settle();
    expect(lightbox.state).toBe("closed");
  });

  it("opens and closes immediately when no motion CSS applies", () => {
    motionStyle.remove();
    const { lightbox, root } = setup();
    open(lightbox);
    expect(lightbox.state).toBe("open");
    expect(motion(root)).toBeNull();
    pressEscape();
    settle();
    expect(lightbox.state).toBe("closed");
  });

  it("closes immediately when the animation name is none", () => {
    setMotionCss({ out: { name: "none" } });
    const { lightbox } = setup();
    open(lightbox);
    pressEscape();
    settle();
    expect(lightbox.state).toBe("closed");
  });

  it("closes immediately when the duration cannot be read", () => {
    setMotionCss({ out: { duration: "soon" } });
    const { lightbox } = setup();
    open(lightbox);
    pressEscape();
    settle();
    expect(lightbox.state).toBe("closed");
  });

  it("cuts an infinite animation off at the 2s cap", () => {
    setMotionCss({ out: { duration: "0.25s", count: "infinite" } });
    const { lightbox } = setup();
    open(lightbox);
    pressEscape();
    settle();
    vi.advanceTimersByTime(1999);
    expect(lightbox.state).toBe("closing");
    vi.advanceTimersByTime(1);
    expect(lightbox.state).toBe("closed");
  });

  it("cuts an overlong animation off at the 2s cap", () => {
    setMotionCss({ in: { duration: "100s" } });
    const { lightbox, root } = setup();
    open(lightbox);
    vi.advanceTimersByTime(1999);
    expect(motion(root)).toBe("in");
    vi.advanceTimersByTime(1);
    expect(motion(root)).toBeNull();
  });

  it("counts the delay and the iteration count toward the deadline", () => {
    setMotionCss({ out: { duration: "100ms", delay: "50ms", count: "2" } });
    const { lightbox } = setup();
    open(lightbox);
    pressEscape();
    settle();
    vi.advanceTimersByTime(249);
    expect(lightbox.state).toBe("closing");
    vi.advanceTimersByTime(1);
    expect(lightbox.state).toBe("closed");
  });

  it("waits for the longer of the backdrop and dialog animations", () => {
    setMotionCss(
      { out: { duration: "0.25s" } },
      { out: { name: "test-backdrop-out", duration: "0.5s" } }
    );
    const { lightbox, root, dialog } = setup();
    open(lightbox);
    pressEscape();
    settle();

    fireAnimation(dialog, "animationend", "test-out");
    expect(lightbox.state).toBe("closing");
    fireAnimation(root, "animationend", "test-backdrop-out");
    expect(lightbox.state).toBe("closed");
  });

  it("finishes at the backdrop's deadline when its end event never fires", () => {
    setMotionCss(
      { out: { duration: "0.25s" } },
      { out: { name: "test-backdrop-out", duration: "0.5s" } }
    );
    const { lightbox } = setup();
    open(lightbox);
    pressEscape();
    settle();
    vi.advanceTimersByTime(499);
    expect(lightbox.state).toBe("closing");
    vi.advanceTimersByTime(1);
    expect(lightbox.state).toBe("closed");
  });
});

describe("lightbox-animate and prefers-reduced-motion", () => {
  it("skips every motion when reduced motion is preferred at load", () => {
    setReducedMotion(true);
    const { lightbox, root } = setup();
    hostButton().focus();
    open(lightbox);
    expect(lightbox.state).toBe("open");
    expect(motion(root)).toBeNull();

    lightbox.markSuccess();
    vi.advanceTimersByTime(3500);
    expect(lightbox.state).toBe("closed");
    expect(motion(root)).toBeNull();
    expect(document.activeElement).toBe(hostButton());
  });

  it("skips the dismissal motion when reduced motion is preferred", () => {
    setReducedMotion(true);
    const { lightbox } = setup();
    open(lightbox);
    pressEscape();
    settle();
    expect(lightbox.state).toBe("closed");
  });

  it("completes a running motion as soon as reduced motion is switched on", () => {
    setMotionCss({ out: { duration: "1.5s" } });
    const { lightbox, root } = setup();
    open(lightbox);
    pressEscape();
    settle();
    expect(lightbox.state).toBe("closing");
    expect(reducedMotionListeners.size).toBe(1);

    setReducedMotion(true);

    expect(lightbox.state).toBe("closed");
    expect(motion(root)).toBeNull();
    expect(reducedMotionListeners.size).toBe(0);
    expect(pendingTimers()).toBe(0);
  });

  it("stops listening for reduced-motion changes once the entrance is done", () => {
    const { lightbox } = setup();
    open(lightbox);
    expect(reducedMotionListeners.size).toBe(1);
    vi.advanceTimersByTime(400);
    expect(reducedMotionListeners.size).toBe(0);
  });
});

describe("lightbox-animate keyframes from the child", () => {
  it("installs the default motions under names private to this lightbox", () => {
    const { root } = setup();
    const styleText = keyframesStyleText(root);

    lightboxMotionHooks.forEach((hook) => {
      const name = keyframesName(root, hook);
      expect(name).toMatch(new RegExp(`^${hook}--[a-z0-9]+$`));
      expect(styleText).toContain(`@keyframes ${name} {`);
    });
    // The public names are never defined on the host page
    expect(styleText).not.toMatch(/@keyframes regive-lightbox-(in|out|success-out) /);
    // The default entrance grows, overshoots once and settles
    expect(styleText).toContain("scale(1.04)");
  });

  it("accepts the selected template's keyframes before the dialog opens", () => {
    const { lightbox, root } = setup();
    const before = keyframesStyleText(root);

    expect(lightbox.acceptAnimations({ keyframes: [customIn] })).toBe(true);

    const styleText = keyframesStyleText(root);
    const inName = keyframesName(root, "regive-lightbox-in");
    expect(styleText).toContain(
      `@keyframes ${inName} { 0% { opacity: 0; transform: translateY(-200px) rotate(-12deg); } 100% { opacity: 1; transform: translateY(0) rotate(0deg); } }`
    );
    // Hooks the payload did not carry keep their defaults
    const outRule = (text: string) =>
      text.slice(text.indexOf(`@keyframes ${keyframesName(root, "regive-lightbox-out")}`));
    expect(outRule(styleText).split("@keyframes")[1]).toBe(
      outRule(before).split("@keyframes")[1]
    );
  });

  it("keeps each lightbox's keyframes to itself", () => {
    const first = setup();
    const second = setup();
    const secondBefore = keyframesStyleText(second.root);

    expect(first.lightbox.acceptAnimations({ keyframes: [customIn] })).toBe(true);

    expect(keyframesStyleText(second.root)).toBe(secondBefore);
    expect(keyframesName(first.root, "regive-lightbox-in")).not.toBe(
      keyframesName(second.root, "regive-lightbox-in")
    );
    expect(keyframesStyleText(second.root)).not.toContain("rotate(-12deg)");
  });

  it("ignores keyframes once the dialog has opened, closed or been removed", () => {
    const { lightbox, root } = setup();
    open(lightbox);
    const before = keyframesStyleText(root);
    expect(lightbox.acceptAnimations({ keyframes: [customIn] })).toBe(false);
    pressEscape();
    settle();
    expect(lightbox.acceptAnimations({ keyframes: [customIn] })).toBe(false);
    vi.advanceTimersByTime(250);
    expect(lightbox.acceptAnimations({ keyframes: [customIn] })).toBe(false);
    lightbox.remove();
    expect(lightbox.acceptAnimations({ keyframes: [customIn] })).toBe(false);
    expect(keyframesStyleText(root)).toBe(before);
  });

  const valid = (body: string, name = "regive-lightbox-in") =>
    `@keyframes ${name} { ${body} }`;
  const rejected: Array<[string, unknown]> = [
    ["null", null],
    ["a string", customIn],
    ["an array", [customIn]],
    ["a number", 42],
    ["keyframes that are not a list", { keyframes: customIn }],
    ["an empty list", { keyframes: [] }],
    [
      "more than three rules",
      {
        keyframes: [
          customIn,
          valid("0% { opacity: 1; }", "regive-lightbox-out"),
          valid("0% { opacity: 1; }", "regive-lightbox-success-out"),
          valid("0% { opacity: 0; }"),
        ],
      },
    ],
    ["unknown fields", { keyframes: [customIn], css: "body{}" }],
    ["non-string entries", { keyframes: [123] }],
    [
      "an oversized rule",
      { keyframes: [valid(`0% { opacity: 0; } ${"50% { opacity: 0.5; } ".repeat(200)}`)] },
    ],
    ["an unknown keyframes name", { keyframes: [valid("0% { opacity: 0; }", "spin")] }],
    ["a duplicated hook", { keyframes: [customIn, customIn] }],
    [
      "@import",
      {
        keyframes: [
          `@import url(https://evil.example/x.css); ${customIn}`,
        ],
      },
    ],
    [
      "a url() value",
      { keyframes: [valid("0% { filter: url(https://evil.example/f.svg#x); }")] },
    ],
    [
      "an image-set() value",
      { keyframes: [valid("0% { filter: image-set(x 1x); }")] },
    ],
    [
      "a global selector after the rule",
      { keyframes: [`${valid("0% { opacity: 0; }")} body { display: none; }`] },
    ],
    ["a selector inside the rule", { keyframes: [valid("body { opacity: 0; }")] }],
    ["a universal selector", { keyframes: [valid("* { opacity: 0; }")] }],
    [
      "a nested at-rule",
      { keyframes: [valid("@media screen { 0% { opacity: 0; } }")] },
    ],
    [
      "a brace breakout",
      {
        keyframes: [
          valid("0% { opacity: 0; } } * { color: red; } @keyframes x { 0% { opacity: 1; }"),
        ],
      },
    ],
    ["HTML", { keyframes: [`</style><script>alert(1)</script>${customIn}`] }],
    ["a CSS escape", { keyframes: [valid("0% { filter: u\\72l(x); }")] }],
    ["a comment", { keyframes: [valid("0% { /* hi */ opacity: 0; }")] }],
    ["a quoted string", { keyframes: [valid('0% { opacity: "0"; }')] }],
    ["!important", { keyframes: [valid("0% { opacity: 0 !important; }")] }],
    ["a disallowed property", { keyframes: [valid("0% { background-color: red; }")] }],
    ["display", { keyframes: [valid("0% { display: none; }")] }],
    ["a custom property", { keyframes: [valid("0% { --x: 1; }")] }],
    ["attr()", { keyframes: [valid("0% { opacity: attr(data-x); }")] }],
    ["var()", { keyframes: [valid("0% { opacity: var(--x); }")] }],
    ["env()", { keyframes: [valid("0% { opacity: env(x); }")] }],
    ["expression()", { keyframes: [valid("0% { opacity: expression(alert(1)); }")] }],
    ["an out-of-range keyframe", { keyframes: [valid("150% { opacity: 0; }")] }],
    ["an empty rule", { keyframes: [valid("")] }],
    ["unbalanced parentheses", { keyframes: [valid("0% { transform: scale(1; }")] }],
    [
      "too many keyframes",
      {
        keyframes: [
          valid(
            Array.from({ length: 33 }, (_, i) => `${i * 3}% { opacity: 1; }`).join(" ")
          ),
        ],
      },
    ],
  ];

  it.each(rejected)("rejects %s and keeps the current motions", (_label, value) => {
    const { lightbox, root } = setup();
    const before = keyframesStyleText(root);
    expect(parseLightboxAnimations(value)).toHaveProperty("error");
    expect(lightbox.acceptAnimations(value)).toBe(false);
    expect(keyframesStyleText(root)).toBe(before);
  });

  it("accepts the serializations browsers produce", () => {
    const serializations = [
      // Chrome / Safari
      "@keyframes regive-lightbox-in { \n  0% { opacity: 0; transform: scale(0.8); }\n  60% { opacity: 1; transform: scale(1.04); animation-timing-function: cubic-bezier(0.3, 0, 0.3, 1); }\n  100% { transform: scale(1); }\n}",
      // jsdom-style, from/to keyframe selectors
      "@keyframes regive-lightbox-out { \n  from {opacity: 1; transform: none;} \n  to {opacity: 0; transform: translateY(16px) scale(0.9);} \n}",
      // Selector lists and decimals
      "@keyframes regive-lightbox-success-out { 0%, 50.5% { opacity: 1; filter: drop-shadow(rgba(0, 0, 0, 0.5) 0px 0px 4px); } 100% { opacity: 0; translate: 0px -24px; scale: 0.96; rotate: 4deg; transform-origin: center top; } }",
    ];
    const result = parseLightboxAnimations({ keyframes: serializations });
    expect(result).not.toHaveProperty("error");
    const { lightbox, root } = setup();
    expect(lightbox.acceptAnimations({ keyframes: serializations })).toBe(true);
    const styleText = keyframesStyleText(root);
    expect(styleText).toContain("50.5%");
    expect(styleText).toContain("100% { opacity: 0; transform: translateY(16px) scale(0.9); }");
  });

  it("ships defaults that pass its own validation", () => {
    const result = parseLightboxAnimations({
      keyframes: lightboxMotionHooks.map((hook) => lightboxKeyframeDefaults[hook]),
    });
    expect(result).not.toHaveProperty("error");
  });
});

describe("collectLightboxKeyframes (embedded page)", () => {
  const banner = (styles: string[]) => {
    const element = document.createElement("div");
    element.className = "regive-embed";
    element.innerHTML = styles.map((css) => `<style>${css}</style>`).join("");
    document.body.appendChild(element);
    return element;
  };
  const defaultsCss = lightboxMotionHooks
    .map((hook) => lightboxKeyframeDefaults[hook])
    .join("\n");
  const byName = (rules: string[]) =>
    Object.fromEntries(
      rules.map((rule) => [/@keyframes\s+([\w-]+)/.exec(rule)![1], rule])
    );

  it("collects the built-in template's default motions", () => {
    const rules = collectLightboxKeyframes(banner([defaultsCss]));
    expect(rules).toHaveLength(3);
    expect(parseLightboxAnimations({ keyframes: rules })).not.toHaveProperty("error");
    expect(byName(rules)["regive-lightbox-in"]).toContain("scale(1.04)");
  });

  it("lets the selected template's later rules win, hook by hook", () => {
    const rules = byName(
      collectLightboxKeyframes(
        banner([
          defaultsCss,
          customIn,
          "@keyframes regive-lightbox-out { 0% { opacity: 1; } 100% { opacity: 0; transform: translateY(80px); } }",
        ])
      )
    );
    expect(rules["regive-lightbox-in"]).toContain("rotate(-12deg)");
    expect(rules["regive-lightbox-out"]).toContain("translateY(80px)");
    expect(rules["regive-lightbox-success-out"]).toBe(
      byName(collectLightboxKeyframes(banner([defaultsCss])))[
        "regive-lightbox-success-out"
      ]
    );
  });

  it("falls back to the default for a hook whose template rule is not allowed", () => {
    const rules = byName(
      collectLightboxKeyframes(
        banner([
          defaultsCss,
          "@keyframes regive-lightbox-in { 0% { background-color: red; } 100% { background-color: blue; } }",
          "@keyframes regive-lightbox-out { 0% { opacity: 1; } 100% { opacity: 0; transform: translateY(80px); } }",
        ])
      )
    );
    expect(rules["regive-lightbox-in"]).toContain("scale(1.04)");
    expect(rules["regive-lightbox-in"]).not.toContain("background-color");
    expect(rules["regive-lightbox-out"]).toContain("translateY(80px)");
  });

  // The README's example and the root fixture's templates must work as
  // written: every hook they define is used, none falls back
  const fromRepo = (file: string) =>
    readFileSync(path.join(repoRoot, file), "utf8");
  const renderTemplate = (markup: string) => {
    const element = document.createElement("div");
    element.className = "regive-embed";
    // Merge tags are resolved before render on a real page
    element.innerHTML = `<style>${defaultsCss}</style>${markup.replace(
      /{{[a-z-]+}}/g,
      "0"
    )}`;
    document.body.appendChild(element);
    return element;
  };
  it.each([
    [
      "the README example",
      () =>
        /```html\n<template id="my-custom-theme">([\s\S]*?)<\/template>\n```/g
          .exec(
            fromRepo("README.md").slice(
              fromRepo("README.md").indexOf("#### Lightbox Animations")
            )
          )![1],
      {
        "regive-lightbox-in": "translateY(40px) scale(0.9)",
        "regive-lightbox-out": "scale(0.9)",
        "regive-lightbox-success-out": "translateY(-40px)",
      },
    ],
    [
      "test-page-1.html test-theme",
      () =>
        new DOMParser()
          .parseFromString(fromRepo("test-page-1.html"), "text/html")
          .getElementById("test-theme")!.innerHTML,
      {
        "regive-lightbox-in": "rotate(-3deg)",
        "regive-lightbox-out": "translateY(40px) scale(0.95)",
        "regive-lightbox-success-out": "scale(1.04)",
      },
    ],
    [
      "test-page-1.html tier-champion",
      () =>
        new DOMParser()
          .parseFromString(fromRepo("test-page-1.html"), "text/html")
          .getElementById("tier-champion")!.innerHTML,
      { "regive-lightbox-in": "scale(1.08) rotate(1deg)" },
    ],
  ] as const)("uses every hook %s defines", (_label, markup, expected) => {
    const log = vi.fn();
    const rules = byName(collectLightboxKeyframes(renderTemplate(markup()), log));
    expect(log).not.toHaveBeenCalled();
    Object.entries(expected).forEach(([hook, transform]) =>
      expect(rules[hook]).toContain(transform)
    );
  });

  it("only reads the banner's own stylesheets", () => {
    const pageStyle = document.createElement("style");
    pageStyle.textContent =
      "@keyframes regive-lightbox-in { 0% { opacity: 0; transform: translateX(999px); } 100% { opacity: 1; } }";
    document.head.appendChild(pageStyle);
    const rules = byName(collectLightboxKeyframes(banner([defaultsCss])));
    pageStyle.remove();
    expect(rules["regive-lightbox-in"]).not.toContain("999px");
  });
});
