/**
 * Zero-dependency static server for the E2E fixtures.
 *
 * Maps Engaging Networks-style URLs to fixture pages so the component's
 * URL rewriting (e.g. /page/12345/donate/2 -> /page/12345/donate/1) works
 * exactly as it would on a real EN page. The actual build output
 * (dist/regive.js) is served at /regive.js.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = 8099;

const routes = [
  { pattern: /^\/health$/, status: 200 },
  { pattern: /^\/favicon\.ico$/, status: 204 },
  { pattern: /^\/regive\.js$/, file: "../../dist/regive.js", type: "text/javascript" },
  // Echoes a POST body back as HTML so tests can assert submitted form values
  { pattern: /^\/echo$/, echo: true },
  // Select-based first donation pages - must come before the generic
  // first-page route
  { pattern: /^\/page\/\d+\/selects(?:bad)?\/1$/, file: "fixtures/donate-1-selects.html" },
  { pattern: /^\/page\/\d+\/selectsnomonthly\/1$/, file: "fixtures/donate-1-selects-nomonthly.html" },
  // Select-based amounts with no "other" free-text field
  { pattern: /^\/page\/\d+\/selectsnoother\/1$/, file: "fixtures/donate-1-selects-noother.html" },
  // One-time-only first donation page (no recurrpay "Y" option) - must come
  // before the generic first-page route
  { pattern: /^\/page\/\d+\/monthly\/1$/, file: "fixtures/donate-1-norecurr.html" },
  // First donation page with no recurring fields at all - must come before
  // the generic first-page route
  { pattern: /^\/page\/\d+\/nofields\/1$/, file: "fixtures/donate-1-nofields.html" },
  // First donation page with recurrpay but no recurrfreq field - must come
  // before the generic first-page route
  { pattern: /^\/page\/\d+\/nofreq\/1$/, file: "fixtures/donate-1-nofreq.html" },
  // First donation page carrying a custom theme <template> for the theme
  // rules tests - must come before the generic first-page route
  { pattern: /^\/page\/\d+\/themerules\/1$/, file: "fixtures/donate-1-themes.html" },
  // First donation page with EN's radio amount field including an "Other"
  // option - must come before the generic first-page route
  { pattern: /^\/page\/\d+\/withother\/1$/, file: "fixtures/donate-1-withother.html" },
  // Variant where the "Other" markup is broken: the fallback selector
  // matches a non-radio input - must come before the generic first-page route
  { pattern: /^\/page\/\d+\/withotherbroken\/1$/, file: "fixtures/donate-1-withother-broken.html" },
  // Lightbox first pages - must come before the generic first-page route.
  // /lightboxcaptcha/1 carries a mock reCAPTCHA, /lightboxwallet/1 renders a
  // late digital wallet UI, /lightboxmonthly/1 is one-time only (so a
  // monthly regive exits) and /lightboxecho/1 posts to /echo, a page that
  // never reports back to the parent. /lightbox/1 and /lightboxtest/1 fall
  // through to the generic page.
  { pattern: /^\/page\/\d+\/lightboxcaptcha\/1$/, file: "fixtures/donate-1-captcha.html" },
  { pattern: /^\/page\/\d+\/lightboxwallet\/1$/, file: "fixtures/donate-1-wallets.html" },
  { pattern: /^\/page\/\d+\/lightboxmonthly\/1$/, file: "fixtures/donate-1-norecurr.html" },
  { pattern: /^\/page\/\d+\/lightboxecho\/1$/, file: "fixtures/donate-1-selects.html" },
  // Animated lightbox first pages carrying motion templates (motion-calm,
  // motion-bold, motion-unsafe) - must come before the generic first-page
  // route. Page 24680 is the base page of /lightboxanimatebase/2.
  // /lightboxanimate/1, /lightboxanimatereal/1 and /animatenolightbox/1
  // fall through to the generic page (built-in theme).
  { pattern: /^\/page\/\d+\/lightboxanimate(?:custom|rules|two|unsafe)\/1$/, file: "fixtures/donate-1-animate-themes.html" },
  { pattern: /^\/page\/24680\/donate\/1$/, file: "fixtures/donate-1-animate-themes.html" },
  // Any first donation page (both /donate/1 and /test/1 variants)
  { pattern: /^\/page\/\d+\/[a-zA-Z]+\/1$/, file: "fixtures/donate-1.html" },
  // Thank-you pages with <regive lightbox="true">
  { pattern: /^\/page\/\d+\/lightbox(?:echo)?\/2$/, file: "fixtures/page-2-lightbox.html" },
  { pattern: /^\/page\/\d+\/lightbox(?:test|captcha)\/2$/, file: "fixtures/page-2-lightbox-test.html" },
  { pattern: /^\/page\/\d+\/lightboxmonthly\/2$/, file: "fixtures/page-2-lightbox-monthly.html" },
  { pattern: /^\/page\/\d+\/lightboxwallet\/2$/, file: "fixtures/page-2-lightbox-wallet.html" },
  // Thank-you pages with <regive lightbox="true" lightbox-animate="true">
  { pattern: /^\/page\/\d+\/lightboxanimate\/2$/, file: "fixtures/page-2-lightbox-animate.html" },
  { pattern: /^\/page\/\d+\/lightboxanimatecustom\/2$/, file: "fixtures/page-2-lightbox-animate-custom.html" },
  { pattern: /^\/page\/\d+\/lightboxanimaterules\/2$/, file: "fixtures/page-2-lightbox-animate-rules.html" },
  { pattern: /^\/page\/\d+\/lightboxanimatebase\/2$/, file: "fixtures/page-2-lightbox-animate-basepage.html" },
  { pattern: /^\/page\/\d+\/lightboxanimatetwo\/2$/, file: "fixtures/page-2-lightbox-animate-two.html" },
  { pattern: /^\/page\/\d+\/lightboxanimateunsafe\/2$/, file: "fixtures/page-2-lightbox-animate-unsafe.html" },
  { pattern: /^\/page\/\d+\/lightboxanimatereal\/2$/, file: "fixtures/page-2-lightbox-animate-real.html" },
  // Thank-you page with lightbox-animate but no lightbox
  { pattern: /^\/page\/\d+\/animatenolightbox\/2$/, file: "fixtures/page-2-animate-nolightbox.html" },
  // Thank-you page with the <regive> tag in normal mode
  { pattern: /^\/page\/\d+\/donate\/2$/, file: "fixtures/page-2.html" },
  // Thank-you page with the <regive source="original"> tag
  { pattern: /^\/page\/\d+\/original\/2$/, file: "fixtures/page-2-original.html" },
  // Thank-you page with the <regive hide-for-frequency="annual,monthly"> tag
  { pattern: /^\/page\/\d+\/frequency\/2$/, file: "fixtures/page-2-frequency.html" },
  // Thank-you pages with a frequency configured on the <regive> tag.
  // /monthly/2 and /nofields/2 embed pages without recurring support;
  // /monthlyok/2 embeds the standard page; /nofreq/2 embeds a page with
  // recurrpay but no recurrfreq; /selects/2 and /selectsnomonthly/2 embed
  // the select-based pages
  { pattern: /^\/page\/\d+\/(?:monthly(?:ok)?|nofields|nofreq|selects|selectsnomonthly)\/2$/, file: "fixtures/page-2-monthly.html" },
  // Thank-you pages with an amount that has no matching select option.
  // /selectsbad/2 embeds the selects page (whose "other" text field has no
  // matching "Other" radio, so the amount cannot be applied safely);
  // /selectsnoother/2 embeds the selects page without an "other" field;
  // /withother/2 embeds the radio page with a real "Other" option;
  // /withotherbroken/2 embeds the broken-markup variant
  { pattern: /^\/page\/\d+\/(?:selectsbad|selectsnoother|withother|withotherbroken)\/2$/, file: "fixtures/page-2-amount7.html" },
  // Thank-you page where pageJson reports the original gift as recurring
  // (ENgrid's two-option layout captures it as "onetime" on page 1)
  { pattern: /^\/page\/\d+\/recurringgift\/2$/, file: "fixtures/page-2-recurringgift.html" },
  // Thank-you page with an unknown frequency on the <regive> tag
  { pattern: /^\/page\/\d+\/badfreq\/2$/, file: "fixtures/page-2-badfreq.html" },
  // Thank-you page with the <regive test="true"> tag
  { pattern: /^\/page\/\d+\/test\/2$/, file: "fixtures/page-2-test.html" },
  // Thank-you pages exercising dynamic ask string processing:
  // /percent/2 resolves percentage tokens against gift-amount="20";
  // /nogift/2 has no usable gift, so the percentage token is skipped;
  // /overlimit/2 includes a fixed token over the 100000 ceiling
  { pattern: /^\/page\/\d+\/percent\/2$/, file: "fixtures/page-2-percentage.html" },
  { pattern: /^\/page\/\d+\/nogift\/2$/, file: "fixtures/page-2-nogift.html" },
  { pattern: /^\/page\/\d+\/overlimit\/2$/, file: "fixtures/page-2-overlimit.html" },
  // Thank-you pages with theme rules: /themerules/2 satisfies the "big"
  // threshold (gift 150 >= 100, embeds the template-carrying page);
  // /themeruleslow/2 does not (gift 50) and falls back to the stacked theme
  { pattern: /^\/page\/\d+\/themerules\/2$/, file: "fixtures/page-2-themerules.html" },
  { pattern: /^\/page\/\d+\/themeruleslow\/2$/, file: "fixtures/page-2-themerules-low.html" },
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = routes.find((r) => r.pattern.test(url.pathname));

  if (!route) {
    res.writeHead(404).end("Not found");
    return;
  }
  if (route.echo) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const escaped = body.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      res
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(
          `<!DOCTYPE html><html><body><pre id="echo">${escaped}</pre></body></html>`
        );
    });
    return;
  }
  if (!route.file) {
    res.writeHead(route.status).end();
    return;
  }

  try {
    const content = await readFile(path.join(root, route.file));
    res
      .writeHead(200, {
        "Content-Type": route.type ?? "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      })
      .end(content);
  } catch {
    res
      .writeHead(500)
      .end(`Could not read ${route.file} — did you run npm run build?`);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`E2E fixture server listening on http://127.0.0.1:${port}`);
});
