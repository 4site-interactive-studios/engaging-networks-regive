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
  // Any first donation page (both /donate/1 and /test/1 variants)
  { pattern: /^\/page\/\d+\/[a-zA-Z]+\/1$/, file: "fixtures/donate-1.html" },
  // Thank-you page with the <regive> tag in normal mode
  { pattern: /^\/page\/\d+\/donate\/2$/, file: "fixtures/page-2.html" },
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
