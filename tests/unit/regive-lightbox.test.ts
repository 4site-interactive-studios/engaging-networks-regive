import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegiveLightbox } from "../../src/lib/regive-lightbox";

// The lightbox wraps the parent page's existing .regive-container (and the
// chained iframe inside it). These tests drive it directly, the same way the
// parent's postMessage handler does after it has validated the sender and
// matched the message to this container's iframe.

type Setup = {
  lightbox: RegiveLightbox;
  root: HTMLElement;
  dialog: HTMLElement;
  closeButton: HTMLButtonElement;
  container: HTMLElement;
  iframe: HTMLIFrameElement;
};

const setup = (
  options: { width?: string | null; label?: string | null } = {}
): Setup => {
  const container = document.createElement("div");
  container.className = "regive-container";
  const iframe = document.createElement("iframe");
  iframe.className = "regive-iframe";
  container.appendChild(iframe);
  const lightbox = new RegiveLightbox({
    container,
    iframe,
    width: options.width ?? null,
    label: options.label === undefined ? "Double your impact" : options.label,
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

const clickOn = (target: HTMLElement, releaseOn: HTMLElement = target) => {
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  releaseOn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

const scrollLocked = () =>
  document.body.getAttribute("data-regive-lightbox-open") === "true";

// Donor-initiated dismissals (Escape, close button, backdrop) settle one task
// later, after any message the child queued before the input event
const settle = () => vi.advanceTimersByTime(0);

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<button id="host-button">Host</button>';
  document.body.removeAttribute("data-regive-lightbox-open");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RegiveLightbox structure", () => {
  it("wraps the existing container in a labelled modal dialog with a semantic close button", () => {
    const { root, dialog, closeButton, container, iframe } = setup();

    expect(root.isConnected).toBe(true);
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Double your impact");
    expect(closeButton.tagName).toBe("BUTTON");
    expect(closeButton.type).toBe("button");
    expect(closeButton.getAttribute("aria-label")).toBe("Close");
    // The parent's container (and its iframe) is moved in, not recreated
    expect(dialog.contains(container)).toBe(true);
    expect(container.contains(iframe)).toBe(true);
    // The iframe gets an accessible name inside the dialog
    expect(iframe.title).toBe("Double your impact");
  });

  it("derives the accessible name from heading text, never from its markup", () => {
    const { root, dialog } = setup({
      label: 'Double <b>your</b> &amp; impact<img src="x" onerror="window.__pwned=1">',
    });

    expect(dialog.getAttribute("aria-label")).toBe("Double your & impact");
    expect(root.querySelector("img, b")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("falls back to a default accessible name when there is no heading", () => {
    const { dialog } = setup({ label: null });
    expect(dialog.getAttribute("aria-label")).toBe("Additional donation");
  });

  it("applies lightbox-width through the CSS parser rather than HTML", () => {
    expect(setup({ width: "600px" }).dialog.style.width).toBe("600px");
    expect(setup({ width: "calc(100% - 2rem)" }).dialog.style.width).toBe(
      "calc(100% - 2rem)"
    );

    // Invalid or injected values are rejected and the stylesheet default applies
    const injected = setup({
      width: '600px;" onmouseover="alert(1)"><img src=x onerror=alert(1)>',
    });
    expect(injected.dialog.style.width).toBe("");
    expect(injected.dialog.getAttribute("onmouseover")).toBeNull();
    expect(injected.root.querySelector("img")).toBeNull();
    expect(setup({ width: "600" }).dialog.style.width).toBe("");
    expect(setup({ width: "url(https://example.org/x)" }).dialog.style.width).toBe(
      ""
    );
  });
});

describe("RegiveLightbox readiness", () => {
  it("stays hidden and inert until the child reports both loaded and enabled", () => {
    const { lightbox, root } = setup();

    expect(lightbox.state).toBe("pending");
    expect(root.getAttribute("data-regive-lightbox-state")).toBe("pending");
    expect(root.hasAttribute("inert")).toBe(true);
    expect(scrollLocked()).toBe(false);

    lightbox.markLoaded();
    expect(lightbox.state).toBe("pending");
    expect(scrollLocked()).toBe(false);

    lightbox.markEnabled();
    expect(lightbox.state).toBe("open");
    expect(root.getAttribute("data-regive-lightbox-state")).toBe("open");
    expect(root.hasAttribute("inert")).toBe(false);
    expect(scrollLocked()).toBe(true);
  });

  it("opens regardless of whether enabled or loaded arrives first", () => {
    const { lightbox } = setup();
    lightbox.markEnabled();
    expect(lightbox.state).toBe("pending");
    lightbox.markLoaded();
    expect(lightbox.state).toBe("open");
  });

  it("moves focus into the dialog when it opens", () => {
    const { lightbox, dialog } = setup();
    (document.getElementById("host-button") as HTMLButtonElement).focus();
    open(lightbox);
    expect(document.activeElement).toBe(dialog);
  });

  it("never opens after the child exits before it is ready", () => {
    const { lightbox, root } = setup();
    const hostButton = document.getElementById(
      "host-button"
    ) as HTMLButtonElement;
    hostButton.focus();

    lightbox.markLoaded();
    lightbox.remove();
    expect(lightbox.state).toBe("removed");
    expect(root.isConnected).toBe(false);

    // A late enabled (e.g. queued behind the exit) must not resurrect it
    lightbox.markEnabled();
    expect(lightbox.state).toBe("removed");
    expect(scrollLocked()).toBe(false);
    expect(document.activeElement).toBe(hostButton);
  });

  it("closing while pending never touches focus or the scroll lock", () => {
    const { lightbox, root } = setup();
    const hostButton = document.getElementById(
      "host-button"
    ) as HTMLButtonElement;
    hostButton.focus();

    lightbox.close();
    expect(lightbox.state).toBe("closed");
    expect(root.hidden).toBe(true);
    open(lightbox);
    expect(lightbox.state).toBe("closed");
    expect(scrollLocked()).toBe(false);
    expect(document.activeElement).toBe(hostButton);
  });
});

describe("RegiveLightbox dismissal", () => {
  it("closes on Escape, restoring focus and the scroll lock", () => {
    const { lightbox, root } = setup();
    const hostButton = document.getElementById(
      "host-button"
    ) as HTMLButtonElement;
    hostButton.focus();
    open(lightbox);

    pressEscape();
    settle();

    expect(lightbox.state).toBe("closed");
    expect(root.hidden).toBe(true);
    expect(root.getAttribute("data-regive-lightbox-state")).toBe("closed");
    expect(scrollLocked()).toBe(false);
    expect(document.activeElement).toBe(hostButton);
    // Closing keeps the container in the DOM so .regive-success hooks survive
    expect(root.isConnected).toBe(true);
  });

  it("closes on Escape pressed inside the same-origin iframe", () => {
    const { lightbox, iframe } = setup();
    open(lightbox);

    pressEscape(iframe.contentDocument as Document);
    settle();

    expect(lightbox.state).toBe("closed");
  });

  it("closes with the close button", () => {
    const { lightbox, closeButton } = setup();
    open(lightbox);
    clickOn(closeButton);
    settle();
    expect(lightbox.state).toBe("closed");
  });

  it("closes on a backdrop click but not on clicks that start inside the dialog", () => {
    const { lightbox, root, dialog } = setup();
    open(lightbox);

    clickOn(dialog);
    settle();
    expect(lightbox.state).toBe("open");
    // Press inside the dialog, release on the backdrop (e.g. a text drag)
    clickOn(dialog, root);
    settle();
    expect(lightbox.state).toBe("open");

    clickOn(root);
    settle();
    expect(lightbox.state).toBe("closed");
  });

  it("refuses a dismissal that races a loading message the child already queued", () => {
    // The donor clicks an amount in the iframe and immediately presses
    // Escape (or clicks close / the backdrop). Browsers can deliver the
    // input before the child's queued "loading" message.
    const escape = setup();
    open(escape.lightbox);
    pressEscape(escape.iframe.contentDocument as Document);
    escape.lightbox.markLoading();
    settle();
    expect(escape.lightbox.state).toBe("open");

    const closeClick = setup();
    open(closeClick.lightbox);
    clickOn(closeClick.closeButton);
    closeClick.lightbox.markLoading();
    settle();
    expect(closeClick.lightbox.state).toBe("open");

    const backdrop = setup();
    open(backdrop.lightbox);
    clickOn(backdrop.root);
    backdrop.lightbox.markLoading();
    settle();
    expect(backdrop.lightbox.state).toBe("open");
  });

  it("restores focus and the scroll lock when removed while open", () => {
    const { lightbox, root } = setup();
    const hostButton = document.getElementById(
      "host-button"
    ) as HTMLButtonElement;
    hostButton.focus();
    open(lightbox);

    lightbox.remove();

    expect(root.isConnected).toBe(false);
    expect(scrollLocked()).toBe(false);
    expect(document.activeElement).toBe(hostButton);
  });

  it("restores focus and the scroll lock when the host page removes an open lightbox", async () => {
    const { lightbox, root } = setup();
    const hostButton = document.getElementById(
      "host-button"
    ) as HTMLButtonElement;
    hostButton.focus();
    open(lightbox);
    expect(scrollLocked()).toBe(true);

    // Removed by some other script, not by Regive
    root.remove();
    await Promise.resolve();
    await Promise.resolve();

    expect(lightbox.state).toBe("removed");
    expect(scrollLocked()).toBe(false);
    expect(document.activeElement).toBe(hostButton);
  });

  it("keeps the scroll lock while another lightbox is still open", () => {
    const first = setup();
    const second = setup();
    open(first.lightbox);
    open(second.lightbox);

    first.lightbox.close();
    expect(scrollLocked()).toBe(true);
    second.lightbox.close();
    expect(scrollLocked()).toBe(false);
  });
});

describe("RegiveLightbox focus containment", () => {
  it("wraps focus from the end of the dialog back to the close button", () => {
    const { lightbox, root, closeButton } = setup();
    open(lightbox);

    const guards = root.querySelectorAll<HTMLElement>(
      ".regive-lightbox__focus-guard"
    );
    expect(guards).toHaveLength(2);
    guards[1].focus();

    expect(document.activeElement).toBe(closeButton);
  });

  it("wraps focus from the start of the dialog to the iframe", () => {
    const { lightbox, root, iframe } = setup();
    open(lightbox);

    root
      .querySelectorAll<HTMLElement>(".regive-lightbox__focus-guard")[0]
      .focus();

    expect(document.activeElement).toBe(iframe);
  });

  it("pulls focus back when something outside the dialog takes it", () => {
    const { lightbox, dialog } = setup();
    open(lightbox);

    (document.getElementById("host-button") as HTMLButtonElement).focus();

    expect(document.activeElement).toBe(dialog);
  });

  it("lets only the newest of two open lightboxes contain focus and take Escape", () => {
    const hostButton = document.getElementById(
      "host-button"
    ) as HTMLButtonElement;
    hostButton.focus();
    const first = setup();
    const second = setup();
    open(first.lightbox);
    open(second.lightbox);

    // The two guards must not fight over focus
    expect(document.activeElement).toBe(second.dialog);
    hostButton.focus();
    expect(document.activeElement).toBe(second.dialog);

    pressEscape();
    settle();
    expect(second.lightbox.state).toBe("closed");
    expect(first.lightbox.state).toBe("open");
    expect(document.activeElement).toBe(first.dialog);

    pressEscape();
    settle();
    expect(first.lightbox.state).toBe("closed");
    expect(document.activeElement).toBe(hostButton);
  });

  it("stops containing focus once closed", () => {
    const { lightbox } = setup();
    open(lightbox);
    lightbox.close();

    const hostButton = document.getElementById(
      "host-button"
    ) as HTMLButtonElement;
    hostButton.focus();
    expect(document.activeElement).toBe(hostButton);
  });
});

describe("RegiveLightbox submission lock", () => {
  it("blocks every dismissal while a donation is processing", () => {
    const { lightbox, root, closeButton } = setup();
    open(lightbox);

    lightbox.markLoading();

    expect(lightbox.isBusy).toBe(true);
    expect(root.getAttribute("data-regive-lightbox-busy")).toBe("true");
    expect(closeButton.getAttribute("aria-disabled")).toBe("true");
    pressEscape();
    clickOn(closeButton);
    clickOn(root);
    settle();
    expect(lightbox.dismiss()).toBe(false);
    expect(lightbox.state).toBe("open");
    expect(scrollLocked()).toBe(true);
  });

  it("allows dismissal again once the child reports loaded", () => {
    const { lightbox, root, closeButton } = setup();
    open(lightbox);
    lightbox.markLoading();

    lightbox.markLoaded();

    expect(lightbox.isBusy).toBe(false);
    expect(root.hasAttribute("data-regive-lightbox-busy")).toBe(false);
    expect(closeButton.hasAttribute("aria-disabled")).toBe(false);
    pressEscape();
    settle();
    expect(lightbox.state).toBe("closed");
  });

  it("moves focus from the iframe to the dialog while processing", () => {
    const { lightbox, dialog, iframe } = setup();
    open(lightbox);
    iframe.focus();

    lightbox.markLoading();

    expect(document.activeElement).toBe(dialog);
  });

  it("releases the lock when the iframe lands on a page that never reports back", () => {
    const { lightbox, iframe } = setup();
    open(lightbox);
    lightbox.markLoading();

    iframe.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(4999);
    expect(lightbox.isBusy).toBe(true);
    vi.advanceTimersByTime(1);
    expect(lightbox.isBusy).toBe(false);

    pressEscape();
    settle();
    expect(lightbox.state).toBe("closed");
  });

  it("does not release the lock from a load that happened before processing", () => {
    const { lightbox, iframe } = setup();
    open(lightbox);

    iframe.dispatchEvent(new Event("load"));
    lightbox.markLoading();
    vi.advanceTimersByTime(10000);

    expect(lightbox.isBusy).toBe(true);
  });
});

describe("RegiveLightbox success", () => {
  it("keeps the thank-you content and closes 3500ms after success", () => {
    const hostButton = document.getElementById(
      "host-button"
    ) as HTMLButtonElement;
    hostButton.focus();
    const { lightbox } = setup();
    open(lightbox);
    lightbox.markLoading();

    lightbox.markSuccess();

    expect(lightbox.isBusy).toBe(false);
    expect(lightbox.holdsContent()).toBe(true);
    vi.advanceTimersByTime(3499);
    expect(lightbox.state).toBe("open");
    vi.advanceTimersByTime(1);
    expect(lightbox.state).toBe("closed");
    expect(scrollLocked()).toBe(false);
    expect(document.activeElement).toBe(hostButton);
  });

  it("holds content while processing, but not while idle", () => {
    const { lightbox } = setup();
    open(lightbox);
    expect(lightbox.holdsContent()).toBe(false);
    lightbox.markLoading();
    expect(lightbox.holdsContent()).toBe(true);
  });

  it("lets the donor close the thank-you early, cancelling the auto-close", () => {
    const { lightbox } = setup();
    open(lightbox);
    lightbox.markSuccess();

    pressEscape();
    settle();
    expect(lightbox.state).toBe("closed");
    vi.advanceTimersByTime(5000);
    expect(lightbox.state).toBe("closed");
  });

  it("never reopens once closed, whatever the child sends next", () => {
    const { lightbox, root } = setup();
    open(lightbox);
    lightbox.markSuccess();
    vi.advanceTimersByTime(3500);
    expect(lightbox.state).toBe("closed");

    // Test mode keeps the iframe alive: a later reset, a repeated
    // loaded/enabled or another success must not bring the dialog back
    lightbox.markLoaded();
    lightbox.markEnabled();
    lightbox.markLoading();
    lightbox.markSuccess();
    vi.advanceTimersByTime(10000);

    expect(lightbox.state).toBe("closed");
    expect(root.hidden).toBe(true);
    expect(scrollLocked()).toBe(false);
  });
});
