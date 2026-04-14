/**
 * Regive Lightbox Modal
 * Extends the base Modal class to provide a lightbox experience for Regive
 */
import { Modal, ModalOptions } from "./modal";
export class RegiveLightboxModal extends Modal {
  private log?: (message: string, emoji?: string, data?: any) => void;
  constructor(logger?: (message: string, emoji?: string, data?: any) => void, options: ModalOptions = {}) {
    super({
      customClass: "regive-lightbox-modal",
      onClickOutside: "close",
      modalContent: RegiveLightboxModal.getModalContent(),
      ...options,
    });
    this.log = logger;
  }

  public open(): void {
    this.log?.("Opening Regive Lightbox Modal", "🟢");
    super.open();
  }

  public close(): void {
    this.log?.("Closing Regive Lightbox Modal", "🔴");
    super.close();
  }

  public static getModalContent(): HTMLElement {
    const modalContent = document.createElement("div");
    modalContent.setAttribute("class", "regive-lightbox-content");

    // Get the element ".regive-container" and move it inside the modal content
    const regiveContainer = document.querySelector(".regive-container") as HTMLElement;
    if (regiveContainer) {
      modalContent.appendChild(regiveContainer);
    }
    return modalContent;
  }

}
