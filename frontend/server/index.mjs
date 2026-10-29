import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { attachRelay } from "./relay.mjs";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
};
const routes =
  /^\/(setup|watch|settings|history|connect|phone|report(?:\/[^/]+)?)?$/;
const server = createServer(async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (pathname === "/__health") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify({ releaseId: process.env.RELEASE_ID || "frontend-dev" }),
      );
      return;
    }
    const isPage = routes.test(pathname);
    const target = resolve(root, isPage ? "index.html" : `.${pathname}`);
    if (!target.startsWith(resolve(root) + sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const content = await readFile(target);
    res.writeHead(200, {
      "Content-Type": types[extname(target)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("페이지를 찾을 수 없어요");
  }
});
attachRelay(server);
server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log("FAST TURTLE React: http://localhost:3000"),
);
