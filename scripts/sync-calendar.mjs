/**
 * One-shot sync: pull LHS calendar HTML and write js/events-data.json fallback.
 * Usage: node scripts/sync-calendar.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "js", "events-data.json");
const ELEMENT =
  "https://www.lisle202.org/fs/elements/4419?is_ajax=true&cal_date=";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function firstOfMonth(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
}

function nextMonth(ymd) {
  const [y, m] = ymd.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${pad2(nm)}-01`;
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
  const m = String(iso || "").match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function parseHtml(html) {
  const events = [];
  const dayRe =
    /<div class="fsCalendarDate"[^>]*data-day="(\d+)"[^>]*data-year="(\d+)"[^>]*data-month="(\d+)"[\s\S]*?<\/div>([\s\S]*?)(?=<div class="fsCalendarDaybox|$)/g;
  // Simpler: split by daybox
  const boxes = html.split(/<div class="fsCalendarDaybox[^"]*">/);
  for (const box of boxes.slice(1)) {
    const dm = box.match(
      /data-day="(\d+)"[^>]*data-year="(\d+)"[^>]*data-month="(\d+)"/
    ) || box.match(
      /data-day="(\d+)" data-year="(\d+)" data-month="(\d+)"/
    );
    // attribute order on site: data-day, data-year, data-month
    const dm2 = box.match(
      /class="fsCalendarDate"[^>]*data-day="(\d+)"[^>]*data-year="(\d+)"[^>]*data-month="(\d+)"/
    );
    const parts = dm2 || box.match(
      /data-day="(\d+)"[^>]*data-year="(\d+)"[^>]*data-month="(\d+)"/
    );
    if (!parts) continue;
    const day = Number(parts[1]);
    const year = Number(parts[2]);
    const monthIndex = Number(parts[3]);
    const date = `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;

    const infoChunks = box.split(/class="fsCalendarInfo"/).slice(1);
    for (const chunk of infoChunks) {
      const titleM = chunk.match(
        /fsCalendarEventTitle[^>]*title="([^"]*)"[^>]*data-occur-id="([^"]*)"/
      ) || chunk.match(
        /title="([^"]*)"[^>]*data-occur-id="([^"]*)"[^>]*class="fsCalendarEventTitle/
      );
      const titleM2 = chunk.match(
        /class="fsCalendarEventTitle fsCalendarEventLink" title="([^"]*)" data-occur-id="([^"]*)"/
      );
      const tm = titleM2 || titleM;
      if (!tm) continue;
      const title = decodeEntities(tm[1]);
      const occurId = tm[2];
      const calM = chunk.match(
        /fsElementEventColorIcon[^>]*title="([^"]*)"/
      );
      const calendar = decodeEntities(calM?.[1] || "School calendar");
      const allDay = /fsAllDayEvent/.test(chunk);
      const startM = chunk.match(
        /class="fsStartTime"[^>]*datetime="([^"]*)"/
      ) || chunk.match(/datetime="([^"]*)"[^>]*class="fsStartTime"/);
      const endM = chunk.match(
        /class="fsEndTime"[^>]*datetime="([^"]*)"/
      ) || chunk.match(/datetime="([^"]*)"[^>]*class="fsEndTime"/);
      // site order: datetime before class sometimes
      const startIso =
        chunk.match(
          /<time datetime="([^"]+)" class="fsStartTime"/
        )?.[1] || null;
      const endIso =
        chunk.match(/<time datetime="([^"]+)" class="fsEndTime"/)?.[1] ||
        null;
      const loc = decodeEntities(
        chunk.match(/<div class="fsLocation">([^<]*)</)?.[1] || ""
      );

      events.push({
        date,
        title,
        calendar,
        category: /athletics/i.test(calendar)
          ? "athletics"
          : /fine arts/i.test(calendar)
            ? "arts"
            : "school",
        allDay,
        start: allDay ? null : hhmmFromIso(startIso),
        end: allDay ? null : hhmmFromIso(endIso),
        location: loc || null,
        occurId,
      });
    }
  }
  return events;
}

async function fetchMonth(date) {
  const r = await fetch(ELEMENT + encodeURIComponent(date), {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!r.ok) throw new Error(`Fetch ${date} failed: ${r.status}`);
  return r.text();
}

async function main() {
  let cursor = firstOfMonth(new Date());
  // Use Chicago-ish: pull from schedule year around now
  const now = new Date();
  cursor = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  const months = [cursor, nextMonth(cursor), nextMonth(nextMonth(cursor))];
  const all = [];
  for (const m of months) {
    console.log("fetch", m);
    const html = await fetchMonth(m);
    all.push(...parseHtml(html));
  }
  const seen = new Set();
  const events = [];
  for (const ev of all) {
    const key = `${ev.date}|${ev.title}|${ev.start || "all"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(ev);
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  const payload = {
    source:
      "https://www.lisle202.org/lisle-high-school/about-our-school/lhs-calendar",
    syncedAt: new Date().toISOString(),
    events,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
  console.log("Wrote", events.length, "events to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
