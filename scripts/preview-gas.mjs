/**
 * Local preview of the Google Apps Script HtmlService bundle.
 * Inlines <?!= include(...) ?> and mocks google.script.run with the
 * same calendar parse logic as gas/Code.gs.
 *
 * Usage: node scripts/preview-gas.mjs
 * Then open http://localhost:8081
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAS = path.resolve(__dirname, "..", "gas");
const PORT = Number(process.env.PORT) || 8081;
const LHS_ELEMENT =
  "https://www.lisle202.org/fs/elements/4419?is_ajax=true&cal_date=";
const LHS_PAGE =
  "https://www.lisle202.org/lisle-high-school/about-our-school/lhs-calendar";

function readGas(name) {
  return fs.readFileSync(path.join(GAS, name), "utf8");
}

function inlineIncludes(html) {
  return html.replace(
    /<\?!=\s*include\('([^']+)'\);\s*\?>/g,
    (_, name) => {
      const file = readGas(`${name}.html`);
      // Strip the generated comment line for cleaner preview
      return file.replace(/^<!-- Generated[\s\S]*?-->\n?/, "");
    }
  );
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function hhmmFromIso(iso) {
  if (!iso) return null;
  const m = String(iso).match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function parseCalendarHtml(html) {
  const events = [];
  const boxes = String(html).split(/<div class="fsCalendarDaybox[^"]*">/);
  for (let b = 1; b < boxes.length; b++) {
    const box = boxes[b];
    let parts = box.match(
      /class="fsCalendarDate"[^>]*data-day="(\d+)"[^>]*data-year="(\d+)"[^>]*data-month="(\d+)"/
    );
    if (!parts) {
      parts = box.match(
        /data-day="(\d+)"[^>]*data-year="(\d+)"[^>]*data-month="(\d+)"/
      );
    }
    if (!parts) continue;
    const day = Number(parts[1]);
    const year = Number(parts[2]);
    const monthIndex = Number(parts[3]);
    const date = `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
    const infoChunks = box.split(/class="fsCalendarInfo"/).slice(1);
    for (const chunk of infoChunks) {
      let tm = chunk.match(
        /class="fsCalendarEventTitle fsCalendarEventLink" title="([^"]*)" data-occur-id="([^"]*)"/
      );
      if (!tm) {
        tm = chunk.match(
          /fsCalendarEventTitle[^>]*title="([^"]*)"[^>]*data-occur-id="([^"]*)"/
        );
      }
      if (!tm) continue;
      const title = decodeEntities(tm[1]);
      if (!title) continue;
      let calM = chunk.match(
        /fsElementEventColorIcon[^>]*title=["']([^"']*)["']/
      );
      if (!calM) calM = chunk.match(/fsStyleSROnly[^>]*>([^<]+)</);
      const calendar = decodeEntities((calM && calM[1]) || "School calendar");
      const allDay = /fsAllDayEvent/.test(chunk);
      const startIso =
        chunk.match(/<time datetime="([^"]+)" class="fsStartTime"/)?.[1] ||
        null;
      const endIso =
        chunk.match(/<time datetime="([^"]+)" class="fsEndTime"/)?.[1] || null;
      const location = decodeEntities(
        chunk.match(/<div class="fsLocation">([^<]*)</)?.[1] || ""
      );
      const category = /athletics/i.test(calendar)
        ? "athletics"
        : /fine arts/i.test(calendar)
          ? "arts"
          : "school";
      events.push({
        id: tm[2] || `${date}|${title}|${startIso || "all"}`,
        date,
        title,
        calendar,
        category,
        allDay,
        start: allDay ? null : hhmmFromIso(startIso),
        end: allDay ? null : hhmmFromIso(endIso),
        startIso,
        endIso,
        location: location || null,
        occurId: tm[2],
        source: "live",
        url: LHS_PAGE,
      });
    }
  }
  return events;
}

async function fetchLhsCalendarEvents(monthDates) {
  const all = [];
  for (const date of monthDates || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      throw new Error("Invalid date: " + date);
    }
    const res = await fetch(LHS_ELEMENT + encodeURIComponent(date), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LHSPeriodTracker/1.0; +preview-gas)",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "text/html, */*",
      },
    });
    if (!res.ok) throw new Error("Calendar upstream " + res.status);
    all.push(...parseCalendarHtml(await res.text()));
  }
  const seen = new Set();
  const deduped = [];
  for (const ev of all) {
    const key = `${ev.date}|${ev.title}|${ev.start || "all"}|${ev.calendar || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ev);
  }
  return deduped;
}

const MOCK_BRIDGE = `
<script>
window.google = {
  script: {
    run: {
      withSuccessHandler(ok) {
        this._ok = ok;
        return this;
      },
      withFailureHandler(fail) {
        this._fail = fail;
        return this;
      },
      async fetchLhsCalendarEvents(months) {
        try {
          const res = await fetch("/__gas/fetchLhsCalendarEvents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ months }),
          });
          if (!res.ok) throw new Error("preview proxy " + res.status);
          const data = await res.json();
          this._ok && this._ok(data);
        } catch (err) {
          this._fail && this._fail(err);
        }
      },
    },
  },
};
</script>
`;

function buildIndex() {
  let html = readGas("Index.html");
  html = html.replace(/^<!-- Generated[\s\S]*?-->\n?/, "");
  html = inlineIncludes(html);
  // Inject mock google.script.run before client scripts execute
  html = html.replace("<head>", "<head>" + MOCK_BRIDGE);
  return html;
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  if (url === "/__gas/fetchLhsCalendarEvents" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { months } = JSON.parse(body || "{}");
      const events = await fetchLhsCalendarEvents(months);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(events));
    } catch (err) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(String(err.message || err));
    }
    return;
  }
  if (url === "/" || url.startsWith("/?")) {
    try {
      const html = buildIndex();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String(err.stack || err));
    }
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`GAS preview at http://localhost:${PORT}`);
});
