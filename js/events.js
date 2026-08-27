/**
 * Load and parse Lisle High school calendar events (live via local proxy).
 */

import { chicagoDateString, formatHHMM } from "./schedules.js";

export const CALENDAR_PAGE =
  "https://www.lisle202.org/lisle-high-school/about-our-school/lhs-calendar";

const MONTHS_AHEAD = 2;
const DEFAULT_HORIZON_DAYS = 60;

function parseYmdUtc(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function addDaysYmd(ymd, days) {
  const t = parseYmdUtc(ymd) + days * 86_400_000;
  const dt = new Date(t);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function firstOfMonth(ymd) {
  return `${ymd.slice(0, 7)}-01`;
}

function nextMonthStart(ymd) {
  const [y, m] = ymd.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function hhmmFromIso(iso) {
  if (!iso) return null;
  // 2026-08-21T19:00:00-05:00 → use wall-clock fields from string
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

function dateFromParts(year, monthIndex, day) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

/**
 * Parse Finalsite calendar AJAX HTML into event objects.
 * @param {string} html
 */
export function parseCalendarHtml(html) {
  if (!html || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const events = [];

  for (const daybox of doc.querySelectorAll(".fsCalendarDaybox")) {
    const dateEl = daybox.querySelector(".fsCalendarDate");
    if (!dateEl) continue;
    const year = Number(dateEl.getAttribute("data-year"));
    const monthIndex = Number(dateEl.getAttribute("data-month"));
    const day = Number(dateEl.getAttribute("data-day"));
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
      continue;
    }
    const date = dateFromParts(year, monthIndex, day);

    for (const info of daybox.querySelectorAll(".fsCalendarInfo")) {
      const titleEl = info.querySelector(".fsCalendarEventTitle");
      if (!titleEl) continue;
      const title = decodeEntities(
        titleEl.getAttribute("title") || titleEl.textContent || ""
      );
      if (!title) continue;

      const calendar =
        decodeEntities(
          info.querySelector(".fsElementEventColorIcon")?.getAttribute("title") ||
            info.querySelector(".fsStyleSROnly")?.textContent ||
            ""
        ) || "School calendar";

      const allDay = Boolean(info.querySelector(".fsAllDayEvent"));
      const startIso = info.querySelector("time.fsStartTime")?.getAttribute("datetime");
      const endIso = info.querySelector("time.fsEndTime")?.getAttribute("datetime");
      const location = decodeEntities(
        info.querySelector(".fsLocation")?.textContent || ""
      );
      const occurId = titleEl.getAttribute("data-occur-id") || null;

      events.push({
        id: occurId || `${date}|${title}|${startIso || "all"}`,
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
        startIso: startIso || null,
        endIso: endIso || null,
        location: location || null,
        occurId,
        source: "live",
        url: CALENDAR_PAGE,
      });
    }
  }

  return events;
}

async function fetchMonthHtml(dateYmd) {
  const res = await fetch(
    `/api/lhs-calendar?date=${encodeURIComponent(dateYmd)}`,
    { cache: "no-cache" }
  );
  if (!res.ok) {
    throw new Error(`Calendar proxy ${res.status}`);
  }
  return res.text();
}

/**
 * Live fetch via local proxy for this month + following months.
 * @returns {Promise<{ events: object[], live: boolean, error?: string }>}
 */
export async function fetchLiveEvents(now = new Date()) {
  const today = chicagoDateString(now);
  let cursor = firstOfMonth(today);
  const months = [];
  for (let i = 0; i <= MONTHS_AHEAD; i++) {
    months.push(cursor);
    cursor = nextMonthStart(cursor);
  }

  const all = [];
  for (const monthDate of months) {
    const html = await fetchMonthHtml(monthDate);
    all.push(...parseCalendarHtml(html));
  }

  const seen = new Set();
  const deduped = [];
  for (const ev of all) {
    const key = `${ev.date}|${ev.title}|${ev.start || "all"}|${ev.calendar}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ev);
  }

  return { events: deduped, live: true };
}

/**
 * Fallback curated JSON.
 */
export async function loadCachedEventsData() {
  const res = await fetch("js/events-data.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
  return res.json();
}

/**
 * Merge schedule special days into event list.
 */
export function mergeScheduleEvents(list, scheduleData) {
  const out = [...list];
  const seen = new Set(
    out.map((e) => `${e.date}|${(e.title || "").toLowerCase()}`)
  );

  const special = scheduleData?.specialDates || {};
  for (const date of special.onepride || []) {
    const key = `${date}|onepride`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      date,
      title: "ONEPRIDE",
      calendar: "Lisle High School Calendar",
      category: "schedule",
      start: "10:50",
      end: "11:40",
      allDay: false,
      location: null,
      url: CALENDAR_PAGE,
      source: "schedule",
    });
  }
  for (const date of special.plc155 || []) {
    const key = `${date}|early dismissal (1:55 plc)`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      date,
      title: "Early Dismissal (1:55 PLC)",
      calendar: "Lisle High School Calendar",
      category: "schedule",
      allDay: true,
      start: null,
      end: null,
      location: null,
      url: CALENDAR_PAGE,
      source: "schedule",
    });
  }

  out.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const as = a.allDay ? "00:00" : a.start || "99:99";
    const bs = b.allDay ? "00:00" : b.start || "99:99";
    return as.localeCompare(bs);
  });
  return out;
}

function formatDayLabel(ymd, todayStr) {
  if (ymd === todayStr) return "Today";
  if (ymd === addDaysYmd(todayStr, 1)) return "Tomorrow";
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  return utc.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatLongDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  return utc.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRange(ev) {
  if (ev.allDay) return "All day";
  if (ev.start && ev.end) {
    return `${formatHHMM(ev.start)} – ${formatHHMM(ev.end)}`;
  }
  if (ev.start) return formatHHMM(ev.start);
  return "";
}

/**
 * Visible upcoming events.
 */
export function getVisibleEvents(
  allEvents,
  now = new Date(),
  horizonDays = DEFAULT_HORIZON_DAYS
) {
  const todayStr = chicagoDateString(now);
  const endStr = addDaysYmd(todayStr, horizonDays);

  return allEvents
    .filter((e) => e.date >= todayStr && e.date <= endStr)
    .map((e) => ({
      ...e,
      dayLabel: formatDayLabel(e.date, todayStr),
      longDate: formatLongDate(e.date),
      timeLabel: formatTimeRange(e),
      isToday: e.date === todayStr,
    }));
}

/** @deprecated keep name for callers that still import loadEventsData */
export async function loadEventsData() {
  return loadCachedEventsData();
}

export function buildEventList(eventsPayload, scheduleData) {
  return mergeScheduleEvents(eventsPayload.events || [], scheduleData);
}
