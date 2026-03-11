/**
 * Regive Lightbox Modal
 * Extends the base Modal class to provide a lightbox experience for Regive
 */
import { Modal } from "./modal";
export class RegiveLightboxModal extends Modal {
  private log?: (message: string, emoji?: string, data?: any) => void;
  constructor(logger?: (message: string, emoji?: string, data?: any) => void) {
    super({
      customClass: "regive-lightbox-modal",
      onClickOutside: "close",
      addCloseButton: true,
      closeButtonLabel: "Dismiss",
      modalContent: RegiveLightboxModal.getModalContent(),
    });
    this.log = logger;
  }

  public open(): void {
    this.log?.("Opening Regive Lightbox Modal", "🟢");
    super.open();
  }

  public close(): void {
    // Move the regive container back to its original position in the DOM
    const originalContent = this.modalContent instanceof HTMLElement && this.modalContent.querySelector(".regive-container");
    if (originalContent) {
      const placeholder = document.querySelector(".regive-placeholder");
      this.log?.("Closing Regive Lightbox Modal. Moving original content back to page.", "🟢", { originalContent, placeholder });
      if (placeholder) {
        placeholder.replaceWith(originalContent);
      }
    }
    super.close();
  }

  public updatePlaceholderHeight(height: number): void {
    const placeholder = document.querySelector(".regive-placeholder") as HTMLElement;
    if (placeholder) {
      placeholder.style.height = `${height}px`;
      this.log?.("Updated placeholder height.", "🟢", { height: placeholder.style.height });
    }
  }

  public static getModalContent(): HTMLElement {
    const modalContent = document.createElement("div");
    modalContent.setAttribute("class", "regive-lightbox-content");

    // Get the element ".regive-container" and move it inside the modal content
    const regiveContainer = document.querySelector(".regive-container") as HTMLElement;
    const placeholder = document.createElement("div");
    placeholder.setAttribute("class", "regive-placeholder");
    placeholder.style.height = regiveContainer ? `${regiveContainer.offsetHeight}px` : "0px";
    placeholder.style.width = regiveContainer ? `${regiveContainer.offsetWidth}px` : "0px";
    if (regiveContainer) {
      regiveContainer.insertAdjacentElement("beforebegin", placeholder);
      modalContent.appendChild(regiveContainer);
    }
    return modalContent;
  }

}
