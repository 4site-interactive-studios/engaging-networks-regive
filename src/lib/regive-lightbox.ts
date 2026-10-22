import { ENGrid } from "./engrid";
import {
  LightboxKeyframes,
  LightboxMotionHook,
  defaultLightboxKeyframes,
  lightboxMotionHooks,
  parseLightboxAnimations,
  serializeKeyframes,
} from "./regive-lightbox-keyframes";

/**
 * Lifecycle of a lightbox:
 * - pending: in the DOM so the chained iframe loads and lays out at its real
 *   width, but invisible and inert until the child reports it is ready
 * - open: visible modal dialog, page scroll locked, focus contained
 * - closing: (lightbox-animate only) the exit motion is playing - still
 *   visible and modal, but the banner and close button take no input
 * - closed: dismissed or finished - hidden for good, never reopens
 * - removed: the child exited - taken out of the DOM
 */
export type RegiveLightboxState =
  | "pending"
  | "open"
  | "closing"
  | "closed"
  | "removed";

type RegiveLog = (message: string, emoji?: string, data?: unknown) => void;

export interface RegiveLightboxOptions {
  /** The parent page's .regive-container (carrying the chained iframe) */
  container: HTMLElement;
  /** The chained iframe inside the container */
  iframe: HTMLIFrameElement;
  /** The lightbox-width attribute: any valid CSS width */
  width?: string | null;
  /** The heading attribute, used as text only for the dialog's name */
  label?: string | null;
  /** The EN component the <regive> tag lived in, before it was moved */
  hostComponent?: Element | null;
  /** The lightbox-animate attribute: play the entrance and exit motions */
  animate?: boolean;
  log?: RegiveLog;
}

// The three motions, by the data-regive-lightbox-motion value that plays them
type LightboxMotion = "in" | "out" | "success-out";

// A motion in progress: the animations still running, by element, and the
// one way to end it
interface RunningMotion {
  readonly animations: Map<Element, string>;
  readonly finish: () => void;
}

// How long the thank-you message stays up before the dialog closes itself
const successCloseDelay = 3500;
// After a submission navigates the iframe, a page that never reports back
// (a network error page, an unexpected redirect) must not trap the donor in
// an undismissable dialog - release the lock after this grace period
const unreportedPageGracePeriod = 5000;
// No motion holds the dialog longer than this, whatever the CSS says
// (overlong or infinite animations are cut off here)
const maxMotionTime = 2000;
const defaultLabel = "Additional donation";
const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

// Open lightboxes, oldest first. With several <regive lightbox> tags only the
// newest one contains focus and takes Escape, so stacked dialogs never fight
// over focus, and the page scroll lock lasts until the last one closes.
const openLightboxes: RegiveLightbox[] = [];

// Suffix for the @keyframes names private to one lightbox, so one template's
// motion can never change another lightbox's or the host page's
let motionKeyCount = 0;
const createMotionKey = () =>
  `${(++motionKeyCount).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// A CSS <time> in milliseconds, or NaN
const parseCssTime = (value: string): number => {
  const match = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(ms|s)$/i.exec(
    value.trim()
  );
  if (!match) return NaN;
  return parseFloat(match[1]) * (match[2].toLowerCase() === "s" ? 1000 : 1);
};

// The animation an element is running and how long it lasts, from its
// computed style. A missing, "none", zero-length or unreadable animation
// lasts 0ms; an infinite one lasts forever (the caller caps it).
const readMotionTiming = (
  element: Element
): { name: string; time: number } => {
  const style = window.getComputedStyle(element);
  const first = (property: string) =>
    style.getPropertyValue(property).split(",")[0].trim();
  const name = first("animation-name");
  if (!name || name === "none") return { name, time: 0 };
  const duration = parseCssTime(first("animation-duration"));
  if (!(duration > 0)) return { name, time: 0 };
  const delay = parseCssTime(first("animation-delay"));
  const countText = first("animation-iteration-count");
  const count =
    countText === "infinite"
      ? Infinity
      : countText === ""
        ? 1
        : parseFloat(countText);
  if (!(count > 0)) return { name, time: 0 };
  return {
    name,
    time: Math.max(0, (Number.isFinite(delay) ? delay : 0) + duration * count),
  };
};

const motionHooks: Record<LightboxMotion, LightboxMotionHook> = {
  in: "regive-lightbox-in",
  out: "regive-lightbox-out",
  "success-out": "regive-lightbox-success-out",
};

/**
 * Opt-in modal presentation (<regive lightbox="true">) of the parent page's
 * existing regive container. It never touches the payment flow: it only
 * reacts to the child messages the parent has already validated and routed
 * to this container's iframe.
 */
export class RegiveLightbox {
  public readonly element: HTMLDivElement;
  public readonly hostComponent: Element | null;
  private readonly dialog: HTMLDivElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly container: HTMLElement;
  private readonly iframe: HTMLIFrameElement;
  private readonly log: RegiveLog;
  private readonly animate: boolean;
  // This lightbox's own copy of the motions (lightbox-animate only), under
  // the private names in keyframeNames
  private readonly keyframesStyle: HTMLStyleElement | null = null;
  private readonly keyframeNames: Record<LightboxMotionHook, string> | null =
    null;
  private currentState: RegiveLightboxState = "pending";
  private isLoaded = false;
  private isEnabled = false;
  private busy = false;
  private succeeded = false;
  // True from opening until release(): the scroll lock, focus containment
  // and return focus are this lightbox's to give back, exactly once
  private holdsPage = false;
  private returnFocus: HTMLElement | null = null;
  private successTimer: number | undefined;
  private graceTimer: number | undefined;
  private motion: RunningMotion | null = null;
  private motionTimer: number | undefined;
  private motionQuery: MediaQueryList | null = null;
  private pressStartedOnBackdrop = false;
  private removalObserver: MutationObserver | null = null;
  private readonly frameDocuments = new WeakSet<Document>();

  constructor(options: RegiveLightboxOptions) {
    this.container = options.container;
    this.iframe = options.iframe;
    this.hostComponent = options.hostComponent ?? null;
    this.log = options.log ?? (() => {});
    this.animate = options.animate === true;
    const label = RegiveLightbox.textOf(options.label) || defaultLabel;

    // Built with DOM APIs only - attribute values never pass through HTML
    this.element = document.createElement("div");
    this.element.className = "regive-lightbox";
    this.element.setAttribute("data-regive-lightbox-state", "pending");
    this.element.setAttribute("inert", "");

    this.dialog = document.createElement("div");
    this.dialog.className = "regive-lightbox__dialog";
    this.dialog.setAttribute("role", "dialog");
    this.dialog.setAttribute("aria-modal", "true");
    this.dialog.setAttribute("aria-label", label);
    this.dialog.tabIndex = -1;
    ["--regive-bg-color", "--regive-txt-color"].forEach((property) => {
      const value = options.container.style.getPropertyValue(property);
      if (value) this.dialog.style.setProperty(property, value);
    });
    const width = options.width?.trim();
    if (width) {
      // The CSS parser rejects anything that is not a valid width, in which
      // case the stylesheet default (450px) applies
      this.dialog.style.width = width;
      if (!this.dialog.style.width) {
        this.log(
          `Ignoring invalid lightbox-width "${width}" - using the default`,
          "⚠️"
        );
      }
    }

    this.closeButton = document.createElement("button");
    this.closeButton.type = "button";
    this.closeButton.className = "regive-lightbox__close";
    this.closeButton.setAttribute("aria-label", "Close");
    this.closeButton.addEventListener("click", () => this.requestDismiss());

    if (!this.iframe.title) {
      this.iframe.title = label;
    }

    this.dialog.append(this.closeButton, options.container);
    // While closing, the banner and close button are inert, so both guards
    // hold focus on the dialog itself
    this.element.append(
      this.createFocusGuard(() =>
        this.currentState === "closing" ? this.focusDialog() : this.focusLast()
      ),
      this.dialog,
      this.createFocusGuard(() =>
        this.currentState === "closing" ? this.focusDialog() : this.focusFirst()
      )
    );

    if (this.animate) {
      // Start from the built-in motions under names private to this
      // lightbox; the CSS picks them up through these custom properties
      const key = createMotionKey();
      const names = {} as Record<LightboxMotionHook, string>;
      lightboxMotionHooks.forEach((hook) => {
        names[hook] = `${hook}--${key}`;
        this.element.style.setProperty(`--${hook}-keyframes`, names[hook]);
      });
      this.keyframeNames = names;
      this.keyframesStyle = document.createElement("style");
      this.installKeyframes({});
      this.element.prepend(this.keyframesStyle);
      this.element.addEventListener("animationend", this.onMotionEvent);
      this.element.addEventListener("animationcancel", this.onMotionEvent);
    }

    // Backdrop clicks dismiss only when the press also started on the
    // backdrop, so a text selection dragged out of the dialog does not
    this.element.addEventListener("mousedown", (event) => {
      this.pressStartedOnBackdrop = event.target === this.element;
    });
    this.element.addEventListener("click", (event) => {
      if (event.target === this.element && this.pressStartedOnBackdrop) {
        this.requestDismiss();
      }
      this.pressStartedOnBackdrop = false;
    });
    this.iframe.addEventListener("load", this.onFrameLoad);
  }

  public get state(): RegiveLightboxState {
    return this.currentState;
  }

  public get isBusy(): boolean {
    return this.busy;
  }

  // Add the lightbox to the page. Call this before the iframe is in the
  // document: moving an iframe that has already loaded reloads it.
  public mount() {
    document.body.appendChild(this.element);
  }

  public markEnabled() {
    this.isEnabled = true;
    this.openWhenReady();
  }

  // "loaded" is both half of the readiness signal and the end of a
  // processing period (the child is idle again, or its thank-you page loaded)
  public markLoaded() {
    this.isLoaded = true;
    this.setBusy(false);
    this.openWhenReady();
  }

  public markLoading() {
    this.setBusy(true);
    const active = document.activeElement;
    // The parent hides the iframe while loading, which would drop focus out
    // of the dialog - keep it on the dialog instead
    if (
      this.currentState === "open" &&
      (active === this.iframe || active === document.body || active === null)
    ) {
      this.dialog.focus({ preventScroll: true });
    }
  }

  public markSuccess() {
    this.succeeded = true;
    this.setBusy(false);
    if (this.currentState === "open" && this.successTimer === undefined) {
      this.successTimer = window.setTimeout(() => {
        this.successTimer = undefined;
        this.log("Closing the lightbox after the thank-you message", "🟢");
        this.beginClose("success-out");
      }, successCloseDelay);
    }
  }

  // The rendered template's motions, posted by the child as a
  // "lightbox-animations" message the parent has already matched to this
  // lightbox's iframe. Taken only while pending (the child sends them before
  // it reports ready), and only when every rule passes validation;
  // otherwise the built-in motions stay.
  public acceptAnimations(value: unknown): boolean {
    if (!this.animate) {
      this.log("Ignoring lightbox animations - lightbox-animate is off", "⚠️");
      return false;
    }
    if (this.currentState !== "pending") {
      this.log(
        "Ignoring lightbox animations that arrived after the lightbox opened",
        "⚠️"
      );
      return false;
    }
    const result = parseLightboxAnimations(value);
    if ("error" in result) {
      this.log(
        `Refused the template's lightbox animations (${result.error}) - using the built-in motion`,
        "⚠️"
      );
      return false;
    }
    this.installKeyframes(result.keyframes);
    this.log("Using the template's lightbox animations", "🎬");
    return true;
  }

  // Whether an empty-height report must be ignored: the dialog is showing a
  // processing state or the thank-you message, not the banner
  public holdsContent(): boolean {
    return this.busy || this.succeeded;
  }

  // Donor-initiated close. Refused while a donation is processing, so the
  // donor always sees the outcome.
  public dismiss(): boolean {
    if (this.currentState !== "open") return false;
    if (this.busy) {
      this.log(
        "Not closing the lightbox while the donation is processing",
        "🔒"
      );
      return false;
    }
    this.log("Lightbox dismissed by the donor", "🚪");
    this.beginClose("out");
    return true;
  }

  // Hide the dialog for good, right away - no exit motion, and it cuts a
  // running one short. Used when regive has nothing left to show. The
  // dialog stays in the DOM so the .regive-success hooks on the host page
  // keep working; it is never reopened.
  public close() {
    if (this.currentState === "closed" || this.currentState === "removed") {
      return;
    }
    this.finishClose();
  }

  public remove() {
    if (this.currentState === "removed") return;
    this.currentState = "removed";
    this.clearTimers();
    this.stopMotion();
    this.element.remove();
    this.release();
  }

  // Donor dismissal ("out") or the post-success exit ("success-out"). With
  // lightbox-animate the dialog stays up, modal but unresponsive, while the
  // exit motion plays; otherwise (or with reduced motion) it closes now.
  private beginClose(motion: "out" | "success-out") {
    if (this.currentState !== "open") return;
    if (!this.animate || this.prefersReducedMotion()) {
      this.finishClose();
      return;
    }
    this.currentState = "closing";
    this.clearTimers();
    this.element.setAttribute("data-regive-lightbox-state", "closing");
    // Keep focus inside, on the dialog itself, then take the banner and the
    // close button out of reach so nothing (a second donation included) can
    // start while the dialog leaves. The backdrop itself is not made inert:
    // inert content is not hit-tested, so clicks would reach the page.
    this.focusDialog();
    this.closeButton.setAttribute("inert", "");
    this.container.setAttribute("inert", "");
    this.startMotion(motion, () => this.finishClose());
  }

  private finishClose() {
    this.currentState = "closed";
    this.clearTimers();
    this.stopMotion();
    this.element.setAttribute("data-regive-lightbox-state", "closed");
    this.element.hidden = true;
    this.release();
  }

  private openWhenReady() {
    if (this.currentState !== "pending" || !this.isLoaded || !this.isEnabled) {
      return;
    }
    this.log("Regive is ready - opening the lightbox", "🟢");
    this.currentState = "open";
    this.element.setAttribute("data-regive-lightbox-state", "open");
    this.element.removeAttribute("inert");
    const active = document.activeElement;
    this.returnFocus =
      active instanceof HTMLElement &&
      active !== document.body &&
      !this.element.contains(active)
        ? active
        : null;
    openLightboxes.push(this);
    ENGrid.setBodyData("lightbox-open", "true");
    document.addEventListener("keydown", this.onKeydown);
    document.addEventListener("focusin", this.onFocusIn);
    this.listenForEscapeInFrame();
    // Another script removing the lightbox must not strand the scroll lock
    this.removalObserver = new MutationObserver(() => {
      if (!this.element.isConnected) {
        this.log("The lightbox was removed from the page", "🚪");
        this.remove();
      }
    });
    this.removalObserver.observe(document.body, { childList: true });
    this.holdsPage = true;
    this.dialog.focus({ preventScroll: true });
    // The entrance never holds anything up: the dialog is already open,
    // focused and usable while it grows in
    if (this.animate) this.startMotion("in", () => {});
  }

  // Undo everything opening did: listeners, scroll lock, focus. Only the
  // first call after opening does anything.
  private release() {
    if (!this.holdsPage) return;
    this.holdsPage = false;
    document.removeEventListener("keydown", this.onKeydown);
    document.removeEventListener("focusin", this.onFocusIn);
    this.removalObserver?.disconnect();
    this.removalObserver = null;
    const index = openLightboxes.indexOf(this);
    if (index > -1) openLightboxes.splice(index, 1);
    if (!openLightboxes.some((lightbox) => lightbox.element.isConnected)) {
      ENGrid.setBodyData("lightbox-open", false);
    }
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) {
      target.focus({ preventScroll: true });
    }
  }

  private setBusy(busy: boolean) {
    this.busy = busy;
    if (busy) {
      this.element.setAttribute("data-regive-lightbox-busy", "true");
      this.closeButton.setAttribute("aria-disabled", "true");
    } else {
      window.clearTimeout(this.graceTimer);
      this.graceTimer = undefined;
      this.element.removeAttribute("data-regive-lightbox-busy");
      this.closeButton.removeAttribute("aria-disabled");
    }
  }

  private clearTimers() {
    window.clearTimeout(this.successTimer);
    window.clearTimeout(this.graceTimer);
    this.successTimer = undefined;
    this.graceTimer = undefined;
  }

  // Escape, close button and backdrop dismiss one task later. Browsers can
  // run input before a message the child has already queued, so an Escape
  // pressed right after an amount click would otherwise beat the "loading"
  // that locks the dialog. Waiting a task lets that message land first.
  private requestDismiss() {
    window.setTimeout(() => this.dismiss(), 0);
  }

  private isTopmost(): boolean {
    const connected = openLightboxes.filter(
      (lightbox) => lightbox.element.isConnected
    );
    return connected[connected.length - 1] === this;
  }

  private readonly onKeydown = (event: KeyboardEvent) => {
    if (
      event.key !== "Escape" ||
      this.currentState !== "open" ||
      this.busy ||
      !this.isTopmost()
    ) {
      return;
    }
    event.preventDefault();
    this.requestDismiss();
  };

  // Focus stays contained until the dialog is gone, exit motion included
  private readonly onFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (
      (this.currentState === "open" || this.currentState === "closing") &&
      this.isTopmost() &&
      target instanceof Node &&
      !this.element.contains(target)
    ) {
      this.focusDialog();
    }
  };

  // Play a motion: set data-regive-lightbox-motion, then end the motion when
  // the backdrop's and dialog's animations have ended, when either is
  // cancelled, when reduced motion is switched on, or at a deadline computed
  // from their CSS timing (capped at maxMotionTime) - whichever comes first.
  // A motion with nothing to animate (no CSS, "none", zero or unreadable
  // duration, reduced motion) ends immediately. onDone runs once.
  private startMotion(kind: LightboxMotion, onDone: () => void) {
    // A motion that replaces another (closing mid-entrance) switches the
    // attribute straight over, never through "no motion"
    this.cancelMotion();
    const query = this.reducedMotionQuery();
    if (query?.matches) {
      this.stopMotion();
      onDone();
      return;
    }
    this.element.setAttribute("data-regive-lightbox-motion", kind);
    const animations = new Map<Element, string>();
    let time = 0;
    [this.element, this.dialog].forEach((target) => {
      const timing = readMotionTiming(target);
      if (timing.time > 0) {
        animations.set(target, timing.name);
        time = Math.max(time, timing.time);
      }
    });
    if (!animations.size) {
      this.log(`No ${motionHooks[kind]} animation to play`, "🎬");
      this.stopMotion();
      onDone();
      return;
    }
    const motion: RunningMotion = {
      animations,
      finish: () => {
        if (this.motion !== motion) return;
        this.stopMotion();
        onDone();
      },
    };
    this.motion = motion;
    this.log(`Playing ${motionHooks[kind]}`, "🎬", {
      animations: Array.from(animations.values()),
      time,
    });
    this.motionTimer = window.setTimeout(
      motion.finish,
      Math.round(Math.min(time, maxMotionTime))
    );
    if (query && typeof query.addEventListener === "function") {
      this.motionQuery = query;
      query.addEventListener("change", this.onReducedMotionChange);
    }
  }

  private stopMotion() {
    this.cancelMotion();
    this.element.removeAttribute("data-regive-lightbox-motion");
  }

  // Forget the running motion (deadline, reduced-motion listener) but leave
  // the attribute for the caller
  private cancelMotion() {
    this.motion = null;
    window.clearTimeout(this.motionTimer);
    this.motionTimer = undefined;
    this.motionQuery?.removeEventListener("change", this.onReducedMotionChange);
    this.motionQuery = null;
  }

  private readonly onMotionEvent = (event: Event) => {
    const motion = this.motion;
    const target = event.target;
    if (!motion || !(target instanceof Element)) return;
    // Only the running motion's own animations count: the loading spinner
    // bubbles up from the container, and a replaced motion's cancellation
    // arrives after its successor has started
    const name = motion.animations.get(target);
    if (name === undefined || (event as AnimationEvent).animationName !== name) {
      return;
    }
    if (event.type === "animationcancel") {
      motion.finish();
      return;
    }
    motion.animations.delete(target);
    if (!motion.animations.size) motion.finish();
  };

  private readonly onReducedMotionChange = (event: MediaQueryListEvent) => {
    if (event.matches) this.motion?.finish();
  };

  private reducedMotionQuery(): MediaQueryList | null {
    return typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  }

  private prefersReducedMotion(): boolean {
    return this.reducedMotionQuery()?.matches === true;
  }

  // Write the motions into this lightbox's own <style>, under its private
  // names: the given (already validated) keyframes, defaults for the rest
  private installKeyframes(keyframes: LightboxKeyframes) {
    if (!this.keyframesStyle || !this.keyframeNames) return;
    const names = this.keyframeNames;
    const defaults = defaultLightboxKeyframes();
    this.keyframesStyle.textContent = lightboxMotionHooks
      .map((hook) =>
        serializeKeyframes(names[hook], keyframes[hook] ?? defaults[hook])
      )
      .join("\n");
  }

  private focusDialog() {
    this.dialog.focus({ preventScroll: true });
  }

  private readonly onFrameLoad = () => {
    this.listenForEscapeInFrame();
    if (!this.busy) return;
    window.clearTimeout(this.graceTimer);
    this.graceTimer = window.setTimeout(() => {
      this.graceTimer = undefined;
      if (!this.busy) return;
      this.log(
        "The iframe page never reported back - the lightbox can close again",
        "⚠️"
      );
      this.setBusy(false);
    }, unreportedPageGracePeriod);
  };

  // Keyboard events inside the iframe never reach the parent document, so
  // listen in the iframe's document too. Only possible same-origin; a
  // cross-origin base-page still closes from the dialog and close button.
  private listenForEscapeInFrame() {
    const frameDocument = this.getFrameDocument();
    if (!frameDocument || this.frameDocuments.has(frameDocument)) return;
    this.frameDocuments.add(frameDocument);
    frameDocument.addEventListener("keydown", this.onKeydown);
  }

  private getFrameDocument(): Document | null {
    try {
      return this.iframe.contentDocument;
    } catch {
      return null;
    }
  }

  private createFocusGuard(onFocus: () => void): HTMLSpanElement {
    const guard = document.createElement("span");
    guard.className = "regive-lightbox__focus-guard";
    guard.tabIndex = 0;
    guard.addEventListener("focus", onFocus);
    return guard;
  }

  private focusFirst() {
    this.closeButton.focus({ preventScroll: true });
  }

  // Focus the last control inside the iframe (same-origin), or the iframe
  // itself when its document cannot be read
  private focusLast() {
    const frameDocument = this.getFrameDocument();
    const candidates = frameDocument
      ? Array.from(
          frameDocument.querySelectorAll<HTMLElement>(focusableSelector)
        ).filter((element) => element.getClientRects().length > 0)
      : [];
    this.iframe.focus({ preventScroll: true });
    candidates[candidates.length - 1]?.focus({ preventScroll: true });
    if (document.activeElement !== this.iframe) {
      // The iframe is hidden (e.g. while processing) - stay in the dialog
      this.focusFirst();
    }
  }

  // Text content of possibly-marked-up heading copy. Parsed into an inert
  // document: no scripts run and nothing is fetched.
  private static textOf(markup: string | null | undefined): string {
    if (!markup) return "";
    const text =
      new DOMParser().parseFromString(markup, "text/html").body.textContent ??
      "";
    return text.replace(/\s+/g, " ").trim();
  }
}
