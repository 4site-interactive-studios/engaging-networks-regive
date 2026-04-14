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

1. **First page (donation form):** A MutationObserver watches for VGS token fields. When the donor submits, tokens are saved to localStorage (`regive-num`, `regive-ver`, `regive-exp`, `regive-card`).
2. **Thank-you page (non-embedded):** The `<regive>` HTML tag is replaced with an iframe pointing back to the donation page with a `?chain` parameter.
3. **Thank-you page (embedded/iframe):** The component reads tokens from localStorage, renders amount buttons, and on click submits a second donation using the stored tokens. On success it triggers confetti and posts a message to the parent.

### Parent-Child Communication

All iframe messaging uses `postMessage` with the shape `{ sender: "regive", action: string, value: any }`. Actions include: `enabled`, `loaded`, `loading`, `celebrate`, `success`, `reset`, `height`, `exit`. Always validate `sender === "regive"` when handling messages.

### Options Resolution Order

HTML attributes on `<regive>` tag > URL parameters > JavaScript defaults. Attributes use kebab-case (`thank-you-message`), internally converted to camelCase.

### Theme System

Built-in themes: `stacked`, `button-right`, `button-left`, `button-top`. Custom themes are defined as `<template>` elements whose `id` matches the theme name. Merge tags (`{{heading}}`, `{{button}}`, `{{amount}}`, and color CSS variables) are replaced at render time.

## Build & Development

```bash
npm run dev          # Vite dev server (http://localhost:3000)
npm run build        # Type-check + Vite build
npm run build:prod   # Full production build with Terser minification
npm run watch        # Vite build in watch mode
```

Output lands in `dist/`:
- `regive.js` — unminified ES module (~44 KB)
- `regive.min.js` — minified production bundle (~34 KB)

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
- Use `test="true"` on the `<regive>` tag to simulate donations without real submissions.
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
- Test on actual Engaging Networks client pages.
- Test on Engaging Networks pages that use ENGrid.
- Verify edge cases: missing tokens, network errors, cross-origin restrictions.

## Important Constraints

- **No new runtime dependencies.** The bundle must remain self-contained.
- **Backward compatibility.** Existing `<regive>` tag configurations must continue to work.
- **Accessibility.** Use semantic HTML elements; keep interactive elements keyboard-accessible.
- **Cross-client compatibility.** Features must work across different Engaging Networks client setups.
- **Single-file output.** The build produces one JS file with CSS inlined — do not introduce code splitting or separate stylesheets.
