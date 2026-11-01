import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(import.meta.dirname, "..");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
export function previewServer() {
  return http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const fixture = pathname.startsWith("/fixtures/");
      const base = resolve(root, fixture ? "tests" : "extension");
      const file = resolve(
        base,
        "." + (pathname === "/" ? "/panel.html" : pathname),
      );
      if (!file.startsWith(base + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  previewServer().listen(4173, "127.0.0.1", () =>
    console.log(
      "Shopagent preview: http://127.0.0.1:4173 (demo UI only; load extension/ in Chrome for page reading)",
    ),
  );
}
