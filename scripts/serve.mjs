/**
 * Static file server + LHS calendar proxy (avoids browser CORS).
 * Usage: node scripts/serve.mjs
 * Then open http://localhost:8080
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 8080;

const LHS_ELEMENT =
  "https://www.lisle202.org/fs/elements/4419?is_ajax=true&cal_date=";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".md": "text/markdown; charset=utf-8",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function proxyCalendar(reqUrl, res) {
  const u = new URL(reqUrl, "http://localhost");
  const date = u.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    send(res, 400, "Invalid date");
    return;
  }
  const upstream = LHS_ELEMENT + encodeURIComponent(date);
  try {
    const r = await fetch(upstream, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LHSPeriodTracker/1.0; +local)",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "text/html, */*",
      },
    });
    const text = await r.text();
    send(res, r.ok ? 200 : r.status, text, "text/html; charset=utf-8");
  } catch (err) {
    send(res, 502, `Upstream fetch failed: ${err.message}`);
  }
}

function serveStatic(reqPath, res) {
  let rel = decodeURIComponent(reqPath.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, TYPES[ext] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (url.startsWith("/api/lhs-calendar")) {
    proxyCalendar(url, res);
    return;
  }
  serveStatic(url, res);
});

server.listen(PORT, () => {
  console.log(`Lisle tracker at http://localhost:${PORT}`);
  console.log(`Calendar proxy: /api/lhs-calendar?date=YYYY-MM-DD`);
});
