import { ENGrid } from "./engrid";
import { RegiveOptions } from "./regive-options";
import "./confetti";

export class Regive {
  private readonly ENgrid = ENGrid;
  private debugMode: boolean = false;
  private _observer: MutationObserver | null = null;
  private options: RegiveOptions | undefined;
  private readonly isEmbedded: boolean = window !== window.parent;
  private readonly isChained: boolean = !!this.ENgrid.getUrlParameter("chain");
  private iFrameId: string | null = null;

  private readonly themes = [
    "button-right",
    "button-left",
    "button-top",
    "stacked",
  ];

  constructor() {
    const regiveScript = document.querySelector("script[src*='regive']");
    // Check if the script is loaded with debug mode
    if (regiveScript) {
      const regiveScriptSrc = (regiveScript as HTMLScriptElement).src;
      this.debugMode = regiveScriptSrc.includes("debug");
    }
    this.log("Initializing Regive class");

    if (this.hasCaptcha()) {
      this.log("Page has a CAPTCHA. Regive will not run.", "⚠️");
      this.exit();
      return;
    }

    if (!this.isDonationPage()) {
      this.log("Not a donation page. Regive will not run.", "⚠️");
      this.exit();
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

  private hasCaptcha(): boolean {
    const hasCaptcha = !!document.querySelector(".g-recaptcha");
    this.log("Checking if the page has a CAPTCHA", "ℹ️", { hasCaptcha });
    return hasCaptcha;
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
      const submissionFailed = !!(
        (this.ENgrid.checkNested(
          window.EngagingNetworks,
          "require",
          "_defined",
          "enjs",
          "checkSubmissionFailed"
        ) &&
          window.EngagingNetworks?.require._defined.enjs.checkSubmissionFailed()) ||
        !!document.querySelector(".en__errorList li")
      );
      if (submissionFailed) {
        this.log("Server-side submission failed. Exiting", "🔴");
        this.exit();
        return;
      }
      if (this.hasVgsTokens() && this.hasRequiredFields() && this.isChained) {
        this.log(
          "Conditions met to hide the donation form and add a banner",
          "🟢"
        );
        this.ENgrid.setBodyData("embedded", "true");
        this.hideAll();
        this.addCustomBanner();
        this.writeHiddenFields();
        this.sendMessageToParent("loaded");
      } else {
        this.log("Conditions not met to modify the embedded page", "⚠️");
        this.exit();
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
        const regiveHeight = localStorage.getItem("regive-height") || "150";
        // Set the height of the body to the height of the regive banner
        this.hideAll();
        document.body.style.height = regiveHeight + "px";
        this.sendMessageToParent("height", regiveHeight);
        this.sendMessageToParent("loaded");
        this.sendMessageToParent("celebrate");
        this.sendMessageToParent("success");
      } else {
        this.log("Form was not submitted via Regive", "⚠️");
        this.exit();
      }
    } else {
      this.log(
        "Page is not embedded. Replacing <regive> tag with an <iframe>",
        "🟢"
      );
      this.replaceRegiveTagWithIframe();
      this.listenForMessagesFromChild();
    }
  }

  private hideAll() {
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

  private celebrate(colors: string, originY: number = 0.5) {
    if (colors === "false") {
      this.log("Confetti disabled", "🔴");
      return;
    }
    this.log("Celebrating the donation", "🎉", {
      colors,
      originY,
    });

    const confettiColors =
      colors === "default"
        ? []
        : colors.split(",").map((color) => color.trim());

    const duration = 4 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults: {
      startVelocity: number;
      ticks: number;
      zIndex: number;
      colors?: string[];
    } = {
      startVelocity: 30,
      ticks: 100,
      zIndex: 100000,
    };
    if (confettiColors.length > 0) {
      defaults.colors = confettiColors;
    }

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min;
    };

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }
      const particleCount = 60 * (timeLeft / duration);
      window.confetti(
        Object.assign({}, defaults, {
          particleCount,
          spread: randomInRange(50, 70),
          angle: randomInRange(55, 125),
          origin: { x: randomInRange(0.2, 0.8), y: originY },
        })
      );
      window.confetti(
        Object.assign({}, defaults, {
          particleCount,
          spread: randomInRange(50, 70),
          angle: randomInRange(55, 125),
          origin: { x: randomInRange(0.2, 0.8), y: originY },
        })
      );
    }, 250);
  }

  // Get the Y position of an element in the viewport
  private getElementYPosition(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const elementCenter = rect.top + rect.height / 2;
    const normalizedPosition = elementCenter / viewportHeight;
    return parseFloat(Math.max(0, Math.min(1, normalizedPosition)).toFixed(2));
  }

  private addCustomBanner() {
    if (this.options?.test) {
      this.log("Adding a custom banner to the page IN TEST MODE", "⚠️");
    } else {
      this.log("Adding a custom banner to the page", "🟢");
    }

    const currencySymbol = this.ENgrid.getCurrencySymbol();

    const amounts = this.options?.amount?.split(",") || ["5"];
    const labels: string[] = [];
    const bgColor = this.options?.bgColor || "#FFF";
    const txtColor = this.options?.txtColor || "#333";
    const buttonBgColor = this.options?.buttonBgColor || "#007BFF";
    const buttonTxtColor = this.options?.buttonTxtColor || "#FFF";
    const buttonLabel = this.options?.buttonLabel || "Add {{amount}}";
    const buttonLabelRegex = new RegExp("{{amount}}", "g");
    amounts.forEach((amount) => {
      const label = buttonLabel.replace(
        buttonLabelRegex,
        `<span class="regive-currency">${currencySymbol}</span><span class="regive-amount">${amount.trim()}</span>`
      );
      labels.push(label);
    });
    const heading = this.options?.heading || null;
    let theme = this.options?.theme || "stacked";
    let template;
    const isTest = this.options?.test || false;

    const templateCSS = `
    <style>
      .regive-embed {
        --regive-bg-color: ${bgColor};
        --regive-txt-color: ${txtColor};
        --regive-button-bg-color: ${buttonBgColor};
        --regive-button-txt-color: ${buttonTxtColor};
        --regive-button-label: ${buttonLabel};
        --regive-button-label-regex: ${buttonLabelRegex};
        --regive-theme: ${theme};
      }
      .regive-banner {
        background-color: var(--regive-bg-color);
        color: var(--regive-txt-color);
      }
      .regive-heading {
        color: var(--regive-txt-color);
      }
      .regive-amount-btn {
        background-color: var(--regive-button-bg-color);
        color: var(--regive-button-txt-color);
        border: 1px solid var(--regive-button-bg-color);
      }
      .regive-amount-btn:hover {
        background-color: var(--regive-button-txt-color);
        color: var(--regive-button-bg-color);
        border-color: var(--regive-button-bg-color);
      }
    </style>
    `;
    // Check if theme is not part of the predefined themes
    if (!this.themes.includes(theme)) {
      const templateElement = document.getElementById(theme);
      if (templateElement) {
        this.log("Using custom theme from the page", "🟢", theme);
        const templateContent = templateElement.innerHTML;
        // Check if the template has {{button}}
        if (templateContent.includes("{{button}}")) {
          template =
            templateCSS +
            templateContent.replace(
              "{{button}}",
              `
          <div class="regive-amounts">
            ${amounts
              .map((amount, index) => {
                return `<button class="regive-amount-btn" data-amount="${amount.trim()}">${
                  labels[index]
                }</button>`;
              })
              .join("")}
          </div>
          `
            );
          template = template.replace(
            /{{heading}}/g,
            heading ? `<h1 class="regive-heading">${heading}</h1>` : ""
          );
          template = template.replace(/{{theme}}/g, theme ? theme : "");
          template = template.replace(/{{bg-color}}/g, bgColor ? bgColor : "");
          template = template.replace(
            /{{txt-color}}/g,
            txtColor ? txtColor : ""
          );
          template = template.replace(
            /{{button-bg-color}}/g,
            buttonBgColor ? buttonBgColor : ""
          );
          template = template.replace(
            /{{button-txt-color}}/g,
            buttonTxtColor ? buttonTxtColor : ""
          );
          templateElement.remove();
        } else {
          this.log(
            "Custom theme does not have {{button}} - Using default theme",
            "🔴"
          );
          theme = "stacked";
        }
      } else {
        this.log("Custom theme not found - Using default theme", "🔴");
        theme = "stacked";
      }
    }
    if (!template) {
      this.log(`Using theme ${theme}`, "🟢");
      template = `
    ${templateCSS}
    <div class="regive-banner" data-theme="${theme}">
      ${heading ? `<h1 class="regive-heading">${heading}</h1>` : ""}
      <div class="regive-amounts">
        ${amounts
          .map((amount, index) => {
            return `<button class="regive-amount-btn" data-amount="${amount.trim()}">${
              labels[index]
            }</button>`;
          })
          .join("")}
      </div>
      </div>
    `;
    }

    const banner = document.createElement("div");
    banner.setAttribute("class", "regive-embed");
    if (isTest) {
      window.setTimeout(() => {
        banner.classList.add("regive-test");
      }, 2000);
    }
    banner.innerHTML = template;
    document.body.appendChild(banner);
    // Create a resize observer to send the height to the parent every time the banner is resized
    const observer = new ResizeObserver(() => {
      const bannerHeight = banner.getBoundingClientRect().height;
      if (bannerHeight > 0) {
        this.sendHeightToParent();
      }
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
    this.sendMessageToParent("enabled");
  }

  private writeHiddenFields() {
    const source = this.options?.source || "REGIVE";
    const tokens = this.getVgsTokens();
    const sourceField = this.ENgrid.getField(
      "supporter.appealCode"
    ) as HTMLInputElement;
    if (sourceField) {
      sourceField.value = source;
    } else {
      // Create the source field if it doesn't exist
      this.ENgrid.createHiddenInput("supporter.appealCode", source);
    }

    const expField = this.ENgrid.getField(
      "transaction.ccexpire"
    ) as HTMLInputElement;

    if (expField) {
      if (expField instanceof HTMLInputElement) {
        expField.value = tokens.exp || "";
        this.log("Setting expiration field value", "💾", {
          field: expField.name,
          value: tokens.exp || "",
        });
      } else {
        const expFieldValues = tokens.exp?.includes(",")
          ? tokens.exp.split(",")
          : tokens.exp?.split("/");
        if (expFieldValues && expFieldValues.length > 1) {
          const expFieldSelects = document.querySelectorAll(
            "select[name='transaction.ccexpire']"
          ) as NodeListOf<HTMLSelectElement>;
          expFieldSelects.forEach((select, index) => {
            if (index < expFieldValues.length) {
              select.value = expFieldValues[index].trim();
              this.log("Setting expiration field value", "💾", {
                field: select.name,
                value: expFieldValues[index].trim(),
              });
              // If an external script changes the select options, we need to update the selected value
              const observer = new MutationObserver(() => {
                if (select.value !== expFieldValues[index].trim()) {
                  select.value = expFieldValues[index].trim();
                  this.log("Updating expiration field BACK", "💾", {
                    field: select.name,
                    value: expFieldValues[index].trim(),
                  });
                }
              });
              observer.observe(select, { attributes: true });
            }
          });
        }
      }
    }
    const numField = this.ENgrid.getField(
      "transaction.ccnumber"
    ) as HTMLInputElement;
    if (numField) {
      numField.value = tokens.num || "";
    }
    const verField = this.ENgrid.getField(
      "transaction.ccvv"
    ) as HTMLInputElement;
    if (verField) {
      verField.value = tokens.ver || "";
    }
    const cardTypeField = this.ENgrid.getField(
      "transaction.vgs.cardType"
    ) as HTMLInputElement;
    if (cardTypeField) {
      cardTypeField.value = tokens.card || "";
    } else {
      this.ENgrid.createHiddenInput(
        "transaction.vgs.cardType",
        tokens.card || ""
      );
    }
    this.setOneTimeFrequency();
    this.ENgrid.setPaymentType("card");

    // Uncheck the fee cover box if it exists
    const feeCover = this.ENgrid.getField(
      "transaction.feecover"
    ) as HTMLInputElement;
    if (feeCover && feeCover.checked) {
      feeCover.checked = false;
    }

    this.log("Writing hidden fields to the form", "💾", {
      source,
      tokens,
    });
  }

  private wasSubmittedViaRegive(): boolean {
    const submittedPage = localStorage.getItem("regive-submitted");
    const currentPage = this.ENgrid.getPageID();
    this.log("Checking if the form was submitted via Regive", "ℹ️", {
      submittedPage,
      currentPage,
    });
    if (submittedPage && submittedPage === currentPage.toString()) {
      this.log("Form was submitted via Regive", "🟢");
      localStorage.removeItem("regive-submitted");
      return true;
    }
    this.log("Form was not submitted via Regive", "🔴");
    return false;
  }
  private hasRequiredFields(): boolean {
    const requiredFields = document.querySelectorAll(".en__mandatory input") as NodeListOf<HTMLInputElement>;
    requiredFields.forEach((field) => {
      if(field.id.includes("transaction")) return; // Skip transaction fields as they are handled separately
      if (!field.value) {
        this.log("Required field is empty", "🔴", { field: field.name });
        return false;
      }
    });
    return true;
  }
  private hasVgsTokens(): boolean {
    if (this.options?.test) {
      this.log("Test mode enabled. Skipping VGS token check", "⚠️");
      return true;
    }
    const hasTokens = !!(
      localStorage.getItem("regive-num") &&
      localStorage.getItem("regive-ver") &&
      localStorage.getItem("regive-exp") &&
      localStorage.getItem("regive-card")
    );
    this.log("Checking if VGS tokens exist in localStorage", "ℹ️", {
      hasTokens,
    });
    return hasTokens;
  }

  private getVgsTokens(): {
    num: string | null;
    ver: string | null;
    exp: string | null;
    card: string | null;
  } {
    const num = localStorage.getItem("regive-num");
    const ver = localStorage.getItem("regive-ver");
    const exp = localStorage.getItem("regive-exp");
    const card = localStorage.getItem("regive-card");
    this.log("Retrieving VGS tokens from localStorage", "💾", {
      num,
      ver,
      exp,
      card,
    });
    return { num, ver, exp, card };
  }

  private clearVgsTokens() {
    this.log("Clearing VGS tokens from localStorage", "💾");
    localStorage.removeItem("regive-num");
    localStorage.removeItem("regive-ver");
    localStorage.removeItem("regive-exp");
    localStorage.removeItem("regive-card");
    localStorage.removeItem("regive-submitted");
    localStorage.removeItem("regive-height");
  }

  private replaceRegiveTagWithIframe() {
    const regiveTags = document.querySelectorAll("regive");
    regiveTags.forEach((regiveTag) => {
      this.log("Replacing <regive> tag with an iframe");

      // Get options from the regive tag
      const thankYouMessage =
        regiveTag.getAttribute("thank-you-message") || "Thank You!";
      const confetti = regiveTag.getAttribute("confetti") || "default";
      const bgColor = regiveTag.getAttribute("bg-color") || "#FFF";
      const txtColor = regiveTag.getAttribute("txt-color") || "#333";
      const test = regiveTag.getAttribute("test") || "false";
      const basePage = regiveTag.getAttribute("base-page") || "";
      const optionsStr = this.getRegiveTagOptions(regiveTag);

      // Create iframe element
      const iframe = document.createElement("iframe");

      // Build the iframe src URL with options
      let iframeSrc = `${window.location.href}`;
      if (basePage && basePage.match(/^https?:\/\//)) {
        this.log("Using absolute URL for iframe source", "ℹ️", { basePage });
        // Merge the basePage URL with the current URL parameters
        const basePageUrl = new URL(basePage);
        const currentUrlParams = new URLSearchParams(window.location.search);
        currentUrlParams.forEach((value, key) => {
          basePageUrl.searchParams.append(key, value);
        });
        iframeSrc = basePageUrl.toString();
      } else if (basePage && basePage.match(/^[0-9]+$/)) {
        this.log("Using relative URL for iframe source", "ℹ️", { basePage });
        const currentUrl = new URL(window.location.href);
        currentUrl.pathname = currentUrl.pathname.replace(/page\/[0-9]+/, `page/${basePage}`);
        iframeSrc = currentUrl.toString();
      }
      // Replace the current page with /1 from the end of the URL
      const pageNumber = this.ENgrid.getPageNumber();
      const baseUrlWithoutPage = iframeSrc.replace(`/${pageNumber}`, "");
      const baseUrlWithPage = `${baseUrlWithoutPage}/1`;

      const separator = iframeSrc.includes("?") ? "&" : "?";
      iframe.src = `${baseUrlWithPage}${separator}chain${
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
      if (test === "true") {
        regiveContainer.dataset.test = "true";
      }
      regiveContainer.style.setProperty("--regive-bg-color", bgColor);
      regiveContainer.style.setProperty("--regive-txt-color", txtColor);
      regiveContainer.appendChild(iframe);

      // Add Thank You message
      if (thankYouMessage) {
        const thankYouMessageElement = document.createElement("div");
        thankYouMessageElement.setAttribute("class", "regive-thank-you");
        thankYouMessageElement.innerHTML = `<h2>${thankYouMessage}</h2>`;
        regiveContainer.appendChild(thankYouMessageElement);
      }

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
      saveFieldToStorage("transaction.vgs.cardType", "regive-card");
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
      this.log("Not in an embedded iFrame. This is a Dev Mistake.", "🔴");
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

      if (!iframeContainer) {
        this.log("Could not find the iframe container", "⚠️");
        return;
      }

      const data = event.data;
      this.log("Received message from child iframe", "📩", data);
      switch (data.action) {
        case "enabled":
          this.ENgrid.setBodyData("enabled", "true");
          break;
        case "loaded":
          iframeContainer.classList.add("regive-loaded");
          iframeContainer.classList.remove("regive-loading");
          break;
        case "loading":
          iframeContainer.classList.add("regive-loading");
          iframeContainer.classList.remove("regive-loaded");
          break;
        case "celebrate":
          this.celebrate(
            iframeContainer.dataset.confetti || "",
            this.getElementYPosition(iframeContainer)
          );
          break;
        case "success":
          const iframeContainerParent =
            iframeContainer.closest(".en__component");
          if (iframeContainerParent) {
            iframeContainerParent.classList.add("regive-success");
          }
          iframeContainer.classList.add("regive-success");
          if (iframeContainer.dataset.test !== "true") {
            this.clearVgsTokens();
          }
          break;
        case "reset":
          const iframeContainerParentReset =
            iframeContainer.closest(".en__component");
          if (iframeContainerParentReset) {
            iframeContainerParentReset.classList.remove("regive-success");
          }
          iframeContainer.classList.remove("regive-success");
          break;
        case "height":
          if (data.value && data.value > 0) {
            iframeContainer.style.height = data.value + "px";
            (iframe as HTMLIFrameElement).style.height = data.value + "px";
            (iframe as HTMLIFrameElement).style.width = "100%";
            this.log("Iframe height set to", "📏", data.value);
          } else {
            this.log("Hiding iframe container", "🙈");
            iframeContainer.style.display = "none";
          }
          break;
        case "exit":
          if (iframeContainer.classList.contains("regive-success")) {
            this.log("Donation was successful, not exiting", "🟢");
            return;
          }
          this.log("Child iframe requested exit", "🚪");
          this.ENgrid.setBodyData("enabled", "false");
          iframeContainer.remove();
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
        .querySelector(".regive-embed")
        ?.getBoundingClientRect()
        .height.toFixed(0);
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
  private setAmount(amount: number) {
    // Run only if it is a Donation Page with a Donation Amount field
    if (!document.getElementsByName("transaction.donationAmt").length) {
      return;
    }
    // Search for the current amount on radio boxes
    let found = Array.from(
      document.querySelectorAll('input[name="transaction.donationAmt"]')
    ).filter(
      (el) => el instanceof HTMLInputElement && parseInt(el.value) == amount
    );
    // We found the amount on the radio boxes, so check it
    const otherField = document.querySelector(
        'input[name="transaction.donationAmt.other"]'
      ) as HTMLInputElement;
    if (found.length) {
      const amountField = found[0] as HTMLInputElement;
      amountField.checked = true;
      // Other amount field value can be set to a previous value with chain links, so we need to clear it to avoid overlapping values
      if(otherField) {
        otherField.value = "";
      }
    } else if (otherField) {
        const enFieldOtherAmountRadio = document.querySelector(
          `.en__field--donationAmt.en__field--withOther .en__field__item:nth-last-child(2) input[name="transaction.donationAmt"]`
        ) as HTMLInputElement;
        if (enFieldOtherAmountRadio) {
          enFieldOtherAmountRadio.checked = true;
        }
        otherField.value = parseFloat(amount.toString()).toFixed(2);
    } else {
      this.log("Could not find a way to set the amount field", "🔴");
    }
  }
  private submitForm(amount: string) {
    this.log("Submitting form with amount", "💰", { amount });
    this.sendMessageToParent("loading");
    if (this.options?.test) {
      this.log("Test mode enabled. Not submitting the form.", "⚠️");
      window.setTimeout(() => {
        this.sendMessageToParent("loaded");
        this.sendMessageToParent("celebrate");
        this.sendMessageToParent("success");
      }, 3000);
      window.setTimeout(() => {
        // Reset the UX
        this.sendMessageToParent("reset");
      }, 8000);
      return;
    }
    const form = this.ENgrid.enForm;
    if (form) {
      // EN has a bug where the embedded form will FORCE the use of the feeCover if the parent donation form was set to cover fees
      // No matter what the user selects on the regive form
      // So we need to set the amount to a lower amount to consider the fees in case the user selected to cover fees
      const feeCover = this.ENgrid.getField(
        "transaction.feeCover"
      ) as HTMLInputElement;
      if (feeCover && feeCover.checked) {
        // I'll need a shower after this
        const feeCoverAmount =
          window.EngagingNetworks?.feeCover?.feeCover?.additionalAmount || 0;
        const feeCoverPercent =
          window.EngagingNetworks?.feeCover?.feeCover?.percent || 0;
        const feeCoverType =
          window.EngagingNetworks?.feeCover?.feeCover?.type || "PERCENT";
        if (feeCoverType === "PERCENT") {
          amount = (parseFloat(amount) / (1 + feeCoverPercent / 100)).toFixed(
            2
          );
        } else if (feeCoverType === "AMOUNT") {
          amount = (parseFloat(amount) - feeCoverAmount).toFixed(2);
        }
      }
      this.setAmount(parseFloat(amount));
      localStorage.setItem(
        "regive-submitted",
        this.ENgrid.getPageID().toString()
      );
      const regiveHeight = document
        .querySelector(".regive-embed")
        ?.getBoundingClientRect().height;
      if (regiveHeight) {
        localStorage.setItem("regive-height", regiveHeight.toString());
      }
      form.submit();
    } else {
      this.log("Form not found. Cannot submit.", "🔴");
    }
  }
  private setOneTimeFrequency() {
    this.ENgrid.setFieldValue("transaction.recurrfreq", "ONETIME");
    const recurrpayField = this.ENgrid.getField("transaction.recurrpay");
    if (
      recurrpayField &&
      recurrpayField instanceof HTMLInputElement &&
      recurrpayField.type === "radio"
    ) {
      // When it's a radio box, check the option with value="N"
      const radioOptions = document.querySelectorAll(
        'input[name="transaction.recurrpay"]'
      ) as NodeListOf<HTMLInputElement>;
      radioOptions.forEach((radio) => {
        if (radio.value === "N") {
          radio.checked = true;
          this.log("Set recurrpay radio to N", "💾");
        }
      });
    } else {
      // When it's a hidden field, set the value to empty
      this.ENgrid.setFieldValue("transaction.recurrpay", "");
    }
    this.log("Set one-time frequency", "💾");
  }

  // Exit the Regive Process
  public exit() {
    this.log("Exiting Regive process", "🚪");
    this.clearVgsTokens();
    if (this.isEmbedded) {
      this.sendMessageToParent("exit");
    }
  }
}
