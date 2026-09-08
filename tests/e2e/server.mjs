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
  // One-time-only first donation page (no recurrpay "Y" option) - must come
  // before the generic first-page route
  { pattern: /^\/page\/\d+\/monthly\/1$/, file: "fixtures/donate-1-norecurr.html" },
  // Any first donation page (both /donate/1 and /test/1 variants)
  { pattern: /^\/page\/\d+\/[a-zA-Z]+\/1$/, file: "fixtures/donate-1.html" },
  // Thank-you page with the <regive> tag in normal mode
  { pattern: /^\/page\/\d+\/donate\/2$/, file: "fixtures/page-2.html" },
  // Thank-you page with the <regive source="original"> tag
  { pattern: /^\/page\/\d+\/original\/2$/, file: "fixtures/page-2-original.html" },
  // Thank-you page with the <regive hide-for-frequency="annual,monthly"> tag
  { pattern: /^\/page\/\d+\/frequency\/2$/, file: "fixtures/page-2-frequency.html" },
  // Thank-you pages with a frequency configured on the <regive> tag.
  // /monthly/2 embeds the one-time-only page; /monthlyok/2 embeds the
  // standard page (which supports recurring); /selects/2 and
  // /selectsnomonthly/2 embed the select-based pages
  { pattern: /^\/page\/\d+\/(?:monthly(?:ok)?|selects|selectsnomonthly)\/2$/, file: "fixtures/page-2-monthly.html" },
  // Thank-you page with an amount that has no matching select option
  { pattern: /^\/page\/\d+\/selectsbad\/2$/, file: "fixtures/page-2-amount7.html" },
  // Thank-you page with an unknown frequency on the <regive> tag
  { pattern: /^\/page\/\d+\/badfreq\/2$/, file: "fixtures/page-2-badfreq.html" },
  // Thank-you page with the <regive test="true"> tag
  { pattern: /^\/page\/\d+\/test\/2$/, file: "fixtures/page-2-test.html" },
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
