import { ENGrid } from "./engrid";
import { RegiveOptions } from "./regive-options";

export class Regive {
  private readonly ENgrid = ENGrid;
  private debugMode: boolean = false;
  private _observer: MutationObserver | null = null;
  private options: RegiveOptions | undefined;
  private readonly isEmbedded: boolean = window !== window.parent;
  private readonly isChained: boolean = !!this.ENgrid.getUrlParameter("chain");
  private iFrameId: string | null = null;

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
        this.sendMessageToParent("loaded");
      } else {
        this.log("Conditions not met to modify the embedded page", "⚠️");
        this.hideAll();
        this.sendHeightToParent();
        this.sendMessageToParent("loaded");
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
        this.sendMessageToParent("finished");
      } else {
        this.log("Form was not submitted via Regive", "⚠️");
      }
    } else {
      this.log(
        "Page is not embedded. Replacing <regive> tag with an iframe",
        "🟢"
      );
      this.replaceRegiveTagWithIframe();
      this.listenForMessagesFromChild();
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

  // private celebrate() {
  //   this.log("Celebrating the donation", "🎉");
  //   const confetti = this.options?.confetti
  //     ? this.options.confetti === true
  //       ? ["#FF0000", "#00FF00", "#0000FF"]
  //       : this.options.confetti.split(",")
  //     : [];
  //   this.log("Confetti colors", "🎨", { confetti });
  //   // TODO: Implement confetti celebration
  // }

  private addCustomBanner() {
    this.log("Adding a custom banner to the page");

    const amounts = this.options?.amount?.split(",") || ["5"];
    const bgColor = this.options?.bgColor || "#FFF";
    const txtColor = this.options?.txtColor || "#333";
    const buttonBgColor = this.options?.buttonBgColor || "#007BFF";
    const buttonTxtColor = this.options?.buttonTxtColor || "#FFF";
    const heading = this.options?.heading || null;
    const theme = this.options?.theme || "stacked";
    const currencySymbol = this.ENgrid.getCurrencySymbol();

    const template = `
    <style>
      .regive-banner {
        background-color: ${bgColor};
        color: ${txtColor};
      }
      .regive-heading {
        color: ${txtColor};
      }
      .regive-amount-btn {
        background-color: ${buttonBgColor};
        color: ${buttonTxtColor};
      }
      .regive-amount-btn:hover {
        background-color: ${buttonBgColor}CC;
      }
      .regive-amount-btn:active {
        background-color: ${buttonBgColor}AA;
      }
    </style>
    <div class="regive-banner" data-theme="${theme}">
      ${heading ? `<h1 class="regive-heading">${heading}</h1>` : ""}
      <div class="regive-amounts">
        ${amounts
          .map((amount) => {
            return `<button class="regive-amount-btn" data-amount="${amount.trim()}"><span class="regive-currency">${currencySymbol}</span><span class="regive-amount">${amount.trim()}</span></button>`;
          })
          .join("")}
      </div>
      </div>
    `;

    const banner = document.createElement("div");
    banner.innerHTML = template;
    document.body.appendChild(banner);
    // Create a resize observer to send the height to the parent every time the banner is resized
    const observer = new ResizeObserver(() => {
      this.sendHeightToParent();
    });
    observer.observe(banner);
    // Add event listeners to the buttons
    const buttons = banner.querySelectorAll(".regive-amount-btn");
    buttons.forEach((button) => {
      button.addEventListener("click", (event) => {
        const amount = (event.currentTarget as HTMLButtonElement).dataset
          .amount as string;
        this.log("Amount button clicked", "💰", { amount });
        this.submitForm(amount);
      });
    });
    // Send banner height to parent
    this.sendHeightToParent();
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
      const thankYouMessage = regiveTag.getAttribute("thank-you-message") || "";
      const confetti = regiveTag.getAttribute("confetti") || "false";
      const bgColor = regiveTag.getAttribute("bg-color") || "#FFF";
      const txtColor = regiveTag.getAttribute("txt-color") || "#333";
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

      // Generate iframe ID
      this.iFrameId = `regive-iframe-${Math.random()
        .toString(36)
        .substring(2, 9)}`;
      iframe.id = this.iFrameId;

      // Set appropriate iframe attributes
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      iframe.style.border = "none";
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("width", "1px");
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

      // Create the regive container
      const regiveContainer = document.createElement("div");
      regiveContainer.setAttribute("class", "regive-container");
      regiveContainer.dataset.thankYouMessage = thankYouMessage;
      regiveContainer.dataset.confetti = confetti;
      regiveContainer.style.setProperty("--regive-bg-color", bgColor);
      regiveContainer.style.setProperty("--regive-txt-color", txtColor);
      regiveContainer.appendChild(iframe);

      // Replace the regive tag with our iframe
      regiveTag.replaceWith(regiveContainer);
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
      return console.log(formattedMessage, style, data);
    } else {
      return console.log(formattedMessage, style);
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

    const srcParams = new URLSearchParams();

    // Convert attributes to key-value pairs
    for (let i = 0; i < attributes.length; i++) {
      const attr = attributes[i];
      if (attr.name === "params") {
        // params is something like "key1=value1&key2=value2"
        const params = new URLSearchParams(attr.value);
        params.forEach((value, key) => {
          srcParams.append(key, value);
        });
        continue;
      }
      options[`regive-` + attr.name] = attr.value;
    }

    this.log("Extracted options from <regive> tag", "ℹ️", options);

    // Convert options to URL parameters
    const urlParams = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      urlParams.append(key, value);
    });

    // Append the srcParams to the urlParams
    srcParams.forEach((value, key) => {
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

  // Send an action to the parent window
  private sendMessageToParent(action: string, value: any = null) {
    if (this.isEmbedded) {
      this.log("Sending message to parent window", "📤", { action, value });
      window.parent.postMessage(
        {
          sender: "regive",
          action: action,
          value: value,
        },
        "*"
      );
    } else {
      this.log(
        "Not in an embedded context. Cannot send message to parent.",
        "⚠️"
      );
    }
  }
  // Listen for messages from the parent window
  private listenForMessagesFromChild() {
    this.log("Listening for messages from child iframes", "👂");
    window.addEventListener("message", (event) => {
      // Check if the message is from regive
      if (!event.data || !event.data.sender || event.data.sender !== "regive") {
        return;
      }
      // Find the iframe that sent the message by comparing contentWindow with event.source
      const iframeSource = event.source as Window;
      let iframe: HTMLIFrameElement | null = null;

      // Look through all regive iframes to find the one that sent this message
      const iframes = document.querySelectorAll(
        "iframe.regive-iframe"
      ) as NodeListOf<HTMLIFrameElement>;
      iframes.forEach((frame: HTMLIFrameElement) => {
        if (iframe) return; // Skip if iframe already found
        try {
          if (frame.contentWindow === iframeSource) {
            iframe = frame as HTMLIFrameElement;
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "SecurityError") {
            this.log("SecurityError accessing contentWindow of iframe", "⚠️", {
              frame,
            });
          } else {
            throw error;
          }
        }
      });

      if (!iframe) {
        this.log("Could not identify which iframe sent the message", "⚠️");
        return;
      }

      const iframeContainer = (iframe as HTMLIFrameElement)
        .parentElement as HTMLDivElement;

      const data = event.data;
      this.log("Received message from child iframe", "📩", data);
      switch (data.action) {
        case "loaded":
          if (iframeContainer) {
            iframeContainer.classList.add("regive-loaded");
            iframeContainer.classList.remove("regive-loading");
          }
          break;
        case "loading":
          if (iframeContainer) {
            iframeContainer.classList.add("regive-loading");
            iframeContainer.classList.remove("regive-loaded");
          }
          break;
        case "finished":
          this.clearVgsTokens();
          break;
        case "height":
          if (data.value && data.value > 0) {
            if (iframeContainer) {
              iframeContainer.style.height = data.value + "px";
              (iframe as HTMLIFrameElement).style.height = data.value + "px";
              (iframe as HTMLIFrameElement).style.width = "100%";
              this.log("Iframe height set to", "📏", data.value);
            }
          } else {
            this.log("Hiding iframe container", "🙈");
            if (iframeContainer) {
              iframeContainer.style.display = "none";
            }
          }
          break;
        default:
          this.log("Unknown action received from child iframe", "🔴", data);
          break;
      }
    });
  }
  // Send the height of the iframe to the parent window
  private sendHeightToParent() {
    if (this.isEmbedded) {
      const height = document
        .querySelector(".regive-banner")
        ?.getBoundingClientRect().height;
      if (!height) {
        this.log("Sending height of 0 to parent", "🙈");
        this.sendMessageToParent("height", 0);
        return;
      }
      this.sendMessageToParent("height", height);
    } else {
      this.log("Not in an embedded iFrame. This is a Dev Mistake.", "🔴");
    }
  }
  private submitForm(amount: string) {
    this.log("Submitting form with amount", "💰", { amount });
    // TODO: Implement the logic to submit the form with the selected amount
    this.sendMessageToParent("loading");
    window.setTimeout(() => {
      this.sendMessageToParent("loaded");
    }, 5000);
  }
}
