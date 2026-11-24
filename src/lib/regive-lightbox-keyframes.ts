/**
 * The @keyframes behind lightbox-animate="true".
 *
 * Templates live on donation page 1, which renders inside the chained iframe,
 * but the dialog they animate lives on the parent (thank-you) page. The
 * embedded page collects the rendered template's three hook rules and posts
 * them up; the parent validates them here before any CSS reaches its page.
 *
 * The validator is deliberately narrow: one @keyframes rule per string, a
 * known hook name, keyframe selectors only (from / to / 0-100%), and a short
 * list of motion properties and value functions. Nothing that can fetch
 * (url(), image-set(), @import), select elements, escape a block, or carry
 * strings or escapes gets through, and accepted rules are re-serialized from
 * their parsed parts rather than copied.
 */

export const lightboxMotionHooks = [
  "regive-lightbox-in",
  "regive-lightbox-out",
  "regive-lightbox-success-out",
] as const;

export type LightboxMotionHook = (typeof lightboxMotionHooks)[number];

/**
 * Built-in motions, carried in the built-in template's CSS block (so they
 * travel the same way a custom template's do) and used by the parent as the
 * fallback when a template's motion is missing or refused. The entrance grows
 * the dialog with one gentle overshoot before it settles.
 */
export const lightboxKeyframeDefaults: Readonly<
  Record<LightboxMotionHook, string>
> = {
  "regive-lightbox-in":
    "@keyframes regive-lightbox-in { 0% { opacity: 0; transform: scale(0.8); } 60% { opacity: 1; transform: scale(1.04); animation-timing-function: ease-in-out; } 100% { opacity: 1; transform: scale(1); } }",
  "regive-lightbox-out":
    "@keyframes regive-lightbox-out { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.92); } }",
  "regive-lightbox-success-out":
    "@keyframes regive-lightbox-success-out { 0% { opacity: 1; transform: translateY(0px) scale(1); } 100% { opacity: 0; transform: translateY(-24px) scale(0.95); } }",
};

export interface LightboxKeyframe {
  /** Normalized keyframe selectors, e.g. ["0%", "50%"] */
  selectors: string[];
  /** [property, value] pairs, in source order */
  declarations: Array<[string, string]>;
}

export type LightboxKeyframes = Partial<
  Record<LightboxMotionHook, LightboxKeyframe[]>
>;

type RegiveLog = (message: string, emoji?: string, data?: unknown) => void;

// Generous for any hand-written motion, small enough to bound parsing work
const maxRuleLength = 4096;
const maxKeyframes = 32;
const maxDeclarations = 16;
const maxParenthesisDepth = 8;

// Properties that move or fade the dialog. Anything else (colors, layout,
// content, custom properties) is refused rather than dropped, so a template
// never half-applies.
const allowedProperties = new Set([
  "opacity",
  "transform",
  "transform-origin",
  "translate",
  "scale",
  "rotate",
  "filter",
  "animation-timing-function",
]);

// Value functions those properties need. url(), image-set(), var(), env(),
// attr() and every other function are refused.
const allowedFunctions = new Set([
  "matrix",
  "matrix3d",
  "perspective",
  "rotate",
  "rotate3d",
  "rotatex",
  "rotatey",
  "rotatez",
  "scale",
  "scale3d",
  "scalex",
  "scaley",
  "scalez",
  "skew",
  "skewx",
  "skewy",
  "translate",
  "translate3d",
  "translatex",
  "translatey",
  "translatez",
  "cubic-bezier",
  "steps",
  "linear",
  "calc",
  "min",
  "max",
  "clamp",
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "blur",
  "brightness",
  "contrast",
  "drop-shadow",
  "grayscale",
  "hue-rotate",
  "invert",
  "opacity",
  "saturate",
  "sepia",
]);

// No quotes, backslash escapes, angle brackets, "!" or other punctuation a
// keyframes rule never needs
const allowedCharacters = /^[A-Za-z0-9\s@{}();:,.%#+\-*/_]*$/;
const keyframesRulePattern =
  /^\s*@keyframes\s+([A-Za-z][A-Za-z0-9-]*)\s*\{([\s\S]*)\}\s*$/;
// Selector text is trimmed afterwards; no overlapping quantifiers, so
// matching stays linear in the rule's length
const keyframeBlockPattern = /^([^{}]+)\{([^{}]*)\}/;
const keyframeSelectorPattern = /^(?:\d+(?:\.\d+)?|\.\d+)%$/;
const declarationPattern = /^([A-Za-z-]+)\s*:\s*([\s\S]+)$/;
const functionNamePattern = /([A-Za-z_-][A-Za-z0-9_-]*)\(/g;

const isMotionHook = (name: string): name is LightboxMotionHook =>
  (lightboxMotionHooks as readonly string[]).includes(name);

const parseSelector = (selector: string): string | null => {
  const normalized = selector.trim().toLowerCase();
  if (normalized === "from") return "0%";
  if (normalized === "to") return "100%";
  if (!keyframeSelectorPattern.test(normalized)) return null;
  return parseFloat(normalized) <= 100 ? normalized : null;
};

// The reason a value is refused, or null when it is allowed
const refuseValue = (value: string): string | null => {
  if (value.includes(":")) return "a value contains a colon";
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0 || depth > maxParenthesisDepth) {
      return "a value has unbalanced parentheses";
    }
  }
  if (depth !== 0) return "a value has unbalanced parentheses";
  for (const match of value.matchAll(functionNamePattern)) {
    if (!allowedFunctions.has(match[1].toLowerCase())) {
      return `the ${match[1]}() function is not allowed`;
    }
  }
  return null;
};

/**
 * Parse one @keyframes rule for a known hook, or return the reason it is
 * refused.
 */
export function parseKeyframesRule(
  css: unknown
): { name: LightboxMotionHook; frames: LightboxKeyframe[] } | string {
  if (typeof css !== "string") return "a rule is not a string";
  if (css.length > maxRuleLength) return "a rule is too long";
  if (!allowedCharacters.test(css)) {
    return "a rule contains characters keyframes never need (quotes, escapes, HTML or !important)";
  }
  if (css.includes("/*")) return "a rule contains a comment";
  const rule = keyframesRulePattern.exec(css);
  if (!rule) return "not a single @keyframes rule";
  const [, name, body] = rule;
  if (!isMotionHook(name)) return `unknown keyframes name "${name}"`;
  if (body.includes("@")) return "a rule contains a nested at-rule";

  const frames: LightboxKeyframe[] = [];
  let rest = body;
  while (rest.trim()) {
    const block = keyframeBlockPattern.exec(rest);
    if (!block) return "a rule has a malformed keyframe block";
    rest = rest.slice(block[0].length);
    if (frames.length === maxKeyframes) return "a rule has too many keyframes";

    const selectors: string[] = [];
    for (const selector of block[1].split(",")) {
      const parsed = parseSelector(selector);
      if (!parsed) return `"${selector.trim()}" is not a keyframe selector`;
      selectors.push(parsed);
    }

    const declarations: Array<[string, string]> = [];
    for (const declaration of block[2].split(";")) {
      if (!declaration.trim()) continue;
      const parts = declarationPattern.exec(declaration.trim());
      if (!parts) return "a rule has a malformed declaration";
      const property = parts[1].toLowerCase();
      if (!allowedProperties.has(property)) {
        return `the ${property} property is not allowed`;
      }
      const value = parts[2].replace(/\s+/g, " ").trim();
      const refused = refuseValue(value);
      if (refused) return refused;
      if (declarations.length === maxDeclarations) {
        return "a keyframe has too many declarations";
      }
      declarations.push([property, value]);
    }
    frames.push({ selectors, declarations });
  }
  if (!frames.length) return "a rule has no keyframes";
  return { name, frames };
}

/** Write validated keyframes back out under the given name. */
export function serializeKeyframes(
  name: string,
  frames: LightboxKeyframe[]
): string {
  const blocks = frames.map(
    ({ selectors, declarations }) =>
      `${selectors.join(", ")} { ${declarations
        .map(([property, value]) => `${property}: ${value};`)
        .join(" ")} }`
  );
  return `@keyframes ${name} { ${blocks.join(" ")} }`;
}

/**
 * Validate the value of a "lightbox-animations" message from the embedded
 * page: exactly { keyframes: string[] } with one to three rules, each for a
 * different hook. Any refusal rejects the whole message.
 */
export function parseLightboxAnimations(
  value: unknown
): { keyframes: LightboxKeyframes } | { error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "the message value is not an object" };
  }
  const fields = Object.keys(value);
  if (fields.length !== 1 || fields[0] !== "keyframes") {
    return { error: "the message value must only carry keyframes" };
  }
  const rules = (value as { keyframes: unknown }).keyframes;
  if (
    !Array.isArray(rules) ||
    rules.length === 0 ||
    rules.length > lightboxMotionHooks.length
  ) {
    return { error: "keyframes must be a list of one to three rules" };
  }
  const keyframes: LightboxKeyframes = {};
  for (const css of rules) {
    const parsed = parseKeyframesRule(css);
    if (typeof parsed === "string") return { error: parsed };
    if (keyframes[parsed.name]) {
      return { error: `@keyframes ${parsed.name} appears twice` };
    }
    keyframes[parsed.name] = parsed.frames;
  }
  return { keyframes };
}

/**
 * Embedded page: read the three hook rules from the rendered banner's own
 * <style> blocks (the built-in template's defaults, then the selected custom
 * template's overrides - the later rule wins, as in CSS). A hook whose rule
 * the validator refuses falls back to its default, so the parent always gets
 * a complete, valid set. Stylesheets outside the banner are never read.
 */
export function collectLightboxKeyframes(
  banner: ParentNode,
  log: RegiveLog = () => {}
): string[] {
  const rendered = new Map<LightboxMotionHook, string>();
  banner.querySelectorAll("style").forEach((style) => {
    const rules = style.sheet?.cssRules;
    if (!rules) return;
    Array.from(rules).forEach((rule) => {
      if (rule.type !== CSSRule.KEYFRAMES_RULE) return;
      const { name } = rule as CSSKeyframesRule;
      if (isMotionHook(name)) rendered.set(name, rule.cssText);
    });
  });
  const defaults = defaultLightboxKeyframes();
  return lightboxMotionHooks.map((hook) => {
    const css = rendered.get(hook);
    if (css !== undefined) {
      const parsed = parseKeyframesRule(css);
      if (typeof parsed !== "string") {
        return serializeKeyframes(hook, parsed.frames);
      }
      log(
        `The template's @keyframes ${hook} cannot be used (${parsed}) - using the default`,
        "⚠️"
      );
    }
    return serializeKeyframes(hook, defaults[hook]);
  });
}

/** The built-in motions, parsed. */
export function defaultLightboxKeyframes(): Record<
  LightboxMotionHook,
  LightboxKeyframe[]
> {
  const frames = (hook: LightboxMotionHook) => {
    const parsed = parseKeyframesRule(lightboxKeyframeDefaults[hook]);
    return typeof parsed === "string" ? [] : parsed.frames;
  };
  return {
    "regive-lightbox-in": frames("regive-lightbox-in"),
    "regive-lightbox-out": frames("regive-lightbox-out"),
    "regive-lightbox-success-out": frames("regive-lightbox-success-out"),
  };
}
