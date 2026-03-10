/**
 * Regive Lightbox Modal
 * Extends the base Modal class to provide a lightbox experience for Regive
 */
import { Modal } from "./modal";

export class RegiveLightboxModal extends Modal {
  constructor() {
    super({
      customClass: "regive-lightbox-modal",
      onClickOutside: "close",
      addCloseButton: true,
      closeButtonLabel: "No Thanks",
      modalContent: RegiveLightboxModal.getModalContent(), // Content will be set dynamically when opening the modal
    });
  }

  private setLightboxDismissed(): void {
    const expires = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `regive-lightbox-dismissed=true; expires=${expires}; path=/`;
  }

  private isLightboxDismissed(): boolean {
    return document.cookie.split(";").some((cookie) => cookie.trim() === "regive-lightbox-dismissed=true");
  }

  public open(): void {
    if (this.isLightboxDismissed()) {
      return;
    }
    super.open();
  }

  public close(): void {
    this.setLightboxDismissed();
    // Move the regive container back to its original position in the DOM
    const originalContent = this.modalContent instanceof HTMLElement && this.modalContent.querySelector(".regive-container");
    if (originalContent) {
      const placeholder = document.querySelector(".regive-placeholder");
      if (placeholder) {
        placeholder.replaceWith(originalContent);
      }
    }
    super.close();
  }

  public static getModalContent(): HTMLElement {
    const modalContent = document.createElement("div");
    modalContent.setAttribute("class", "regive-lightbox-content");
    // Get the element ".regive-container" and move it inside the modal content
    const regiveContainer = document.querySelector(".regive-container") as HTMLElement;
    const placeholder = document.createElement("div");
    placeholder.setAttribute("class", "regive-placeholder");
    placeholder.style.height = regiveContainer ? `${regiveContainer.offsetHeight}px` : "0px";
    regiveContainer.insertAdjacentElement("afterend",placeholder);
    if (regiveContainer) {
      modalContent.appendChild(regiveContainer);
      console.log(regiveContainer, "Regive container found and moved to lightbox modal.");
    } else {
      console.warn("Regive container not found. Lightbox may not function correctly.");
    }
    // Placeholder div to prevent layout shift when moving the regive container back on close
    console.log("Opening Regive Lightbox Modal with content:", modalContent);
    return modalContent;
  }

}
