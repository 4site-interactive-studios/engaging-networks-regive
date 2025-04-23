import { ENGrid } from "./engrid";
import { RegiveOptions } from "./regive-options";

export class Regive {
  private readonly ENgrid = ENGrid;
  private debugMode: boolean = false;
  private _observer: MutationObserver | null = null;
  private options: RegiveOptions | undefined;
  private readonly isEmbedded: boolean = window !== window.parent;
  private readonly isChained: boolean = !!this.ENgrid.getUrlParameter("chain");

  constructor() {
    const regiveScript = document.querySelector("script[src*='regive']");
    // Check if the script is loaded with debug mode
    if (regiveScript) {
      const regiveScriptSrc = (regiveScript as HTMLScriptElement).src;
      this.debugMode = regiveScriptSrc.includes("debug");
    }
    this.log("Initializing Regive class");

    if (!this.isDonationPage()) {
      this.log("Not a donation page. Regive will not run.", "⚠️");
      return;
    }

    if (this.isFirstPage()) {
      this.log("Detected first page of the donation process");
      this.handleFirstPage();
    } else if (this.isThankYouPage()) {
      this.log("Detected thank-you page");
      this.handleThankYouPage();
    } else {
      this.log("Page is neither the first page nor the thank-you page", "⚠️");
    }
  }

  // Create init function
  public static init() {
    const regive = new Regive();
    regive.log("Regive initialized");
  }

  private isDonationPage(): boolean {
    const isDonation = this.ENgrid.getPageType() === "DONATION";
    this.log("Checking if the page is a donation page", "ℹ️", { isDonation });
    return isDonation;
  }

  private isFirstPage(): boolean {
    const isFirst = this.ENgrid.getPageNumber() === 1;
    this.log("Checking if the page is the first page", "ℹ️", { isFirst });
    return isFirst;
  }

  private isThankYouPage(): boolean {
    const isThankYou = this.ENgrid.isThankYouPage();
    this.log("Checking if the page is a thank-you page", "ℹ️", {
      isThankYou,
    });
    return isThankYou;
  }

  private handleFirstPage() {
    this.log("Handling the first page", "🥇", {
      embedded: this.isEmbedded,
      chained: this.isChained,
    });

    if (this.isEmbedded) {
      this.log("Page is embedded", "ℹ️");
      this.loadOptionsFromUrl();
      if (this.hasVgsTokens() && this.isChained) {
        this.log(
          "Conditions met to hide the donation form and add a banner",
          "🟢"
        );
        this.ENgrid.setBodyData("embedded", "true");
        this.hideAll();
        this.addCustomBanner();
      } else {
        this.log("Conditions not met to modify the embedded page", "⚠️");
      }
    } else {
      this.log("Page is not embedded. Watching tokens", "🟢");
      this.watchTokens();
    }
  }

  private handleThankYouPage() {
    this.log("Handling the thank-you page", "🥈", {
      embedded: this.isEmbedded,
      chained: this.isChained,
    });

    if (this.isEmbedded) {
      this.log("Page is embedded", "ℹ️");
      this.loadOptionsFromUrl();
      if (this.wasSubmittedViaRegive()) {
        this.log(
          "Form was submitted via Regive. Performing thank-you actions.",
          "🟢"
        );
        this.sendConfettiSignal();
        this.showCustomThankYouMessage();
        this.clearVgsTokens();
        this.hideAll(true);
      } else {
        this.log("Form was not submitted via Regive", "⚠️");
      }
    } else {
      this.log(
        "Page is not embedded. Replacing <regive> tag with an iframe",
        "🟢"
      );
      this.replaceRegiveTagWithIframe();
    }
  }

  private hasVgsTokens(): boolean {
    const hasTokens = !!(
      localStorage.getItem("regive-num") &&
      localStorage.getItem("regive-ver") &&
      localStorage.getItem("regive-exp")
    );
    this.log("Checking if VGS tokens exist in localStorage", "ℹ️", {
      hasTokens,
    });
    return hasTokens;
  }

  private hideAll(onlyBody: boolean = false) {
    if (onlyBody) {
      this.log("Hiding body element", "🔴");
      document.body.style.display = "none";
      return;
    }
    this.log("Hiding all elements on the page", "🔴");
    // Hide all elements on body
    const elements = document.querySelectorAll("body > *");
    elements.forEach((element) => {
      if (
        ["script", "style", "noscript", "link"].includes(
          element.tagName.toLowerCase()
        )
      ) {
        return;
      }
      this.log("Hiding element", "🔴", { element });
      if (element instanceof HTMLElement) {
        element.style.display = "none";
      }
    });
  }

  private addCustomBanner() {
    this.log("Adding a custom banner to the page");
    const banner = document.createElement("div");
    banner.classList.add("regive-banner");
    document.body.appendChild(banner);
    // TODO: Implement the banner content
  }

  private wasSubmittedViaRegive(): boolean {
    // TODO: Implement the logic to check if the form was submitted via Regive
    return false;
  }

  private sendConfettiSignal() {
    this.log("Sending confetti signal to parent window", "🎉");
    window.parent.postMessage({ action: "showConfetti" }, "*");
  }

  private showCustomThankYouMessage() {
    // TODO: Implement the logic to show a custom thank-you message
  }

  private clearVgsTokens() {
    this.log("Clearing VGS tokens from localStorage", "💾");
    localStorage.removeItem("regive-num");
    localStorage.removeItem("regive-ver");
    localStorage.removeItem("regive-exp");
  }

  private replaceRegiveTagWithIframe() {
    const regiveTags = document.querySelectorAll("regive");
    regiveTags.forEach((regiveTag) => {
      this.log("Replacing <regive> tag with an iframe");

      // Get options from the regive tag
      const optionsStr = this.getRegiveTagOptions(regiveTag);

      // Create iframe element
      const iframe = document.createElement("iframe");

      // Build the iframe src URL with options
      const baseUrl = `${window.location.href}`;
      // Replace the current page with /1 from the end of the URL
      const pageNumber = this.ENgrid.getPageNumber();
      const baseUrlWithoutPage = baseUrl.replace(`/${pageNumber}`, "");
      const baseUrlWithPage = `${baseUrlWithoutPage}/1`;

      const separator = baseUrl.includes("?") ? "&" : "?";
      iframe.src = `${baseUrlWithPage}${separator}chain&regive-iframe=true${
        optionsStr ? "&" + optionsStr : ""
      }`;

      this.log("Setting iframe source", "🔗", { src: iframe.src });

      // Set appropriate iframe attributes
      iframe.style.width = "100%";
      iframe.style.height = "500px"; // Default height, can be customized with an attribute
      iframe.style.border = "none";
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("width", "100%");
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("class", "regive-iframe");
      iframe.setAttribute("frameborder", "0");
      iframe.setAttribute("allowfullscreen", "true");
      iframe.setAttribute("allowpaymentrequest", "true");
      iframe.setAttribute("allow", "payment");

      // If height attribute exists on the regive tag, apply it to the iframe
      if (regiveTag.hasAttribute("height")) {
        iframe.style.height = regiveTag.getAttribute("height") + "px";
      }

      // Replace the regive tag with our iframe
      regiveTag.replaceWith(iframe);
    });
  }

  private watchTokens() {
    this.log("Setting up mutation observer for token fields", "👁️");

    // Function to save a field value to localStorage
    const saveFieldToStorage = (fieldName: string, storageKey: string) => {
      const value = this.ENgrid.getFieldValue(fieldName);
      if (
        value &&
        value !== "" &&
        value !== "," &&
        value !== localStorage.getItem(storageKey)
      ) {
        this.log(`Saving TOKEN ${fieldName} to localStorage`, "💾", value);
        localStorage.setItem(storageKey, value);
        return true;
      }
      return false;
    };

    // Create mutation observer
    this._observer = new MutationObserver(() => {
      // Check all our target fields on any DOM change
      saveFieldToStorage("transaction.ccnumber", "regive-num");
      saveFieldToStorage("transaction.ccvv", "regive-ver");
      saveFieldToStorage("transaction.ccexpire", "regive-exp");
    });

    // Start observing the form
    const form = this.ENgrid.enForm;
    if (form) {
      this._observer.observe(form, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      });
    } else {
      this.log("Donation form not found for observation", "🔴");
    }
  }

  private log(message: string, emoji: string = "🟢", data: any = null) {
    if (!this.debugMode) return;
    let color = "black";
    let bgColor = "#f0f0f0";
    switch (emoji) {
      case "🟢":
        color = "green";
        bgColor = "#d4edda";
        break;
      case "🔴":
        color = "red";
        bgColor = "#f8d7da";
        break;
      case "⚠️":
        color = "orange";
        bgColor = "#fff3cd";
        break;
      case "💾":
        color = "blue";
        bgColor = "#cce5ff";
        break;
      case "💰":
        color = "green";
        bgColor = "#d4edda";
        break;
      case "🥇":
      case "🥈":
        color = "purple";
        bgColor = "#e2e3e5";
        break;
      default:
        color = "black";
        bgColor = "#f0f0f0";
    }
    const style = `color: ${color}; background-color: ${bgColor}; font-weight: bold; font-family: monospace; font-size: 14px; padding: 4px 8px; border-radius: 4px;`;
    const type = window !== window.parent ? "Child" : "Parent";
    const formattedMessage = `%c${emoji} [Regive ${type}] ${message}`;
    if (data) {
      console.log(formattedMessage, style, data);
    } else {
      console.log(formattedMessage, style);
    }
  }
  // Extract options from the <regive> tag
  // and convert them to URL parameters
  // This function is called when replacing the <regive> tag with an iframe
  // It takes the <regive> tag element as an argument
  private getRegiveTagOptions(regiveTag: Element): string {
    // Get all attributes from the regive tag
    const attributes = regiveTag.attributes;
    const options: Record<string, string> = {};

    // Convert attributes to key-value pairs
    for (let i = 0; i < attributes.length; i++) {
      const attr = attributes[i];
      options[`regive-` + attr.name] = attr.value;
    }

    this.log("Extracted options from <regive> tag", "ℹ️", options);

    // Convert options to URL parameters
    const urlParams = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      urlParams.append(key, value);
    });

    return urlParams.toString();
  }
  // Load the Regive options from the URL parameters
  // This function is called when the page is loaded as a regive iFrame
  private loadOptionsFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    this.options = {} as RegiveOptions;

    // Iterate over each parameter and assign it to the options object
    for (const [key, value] of urlParams.entries()) {
      if (key.startsWith("regive-")) {
        const optionKey = key.replace("regive-", "");
        // Convert the option key to camelCase
        const camelCaseKey = optionKey.replace(/-([a-z])/g, (g) =>
          g[1].toUpperCase()
        );
        // Assign the value to the options object
        // Convert boolean string values to actual booleans
        if (camelCaseKey === "test" || camelCaseKey === "confetti") {
          if (value === "true") {
            (this.options as any)[camelCaseKey] = true;
          } else if (value === "false") {
            (this.options as any)[camelCaseKey] = false;
          } else {
            (this.options as any)[camelCaseKey] = value;
          }
        } else {
          (this.options as any)[camelCaseKey] = value;
        }
      }
    }

    this.log("Loaded options from URL", "ℹ️", this.options);
  }
}
