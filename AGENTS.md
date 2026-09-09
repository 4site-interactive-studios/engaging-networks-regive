# AGENTS.md — Engaging Networks Regive

## Project Summary

Engaging Networks Regive is a standalone, zero-dependency component that enables one-click instant donations on Engaging Networks "Thank You" pages. After a donor completes a donation, the component captures VGS transaction tokens and presents a customizable UI for making an additional donation with a single click — no form re-entry required.

## Tech Stack

- **TypeScript** (strict mode) — core language
- **SCSS** — styling with CSS variables for theming
- **Vite 6** — bundler producing a single ES module
- **Vanilla DOM** — no frameworks; plain JavaScript DOM manipulation
- **Zero runtime dependencies** — everything is bundled into one file

## Architecture

### Source Layout

```
src/
  main.ts                 # Entry point — imports styles, calls Regive.init()
  style.scss              # All component styles (themes, animations, utility classes)
  vite-env.d.ts           # Vite client types
  lib/
    regive.ts             # Main class — lifecycle, UI, form submission, iframe messaging
    regive-options.ts     # RegiveOptions interface (all configuration attributes)
    engrid.ts             # ENGrid utility class — EN form/field/page helpers
    confetti.js           # Canvas-based confetti animation (vanilla JS)
global.d.ts               # Global type declarations (Window.EngagingNetworks, etc.)
```

### Key Classes

- **Regive** (`regive.ts`) — Singleton orchestrating the full lifecycle: page detection, token capture, banner rendering, form submission, iframe communication, and confetti celebration. Created via `Regive.init()`.
- **ENGrid** (`engrid.ts`) — Static utility class for reading/writing Engaging Networks form fields, detecting page types, handling currency, and managing body data attributes.
- **RegiveOptions** (`regive-options.ts`) — TypeScript interface defining every configuration attribute (amounts, colors, text, theme, advanced flags).
- **RegiveConfetti** (`confetti.js`) — Canvas particle animation with physics. Exposed on `window.confetti`.

### Component Lifecycle

1. **First page (donation form):** A MutationObserver watches for VGS token fields, the payment type, and the donation amount. When the donor submits, values are saved to localStorage (`regive-num`, `regive-ver`, `regive-exp`, `regive-card`, `regive-paymenttype`, `regive-donation-amt`). Digital wallet submissions are detected via wallet button listeners and recorded as `regive-dw-paymenttype` (a card token appearing clears the stale wallet key so the card path wins).
2. **Thank-you page (non-embedded):** The `<regive>` HTML tag is replaced with an iframe pointing back to the donation page with a `?chain` parameter.
3. **Thank-you page (embedded/iframe):** The component reads tokens from localStorage, runs `processAmounts` to resolve the amount list, renders the banner (teleporting the CAPTCHA in if the page has one), and on click submits a second donation using the stored tokens. With digital wallets enabled, the wallet UI is moved into the banner and amount buttons *select* instead of submit. On success it triggers confetti and posts a message to the parent. Server-side submission failures (EN error list or `enjs.checkSubmissionFailed()`) cause an immediate exit.

### Parent-Child Communication

All iframe messaging uses `postMessage` with the shape `{ sender: "regive", action: string, value: any }`. Actions include: `enabled`, `loaded`, `loading`, `celebrate`, `success`, `reset`, `height`, `exit`. Always validate `sender === "regive"` when handling messages.

### Options Resolution Order

HTML attributes on `<regive>` tag > URL parameters > JavaScript defaults. Attributes use kebab-case (`thank-you-message`), internally converted to camelCase.

### Theme System

Built-in themes: `stacked`, `button-right`, `button-left`, `button-top`. Custom themes are defined as `<template>` elements whose `id` matches the theme name. Merge tags (`{{heading}}`, `{{button}}`, `{{amount}}`, and color CSS variables) are replaced at render time.

### Amount Processing

`processAmounts` (in `regive.ts`) resolves the `amount` attribute before the banner renders. Each comma-separated token is either a fixed amount or a percentage (`50%`) of the donor's gift.

- **Gift resolution:** `gift-amount` attribute first, falling back to `localStorage("regive-donation-amt")` saved on the first page. The normalized gift is written back to `options.giftAmount` even when no `amount` attribute exists, so theme rules always see a clean number.
- **Shared parser:** All amount parsing goes through the `parseAmount` method — it strips currency formatting (`"$1,250.00"` → `1250`) and rejects unresolved merge tags, including URL-encoded braces (`%7B`/`%7D`). Never add a second parser (a divergent `parseFloat` in `getTheme` was a past bug). US-style number formats only; European formats like `€1.250,00` are unsupported.
- **Sanity ceiling:** Gift amounts above `maxGiftAmount` ($1,000,000) are treated as unavailable, guarding against garbage input producing absurd asks.
- **Fixed amounts pass through verbatim:** original order, duplicates, and formatting (`5.00`) are preserved. Only percentage-resolved amounts are deduped — against fixed amounts (numeric comparison) and each other.
- **Guardrails & rounding:** Percentages are clamped by `min-amount`/`max-amount` (which apply only to percentages) and rounded up per `rounding-tiers` (default `0:1,50:5`, tier chosen by gift amount). Values are rounded to cents before tier math so floating-point dust can't jump a step.
- **Empty result:** If every token is skipped or invalid, `options.amount` is deleted so the consumer's `|| ["5"]` default kicks in — never leave an empty string behind (`"".split(",")` renders a broken button).
- Debug logs state where the gift amount came from (attribute vs. localStorage).

### Theme Rules

`theme-rules="500:large-donor,1000:major-donor"` selects a theme based on the donor's gift amount — the highest satisfied threshold wins. Evaluated by `getTheme` against the normalized gift amount; rules are ignored (with a debug warning) when no gift amount is available. Fallback chain: theme rule → `theme` attribute → `stacked`.

### Digital Wallets

With `digital-wallets="true"` and a wallet payment method detected, the component waits for the wallet UI (`#en__digitalWallet` iframe or the `#chariot-button` DAF button, with timeouts), moves it into the banner, and turns amount buttons into selectors (first amount pre-selected) instead of instant submits. Submit listeners are attached per method (`stripedigitalwallet`, `paypaltouch`, `daf`) via `addDigitalWalletSubmitListeners`. Wallet submissions on the first page are recorded as `regive-dw-paymenttype`; `detectPaymentMethod` prefers it over the form's payment type field.

### CAPTCHA

If the page has a reCAPTCHA (`.g-recaptcha`), the banner must include a `.regive-captcha-container` (custom themes need to add one — otherwise Regive exits). The `.en__captcha` element is teleported into the banner, `data-callback` is wrapped to unlock the amount buttons on success, and `data-expired-callback` re-locks them. A 5-second soft timeout treats a never-appearing captcha as optional and unlocks the buttons.

### LocalStorage Keys

All keys are prefixed `regive-`: `num`, `ver`, `exp`, `card` (VGS tokens), `paymenttype`, `dw-paymenttype` (wallet method), `donation-amt` (gift amount fallback), `submitted` (page ID of the regive submission), `height` (banner height). `clearStorage()` removes all of them.

## Build & Development

```bash
npm run dev          # Vite dev server (http://localhost:3000)
npm run build        # Type-check + Vite build
npm run build:prod   # Full production build with Terser minification
npm run watch        # Vite build in watch mode
```

Output lands in `dist/`:
- `regive.js` — unminified ES module (~61 KB)
- `regive.min.js` — minified production bundle (~47 KB)

CSS is injected into JS at build time via `vite-plugin-css-injected-by-js` — there is no separate CSS file.

## Coding Conventions

### TypeScript

- Strict mode is on — respect all strictness flags.
- Avoid `any`; use proper type definitions.
- Use optional chaining (`?.`) and nullish coalescing (`??`).
- `noUnusedLocals` and `noUnusedParameters` are enforced.

### Naming

- `camelCase` for variables, methods, and properties.
- `PascalCase` for classes and interfaces.
- Descriptive names that convey purpose.

### CSS / SCSS

- Prefix all classes with `regive-` to avoid collisions with host pages.
- Use BEM-like naming: `regive__element--modifier`.
- Leverage CSS custom properties (`--regive-bg-color`, `--regive-txt-color`, etc.) for theming.
- Use `data-*` attributes for state-driven styling.

### Logging

Use the `log()` method inside the Regive class. Debug output is gated behind `?debug` in the script URL — never leave `console.log` calls in production code.

## Common Tasks

### Adding a Configuration Option

1. Add the property to the `RegiveOptions` interface in `regive-options.ts`.
2. Implement the behavior in `regive.ts`.
3. Provide a sensible default value.
4. Document the option in `README.md`.

### Adding a Theme

1. Add the theme name to the `themes` array in `regive.ts`.
2. Add corresponding styles in `style.scss`.
3. Document the theme in `README.md`.

### Debugging

- Append `?debug` to the script URL to enable verbose console logging.
- Use `test="true"` on the `<regive>` tag to simulate donations without real submissions; add `test-method="card"` (or `applepay`, `googlepay`, `stripedigitalwallets`, `paypaltouch`, `daf`) to simulate a specific payment method.
- `test-page-1.html` and `test-thank-you.html` in the repo root are local dev fixtures for manual testing.
- Check browser console — log entries are emoji-coded for quick scanning.

## Security Rules

- The component handles **VGS tokens**, never raw credit card numbers.
- Tokens are stored in localStorage only between the first page and the thank-you page, then cleared on success (unless in test mode).
- Always assume HTTPS in production.
- PostMessage handlers must validate `sender === "regive"`.
- Never ship with debug mode enabled.

## Testing Checklist

Before submitting any change:

- Test across Chrome, Firefox, Safari, and Edge.
- Test with debug mode on and off.
- Test with test mode on and off.
- Test with various configuration combinations (amounts, themes, colors).
- Test percentage amounts with min/max guardrails, rounding tiers, and theme rules — including missing/unresolved gift amounts.
- Test with CAPTCHA-enabled pages (buttons lock/unlock correctly) and digital wallet flows.
- Test on actual Engaging Networks client pages.
- Test on Engaging Networks pages that use ENGrid.
- Verify edge cases: missing tokens, network errors, cross-origin restrictions.

## Important Constraints

- **No new runtime dependencies.** The bundle must remain self-contained.
- **Backward compatibility.** Existing `<regive>` tag configurations must continue to work.
- **Accessibility.** Use semantic HTML elements; keep interactive elements keyboard-accessible.
- **Cross-client compatibility.** Features must work across different Engaging Networks client setups.
- **Single-file output.** The build produces one JS file with CSS inlined — do not introduce code splitting or separate stylesheets.
