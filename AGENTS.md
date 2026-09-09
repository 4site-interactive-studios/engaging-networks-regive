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

Built-in themes: `stacked`, `button-right`, `button-left`, `button-top`. Custom themes are defined as `<template>` elements whose `id` matches the theme name. Merge tags (`{{heading}}`, `{{button}}`, `{{ask-amount}}`, `{{amount}}`, and color CSS variables) are replaced at render time. `{{ask-amount}}` resolves to the first (or only) amount button's value formatted in USD (`$5`, `$5.01`, `$1,250` — cents only when non-zero) via `formatAskAmount`, and is replaced on the raw template string so it also works inside `<style>` blocks and pseudo-element `content` values.

### Amount Processing

`processAmounts` (in `regive.ts`) resolves the `amount` attribute before the banner renders. Each comma-separated token is either a fixed amount or a percentage (`50%`) of the donor's gift.

- **Gift resolution:** `gift-amount` attribute first, falling back to `localStorage("regive-donation-amt")` saved on the first page. The normalized gift is written back to `options.giftAmount` even when no `amount` attribute exists, so theme rules always see a clean number.
- **Shared parser:** All amount parsing goes through the `parseAmount` method — it strips currency formatting (`"$1,250.00"` → `1250`) and rejects unresolved merge tags, including URL-encoded braces (`%7B`/`%7D`). Never add a second parser (a divergent `parseFloat` in `getTheme` was a past bug). US-style number formats only; European formats like `€1.250,00` are unsupported.
- **Sanity ceiling:** Gift amounts above `maxGiftAmount` ($100,000) are treated as unavailable, guarding against garbage input producing absurd asks.
- **Fixed amounts pass through verbatim:** original order, duplicates, and formatting (`5.00`) are preserved. Only percentage-resolved amounts are deduped — against fixed amounts (numeric comparison) and each other.
- **Guardrails & rounding:** Percentages are clamped by `min-amount`/`max-amount` (which apply only to percentages) and rounded up per `rounding-tiers` (default `0:1,50:5`, tier chosen by gift amount). Values are rounded to cents before tier math so floating-point dust can't jump a step.
- **Empty result:** If every token is skipped or invalid, `options.amount` is deleted so the consumer's `|| ["5"]` default kicks in — never leave an empty string behind (`"".split(",")` renders a broken button).
- **Test-mode preview gift:** In test mode with no gift available and no `min-amount` set, a default preview gift (`defaultTestGiftAmount`, $50) drives percentages and theme rules so dynamic asks render realistically. Setting `min-amount` explicitly previews the fallback state instead.
- Debug logs state where the gift amount came from (attribute vs. localStorage).

### Theme Rules

`theme-rules="500:large-donor,1000:major-donor"` selects a theme based on the donor's gift amount — the highest satisfied threshold wins. Evaluated by `getTheme` against the normalized gift amount; rules are ignored (with a debug warning) when no gift amount is available, though in test mode the $50 preview gift keeps them running. Fallback chain: theme rule → `theme` attribute → `stacked`.

### Digital Wallets

With `digital-wallets="true"` and a wallet payment method detected, the component waits for the wallet UI (`#en__digitalWallet` iframe or the `#chariot-button` DAF button, with timeouts), moves it into the banner, and turns amount buttons into selectors (first amount pre-selected) instead of instant submits. Submit listeners are attached per method (`stripedigitalwallet`, `paypaltouch`, `daf`) via `addDigitalWalletSubmitListeners`. Wallet submissions on the first page are recorded as `regive-dw-paymenttype`; `detectPaymentMethod` prefers it over the form's payment type field.

### CAPTCHA

If the page has a reCAPTCHA (`.g-recaptcha`), the banner must include a `.regive-captcha-container` (custom themes need to add one — otherwise Regive exits). The `.en__captcha` element is teleported into the banner, `data-callback` is wrapped to unlock the amount buttons on success, and `data-expired-callback` re-locks them. A 5-second soft timeout treats a never-appearing captcha as optional and unlocks the buttons.

### LocalStorage Keys

All keys are prefixed `regive-`: `num`, `ver`, `exp`, `card` (VGS tokens), `paymenttype`, `dw-paymenttype` (wallet method), `donation-amt` (gift amount fallback), `submitted` (page ID of the regive submission), `height` (banner height). `clearStorage()` removes all of them.

## Build & Development

```bash
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # Type-check + Vite build
npm run build:prod   # Full production build with Terser minification
npm run watch        # Vite build in watch mode
```

Output lands in `dist/`:
- `regive.js` — unminified ES module (~61 KB)
- `regive.min.js` — minified production bundle (~47 KB)

CSS is injected into JS at build time via `vite-plugin-css-injected-by-js` — there is no separate CSS file.

## Local Test Fixtures

`test-page-1.html` and `test-thank-you.html` in the repo root are static mocks of an EN donation page and its Thank You page. They run the full two-page flow, chained iframe included, with no EN account. Both load `dist/regive.js` (run `npm run build` first) and must be served over HTTP, since Regive needs localStorage and a same-origin iframe. Each file opens with a comment block documenting its own controls, and README's "Local Test Pages" is the operator-facing walkthrough.

They are development fixtures, not an automated test suite. There are no assertions; the point is a fast manual harness that reaches the paths a real EN page reaches. Nothing here ships to EN.

### What they mock

- `window.pageJson`: page 1 is `pageNumber: 1`, the Thank You page is `pageNumber: 2` with `pageCount: 2`, and both share `campaignPageId: 999999`, because `wasSubmittedViaRegive()` compares the stored page ID against the current one.
- `window.EngagingNetworks`: an `enjs.checkSubmissionFailed()` stub wired to the `fail` flag, a `feeCover` config, and a Stripe `paymentRequest` stub when wallets are on.
- The EN form: `form.en__component` carrying the field names ENGrid reads, `.en__mandatory` wrappers, `.en__submit` (so `createHiddenInput` has an anchor), the `.en__field--withOther` amount markup `setAmount()` targets, and `transaction.ccexpire` as a select pair, which exercises the `"12,2030"` split.
- Optional blocks behind harness flags: a `.g-recaptcha` inside `.en__captcha` whose buttons look up the global callback by name at click time, so Regive's wrapper actually runs, plus an `#en__digitalWallet` block.
- `supporter.appealCode` is deliberately absent from the form, which keeps the `createHiddenInput` path under test.

### Keep in sync

Fixtures drift silently, so update them in the same commit as the change:

| Change in `src/`                            | Update in the fixtures                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| A field name ENGrid reads or writes         | The mock form in `test-page-1.html`                                             |
| A localStorage key                          | `REGIVE_KEYS` in both files (the storage readouts)                              |
| A new `<regive>` attribute                  | `REGIVE_ATTRS` or `REGIVE_FLAGS` in `test-thank-you.html`                        |
| A new built-in theme                        | `BUILT_IN_THEMES` in `test-thank-you.html`                                      |
| A new merge tag                             | The templates in `test-page-1.html`, and a readout if the value needs checking   |
| Page detection or `pageJson` reads          | The `window.pageJson` blocks in both files                                       |
| A new `postMessage` action                  | Nothing required; the panel's log prints unknown actions as they arrive          |

### Theme fixtures

`test-page-1.html` holds five custom themes: `test-theme` as a minimal reference, and the `tier-*` ladder for theme rules (`tier-supporter` as the base tier, `tier-sustainer` $100+, `tier-leader` $500+, `tier-champion` $1,000+). Panel presets apply the matching `theme-rules` string and step the gift across the thresholds.

Two conventions in those templates are worth preserving:

- **Ask-amount hooks.** `[data-harness-ask]` marks the copy that prints `{{ask-amount}}` and `[data-harness-stamp]` marks the element whose `::after` content holds it. The panel reads both, which is how the "replaced inside `<style>` blocks" behavior stays covered.
- **Selector specificity.** The CSS in those templates styles `.regive-heading`, `.regive-amounts`, and `.regive-amount-btn` through three-class selectors (`.regive-embed .tier-leader .regive-amount-btn`), because `style.scss` targets those as `body[data-regive-embedded="true"] .regive-amount-btn` and outranks a two-class selector. Any theme with its own palette has to override the heading color the same way, which is worth remembering when advising integrators.

The panel identifies the rendered theme by inspection rather than from the URL: a `.regive-banner[data-theme]` in the iframe means a built-in theme, and otherwise the custom template that rendered is the one now missing from page 1's DOM, since `addCustomBanner` removes the `<template>` it consumes. If that removal ever changes, the readout needs a new signal.

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
5. Add the attribute to `REGIVE_ATTRS` (or `REGIVE_FLAGS`, for booleans) in `test-thank-you.html`, so it is editable from the fixture panel.

### Adding a Theme

1. Add the theme name to the `themes` array in `regive.ts`.
2. Add corresponding styles in `style.scss`.
3. Document the theme in `README.md`.
4. Add the name to `BUILT_IN_THEMES` in `test-thank-you.html`, which feeds the panel's theme list and its built-in vs. custom detection.

### Debugging

- Append `?debug` to the script URL to enable verbose console logging.
- Use `test="true"` on the `<regive>` tag to simulate donations without real submissions; add `test-method="card"` (or `applepay`, `googlepay`, `stripedigitalwallet`, `paypaltouch`, `daf`) to simulate a specific payment method.
- Reach for the local fixtures (`test-page-1.html`, `test-thank-you.html`) for anything touching the two-page flow, the chained iframe, token capture, or theme rules. See Local Test Fixtures.
- Check browser console — log entries are emoji-coded for quick scanning.

## Security Rules

- The component handles **VGS tokens**, never raw credit card numbers.
- Tokens are stored in localStorage only between the first page and the thank-you page, then cleared on success (unless in test mode).
- Always assume HTTPS in production.
- PostMessage handlers must validate `sender === "regive"`.
- Never ship with debug mode enabled.

## Testing Checklist

Before submitting any change:

- Run the local fixtures first, with test mode on and off, since they are faster than a real EN page and cover the chained-iframe paths.
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
