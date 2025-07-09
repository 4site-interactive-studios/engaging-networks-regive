/**
 * This is adapted from https://github.com/4site-interactive-studios/engrid/blob/main/packages/scripts/src/engrid.ts
 */

export abstract class ENGrid {
  constructor() {
    if (!ENGrid.enForm) {
      throw new Error("Engaging Networks Form Not Found!");
    }
  }

  static get enForm(): HTMLFormElement {
    return document.querySelector("form.en__component") as HTMLFormElement;
  }

  // Return any parameter from the URL
  static getUrlParameter(name: string) {
    const searchParams = new URLSearchParams(window.location.search);
    // Add support for array on the name ending with []
    if (name.endsWith("[]")) {
      let values: Object[] = [];
      searchParams.forEach((value, key) => {
        if (key.startsWith(name.replace("[]", ""))) {
          values.push(new Object({ [key]: value }));
        }
      });
      return values.length > 0 ? values : null;
    }
    if (searchParams.has(name)) {
      return searchParams.get(name) || true;
    }
    return null;
  }
  static getField(name: string) {
    // Get the field by name
    return document.querySelector(`[name="${name}"]`);
  }
  // Return the field value from its name. It works on any field type.
  // Multiple values (from checkboxes or multi-select) are returned as single string
  // Separated by ,
  static getFieldValue(name: string) {
    return new FormData(this.enForm).getAll(name).join(",");
  }

  // Set a value to any field. If it's a dropdown, radio or checkbox, it selects the proper option matching the value
  static setFieldValue(
    name: string,
    value: unknown,
    dispatchEvents: boolean = false
  ) {
    if (value === ENGrid.getFieldValue(name)) return;
    (document.getElementsByName(name) as NodeListOf<HTMLFormElement>).forEach(
      (field) => {
        if ("type" in field) {
          switch (field.type) {
            case "select-one":
            case "select-multiple":
              for (const option of field.options) {
                if (option.value == value) {
                  option.selected = true;
                  if (dispatchEvents) {
                    field.dispatchEvent(new Event("change", { bubbles: true }));
                  }
                }
              }
              break;
            case "checkbox":
            case "radio":
              if (field.value == value) {
                field.checked = true;
                if (dispatchEvents) {
                  field.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }
              break;
            case "textarea":
            case "text":
            default:
              field.value = value;
              if (dispatchEvents) {
                field.dispatchEvent(new Event("change", { bubbles: true }));
                field.dispatchEvent(new Event("blur", { bubbles: true }));
              }
          }
          field.setAttribute("engrid-value-changed", "");
        }
      }
    );
    return;
  }

  // Return the page count
  static getPageCount() {
    if ("pageJson" in window) return window?.pageJson?.pageCount || 0;
    return 0;
  }

  // Return the current page number
  static getPageNumber() {
    if ("pageJson" in window) return window?.pageJson?.pageNumber || 0;
    return 0;
  }

  static isThankYouPage() {
    return this.getPageNumber() === this.getPageCount();
  }

  // Return the current page ID
  static getPageID() {
    if ("pageJson" in window) return window?.pageJson?.campaignPageId || 0;
    return 0;
  }

  // Return the client ID
  static getClientID() {
    if ("pageJson" in window) return window?.pageJson?.clientId || 0;
    return 0;
  }

  // Return the current page type
  static getPageType() {
    if (
      "pageJson" in window &&
      window.pageJson &&
      "pageType" in window.pageJson
    ) {
      switch (window.pageJson.pageType) {
        case "p2pcheckout":
        case "p2pdonation":
        case "donation":
        case "premiumgift":
          return "DONATION";
          break;
        case "e-card":
          return "ECARD";
          break;
        case "otherdatacapture":
        case "survey":
          return "SURVEY";
          break;
        case "emailtotarget":
          return "EMAILTOTARGET";
          break;
        case "advocacypetition":
          return "ADVOCACY";
          break;
        case "emailsubscribeform":
          return "SUBSCRIBEFORM";
          break;
        case "event":
          return "EVENT";
          break;
        case "supporterhub":
          return "SUPPORTERHUB";
          break;
        case "unsubscribe":
          return "UNSUBSCRIBE";
          break;
        case "tweetpage":
          return "TWEETPAGE";
          break;
        default:
          return "UNKNOWN";
      }
    } else {
      return "UNKNOWN";
    }
  }

  // Set body data attributes
  static setBodyData(dataName: string, value: string | boolean) {
    const body = <HTMLBodyElement>document.querySelector("body");
    // If value is boolean
    if (typeof value === "boolean" && value === false) {
      body.removeAttribute(`data-regive-${dataName}`);
      return;
    }
    body.setAttribute(`data-regive-${dataName}`, value.toString());
  }

  // Get body data attributes
  static getBodyData(dataName: string) {
    const body = <HTMLBodyElement>document.querySelector("body");
    return body.getAttribute(`data-regive-${dataName}`);
  }
  // Check if body has data attributes
  static hasBodyData(dataName: string) {
    const body = <HTMLBodyElement>document.querySelector("body");
    return body.hasAttribute(`data-regive-${dataName}`);
  }

  // Set a new amount
  static setAmount(amount: number) {
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
    if (found.length) {
      const amountField = found[0] as HTMLInputElement;
      amountField.checked = true;
    } else {
      const otherField = document.querySelector(
        'input[name="transaction.donationAmt.other"]'
      ) as HTMLInputElement;
      if (otherField) {
        const enFieldOtherAmountRadio = document.querySelector(
          `.en__field--donationAmt.en__field--withOther .en__field__item:nth-last-child(2) input[name="transaction.donationAmt"]`
        ) as HTMLInputElement;
        if (enFieldOtherAmountRadio) {
          enFieldOtherAmountRadio.checked = true;
        }
        otherField.value = parseFloat(amount.toString()).toFixed(2);
      }
    }
  }
  /**
   * Check if the provided object has ALL the provided properties
   * Example: checkNested(EngagingNetworks, 'require', '_defined', 'enjs', 'checkSubmissionFailed')
   * will return true if EngagingNetworks.require._defined.enjs.checkSubmissionFailed is defined
   */
  static checkNested(obj: any, ...args: string[]) {
    for (let i = 0; i < args.length; i++) {
      if (!obj || !obj.hasOwnProperty(args[i])) {
        return false;
      }
      obj = obj[args[i]];
    }
    return true;
  }

  // Deep merge two objects
  static deepMerge(target: any, source: any) {
    for (const key in source) {
      if (source[key] instanceof Object)
        Object.assign(source[key], ENGrid.deepMerge(target[key], source[key]));
    }
    Object.assign(target || {}, source);
    return target;
  }
  static getCurrencySymbol(): string {
    const currencyField = ENGrid.getField(
      "transaction.paycurrency"
    ) as HTMLSelectElement;
    if (currencyField) {
      // Check if the selected currency field option have a data-currency-symbol attribute
      const selectedOption =
        currencyField.tagName === "SELECT"
          ? currencyField.options[currencyField.selectedIndex]
          : currencyField;
      if (selectedOption.dataset.currencySymbol) {
        return selectedOption.dataset.currencySymbol;
      }
      const currencyArray = {
        USD: "$",
        EUR: "€",
        GBP: "£",
        AUD: "$",
        CAD: "$",
        JPY: "¥",
      };
      return (currencyArray as any)[currencyField.value] || "$";
    }
    return "$";
  }
  static getCurrencyCode(): string {
    const currencyField = ENGrid.getField(
      "transaction.paycurrency"
    ) as HTMLSelectElement;
    if (currencyField) {
      return currencyField.value || "USD";
    }
    return "USD";
  }
  // Get the Payment Type
  static getPaymentType(): string {
    return ENGrid.getFieldValue("transaction.paymenttype");
  }
  // Set the Payment Type
  static setPaymentType(paymentType: string) {
    const paymentTypeFields = document.querySelectorAll(
      '[name="transaction.paymenttype"]'
    ) as NodeListOf<HTMLInputElement | HTMLSelectElement>;

    if (paymentTypeFields.length === 0) {
      // Create a hidden field if no payment type field exists
      const hiddenField = document.createElement("input");
      hiddenField.type = "hidden";
      hiddenField.name = "transaction.paymenttype";
      hiddenField.value = paymentType;
      ENGrid.enForm.appendChild(hiddenField);
      return;
    }

    paymentTypeFields.forEach((field) => {
      if (field.tagName === "SELECT") {
        const selectField = field as HTMLSelectElement;
        const paymentTypeOption = Array.from(selectField.options).find(
          (option) =>
            paymentType.toLowerCase() === "card"
              ? ["card", "visa", "vi"].includes(option.value.toLowerCase())
              : paymentType.toLowerCase() === option.value.toLowerCase()
        );
        if (paymentTypeOption) {
          paymentTypeOption.selected = true;
          selectField.value = paymentTypeOption.value;
        } else {
          selectField.value = paymentType;
        }
        const event = new Event("change", {
          bubbles: true,
          cancelable: true,
        });
        selectField.dispatchEvent(event);
      } else if (field.type === "radio") {
        const radioField = field as HTMLInputElement;
        const shouldCheck =
          paymentType.toLowerCase() === "card"
            ? ["card", "visa", "vi"].includes(radioField.value.toLowerCase())
            : paymentType.toLowerCase() === radioField.value.toLowerCase();

        if (shouldCheck) {
          radioField.checked = true;
          const event = new Event("change", {
            bubbles: true,
            cancelable: true,
          });
          radioField.dispatchEvent(event);
        }
      } else if (field.type === "hidden") {
        const hiddenField = field as HTMLInputElement;
        hiddenField.value = paymentType;
      }
    });
  }
}
