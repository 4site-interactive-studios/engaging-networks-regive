import { ENGrid } from "./engrid";

/**
 * Lifecycle of a lightbox:
 * - pending: in the DOM so the chained iframe loads and lays out at its real
 *   width, but invisible and inert until the child reports it is ready
 * - open: visible modal dialog, page scroll locked, focus contained
 * - closed: dismissed or finished - hidden for good, never reopens
 * - removed: the child exited - taken out of the DOM
 */
export type RegiveLightboxState = "pending" | "open" | "closed" | "removed";

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
  log?: RegiveLog;
}

// How long the thank-you message stays up before the dialog closes itself
const successCloseDelay = 3500;
// After a submission navigates the iframe, a page that never reports back
// (a network error page, an unexpected redirect) must not trap the donor in
// an undismissable dialog - release the lock after this grace period
const unreportedPageGracePeriod = 5000;
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
  private readonly iframe: HTMLIFrameElement;
  private readonly log: RegiveLog;
  private currentState: RegiveLightboxState = "pending";
  private isLoaded = false;
  private isEnabled = false;
  private busy = false;
  private succeeded = false;
  private returnFocus: HTMLElement | null = null;
  private successTimer: number | undefined;
  private graceTimer: number | undefined;
  private pressStartedOnBackdrop = false;
  private removalObserver: MutationObserver | null = null;
  private readonly frameDocuments = new WeakSet<Document>();

  constructor(options: RegiveLightboxOptions) {
    this.iframe = options.iframe;
    this.hostComponent = options.hostComponent ?? null;
    this.log = options.log ?? (() => {});
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
    this.element.append(
      this.createFocusGuard(() => this.focusLast()),
      this.dialog,
      this.createFocusGuard(() => this.focusFirst())
    );

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
        this.close();
      }, successCloseDelay);
    }
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
    this.close();
    return true;
  }

  // Hide the dialog for good. It stays in the DOM so the .regive-success
  // hooks on the host page keep working; it is never reopened.
  public close() {
    if (this.currentState === "closed" || this.currentState === "removed") {
      return;
    }
    const wasOpen = this.currentState === "open";
    this.currentState = "closed";
    this.clearTimers();
    this.element.setAttribute("data-regive-lightbox-state", "closed");
    this.element.hidden = true;
    if (wasOpen) this.release();
  }

  public remove() {
    if (this.currentState === "removed") return;
    const wasOpen = this.currentState === "open";
    this.currentState = "removed";
    this.clearTimers();
    this.element.remove();
    if (wasOpen) this.release();
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
    this.dialog.focus({ preventScroll: true });
  }

  // Undo everything opening did: listeners, scroll lock, focus
  private release() {
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

  private readonly onFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (
      this.currentState === "open" &&
      this.isTopmost() &&
      target instanceof Node &&
      !this.element.contains(target)
    ) {
      this.dialog.focus({ preventScroll: true });
    }
  };

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
