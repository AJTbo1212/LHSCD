/**
 * Schedule loading + resolution for Lisle High period tracker.
 * Extension points:
 *   - loadScheduleData()  → swap for lisle202 sync later
 */

const TIMEZONE = "America/Chicago";
const STORAGE_KEYS = {
  override: "lhs-schedule-override",
  lunch: "lhs-lunch-pref",
  clockDelay: "lhs-clock-delay-sec",
  themePrimary: "lhs-theme-primary",
  themeSecondary: "lhs-theme-secondary",
};

export const DEFAULT_THEME_PRIMARY = "#d4a017";
export const DEFAULT_THEME_SECONDARY = "#0a1628";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeHexColor(value, fallback) {
  const v = String(value || "").trim();
  return HEX_COLOR_RE.test(v) ? v.toLowerCase() : fallback;
}

/**
 * Load schedule JSON. Today: local file. Later: lisle202 or a small backend.
 * @returns {Promise<object>}
 */
export async function loadScheduleData() {
  const res = await fetch("js/schedule-data.json", { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Failed to load schedule data (${res.status})`);
  }
  return res.json();
}

export function getSavedOverride() {
  const v = localStorage.getItem(STORAGE_KEYS.override);
  return v && v !== "auto" ? v : "auto";
}

export function setSavedOverride(id) {
  localStorage.setItem(STORAGE_KEYS.override, id || "auto");
}

export function getSavedLunch() {
  const v = localStorage.getItem(STORAGE_KEYS.lunch);
  return v === "C" ? "C" : "A";
}

export function setSavedLunch(pref) {
  localStorage.setItem(STORAGE_KEYS.lunch, pref === "C" ? "C" : "A");
}

export function getSavedThemePrimary() {
  return normalizeHexColor(
    localStorage.getItem(STORAGE_KEYS.themePrimary),
    DEFAULT_THEME_PRIMARY
  );
}

export function setSavedThemePrimary(hex) {
  const v = normalizeHexColor(hex, DEFAULT_THEME_PRIMARY);
  localStorage.setItem(STORAGE_KEYS.themePrimary, v);
  return v;
}

export function getSavedThemeSecondary() {
  return normalizeHexColor(
    localStorage.getItem(STORAGE_KEYS.themeSecondary),
    DEFAULT_THEME_SECONDARY
  );
}

export function setSavedThemeSecondary(hex) {
  const v = normalizeHexColor(hex, DEFAULT_THEME_SECONDARY);
  localStorage.setItem(STORAGE_KEYS.themeSecondary, v);
  return v;
}

/**
 * Personalized clock offset in seconds.
 * Positive = treat "now" as later (use when school clocks run ahead of your device).
 * Clamped to ±10 minutes.
 */
export function getSavedClockDelay() {
  const n = Number(localStorage.getItem(STORAGE_KEYS.clockDelay));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-600, Math.min(600, Math.round(n)));
}

export function setSavedClockDelay(seconds) {
  const n = Number(seconds);
  const v = Number.isFinite(n) ? Math.max(-600, Math.min(600, Math.round(n))) : 0;
  localStorage.setItem(STORAGE_KEYS.clockDelay, String(v));
  return v;
}

/** Device time shifted by the saved (or given) delay. */
export function getAdjustedNow(delaySeconds = getSavedClockDelay()) {
  return new Date(Date.now() + Number(delaySeconds || 0) * 1000);
}

/**
 * Chicago calendar/time parts for a Date.
 */
export function getChicagoParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = {};
  for (const { type, value } of fmt.formatToParts(date)) {
    if (type !== "literal") map[type] = value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday,
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

export function chicagoDateString(date = new Date()) {
  const p = getChicagoParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function chicagoMinutes(date = new Date()) {
  const p = getChicagoParts(date);
  return p.hour * 60 + p.minute + p.second / 60;
}

export function parseHHMM(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function formatHHMM(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "p" : "a";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Pick schedule id for a Chicago calendar date.
 * Priority: early1122 > plc155 > onepriide > daily
 */
export function resolveScheduleId(data, dateStr, overrideId = "auto") {
  if (overrideId && overrideId !== "auto") {
    const found = data.schedules.find((s) => s.id === overrideId);
    if (found) return { id: found.id, auto: false };
  }

  const special = data.specialDates || {};
  if ((special.early1122 || []).includes(dateStr)) {
    return { id: "early1122", auto: true };
  }
  if ((special.plc155 || []).includes(dateStr)) {
    return { id: "plc155", auto: true };
  }
  if ((special.onepride || []).includes(dateStr)) {
    return { id: "onepride", auto: true };
  }
  return { id: "daily", auto: true };
}

export function getScheduleById(data, id) {
  return data.schedules.find((s) => s.id === id) || data.schedules[0];
}

/**
 * Full day timeline: periods plus passing gaps (with durations).
 * Always useful — including after school / weekends for the selected schedule.
 * @returns {Array<{
 *   type: "period" | "passing",
 *   id: string,
 *   name: string,
 *   start: string,
 *   end: string,
 *   durationMin: number,
 *   toName?: string,
 * }>}
 */
export function getDayTimeline(schedule) {
  const periods = schedule?.periods || [];
  const rows = [];
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const start = parseHHMM(p.start);
    const end = parseHHMM(p.end);
    rows.push({
      type: "period",
      id: p.id,
      name: p.name,
      start: p.start,
      end: p.end,
      durationMin: Math.max(0, Math.round(end - start)),
    });
    const next = periods[i + 1];
    if (next) {
      const nextStart = parseHHMM(next.start);
      const gap = nextStart - end;
      if (gap > 0) {
        rows.push({
          type: "passing",
          id: `pass-${p.id}-${next.id}`,
          name: "Passing",
          start: p.end,
          end: next.start,
          durationMin: Math.round(gap),
          toName: next.name,
        });
      }
    }
  }
  return rows;
}

/**
 * Which timeline row is active right now (or null if before/after/weekend).
 */
export function getActiveTimelineId(timeline, now = new Date()) {
  const minutes = chicagoMinutes(now);
  for (const row of timeline) {
    const start = parseHHMM(row.start);
    const end = parseHHMM(row.end);
    if (minutes >= start && minutes < end) return row.id;
  }
  return null;
}

/**
 * Summary of between-period (passing) windows for the day schedule.
 */
export function getPassingSummary(timeline) {
  const gaps = (timeline || []).filter((row) => row.type === "passing");
  if (!gaps.length) return null;
  const mins = gaps.map((g) => g.durationMin);
  const minMinutes = Math.min(...mins);
  const maxMinutes = Math.max(...mins);
  return {
    gaps,
    minMinutes,
    maxMinutes,
    label: minMinutes === maxMinutes ? `${minMinutes} min` : `${minMinutes}–${maxMinutes} min`,
    /** Use shortest gap for a timer-style display matching live passing countdowns */
    countdownSeconds: minMinutes * 60,
  };
}

function parseYmdUtc(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function calendarDaysBetween(fromYmd, toYmd) {
  return Math.round((parseYmdUtc(toYmd) - parseYmdUtc(fromYmd)) / 86_400_000);
}

function formatOneprideDay(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  return utc.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function addDaysYmd(ymd, days) {
  const t = parseYmdUtc(ymd) + days * 86_400_000;
  const dt = new Date(t);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekdaySun0(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Convert a Chicago wall-clock date + HH:MM to a UTC epoch ms.
 */
export function chicagoWallTimeToUtcMs(ymd, hhmm) {
  const [Y, M, D] = ymd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  let guess = Date.UTC(Y, M - 1, D, h, mi, 0);
  for (let i = 0; i < 6; i++) {
    const p = getChicagoParts(new Date(guess));
    const gotDate = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
    const gotMin = p.hour * 60 + p.minute + p.second / 60;
    const wantMin = h * 60 + mi;
    const dayDelta = calendarDaysBetween(gotDate, ymd);
    const diffMin = dayDelta * 24 * 60 + (wantMin - gotMin);
    if (Math.abs(diffMin) < 1 / 60) break;
    guess += diffMin * 60 * 1000;
  }
  return guess;
}

/**
 * Next weekday school start (first period), for after-hours countdown.
 */
export function getNextSchoolStart(data, now = new Date(), overrideId = "auto") {
  const parts = getChicagoParts(now);
  let candidate = chicagoDateString(now);

  if (!isWeekend(parts.weekday)) {
    const todayId = resolveScheduleId(data, candidate, overrideId).id;
    const todaySchedule = getScheduleById(data, todayId);
    const last = todaySchedule.periods[todaySchedule.periods.length - 1];
    const lastEnd = parseHHMM(last.end);
    if (chicagoMinutes(now) >= lastEnd) {
      candidate = addDaysYmd(candidate, 1);
    }
  }

  for (let i = 0; i < 10; i++) {
    const wd = weekdaySun0(candidate);
    if (wd !== 0 && wd !== 6) {
      // Future school days use date-based schedule (not a forced override meant for "today")
      const scheduleId = resolveScheduleId(data, candidate, "auto").id;
      const schedule = getScheduleById(data, scheduleId);
      const first = schedule.periods[0];
      const targetMs = chicagoWallTimeToUtcMs(candidate, first.start);
      const seconds = Math.max(0, (targetMs - now.getTime()) / 1000);
      return {
        dateStr: candidate,
        seconds,
        scheduleId: schedule.id,
        scheduleLabel: schedule.label,
        next: {
          id: first.id,
          name: first.name,
          start: first.start,
          date: candidate,
        },
      };
    }
    candidate = addDaysYmd(candidate, 1);
  }
  return null;
}

/**
 * Reminder to sign up for ONEPRIDE on the two calendar days before a ONEPRIDE date.
 * @returns {null | { daysUntil: 1 | 2, oneprideDate: string, message: string }}
 */
export function getOneprideSignupReminder(data, now = new Date()) {
  const dates = data?.specialDates?.onepride || [];
  if (!dates.length) return null;

  const todayStr = chicagoDateString(now);
  let best = null;

  for (const dateStr of dates) {
    const daysUntil = calendarDaysBetween(todayStr, dateStr);
    if (daysUntil !== 1 && daysUntil !== 2) continue;
    if (!best || daysUntil < best.daysUntil) {
      best = { daysUntil, oneprideDate: dateStr };
    }
  }

  if (!best) return null;

  const when =
    best.daysUntil === 1
      ? `tomorrow (${formatOneprideDay(best.oneprideDate)})`
      : `in 2 days (${formatOneprideDay(best.oneprideDate)})`;

  return {
    daysUntil: best.daysUntil,
    oneprideDate: best.oneprideDate,
    message: `Sign up for ONEPRIDE — it's ${when}.`,
  };
}

function isWeekend(weekday) {
  return weekday === "Sat" || weekday === "Sun";
}

/**
 * Resolve live status for the current moment.
 * @returns {object} status payload for the UI
 */
export function getPeriodStatus(data, options = {}) {
  const now = options.now || new Date();
  const overrideId = options.overrideId ?? "auto";
  const lunchPref = options.lunchPref === "C" ? "C" : "A";

  const parts = getChicagoParts(now);
  const dateStr = chicagoDateString(now);
  const minutes = chicagoMinutes(now);

  const resolved = resolveScheduleId(data, dateStr, overrideId);
  const schedule = getScheduleById(data, resolved.id);
  const periods = schedule.periods;

  const base = {
    timezone: data.timezone || TIMEZONE,
    dateStr,
    scheduleId: schedule.id,
    scheduleLabel: schedule.label,
    autoPicked: resolved.auto,
    lunchPref,
    clockLabel: formatClock(parts),
  };

  if (isWeekend(parts.weekday)) {
    const nextStart = getNextSchoolStart(data, now, overrideId);
    return {
      ...base,
      state: "weekend",
      title: "No school",
      subtitle: nextStart
        ? `Back ${formatOneprideDay(nextStart.dateStr)}`
        : "Weekend",
      countdownSeconds: nextStart ? nextStart.seconds : null,
      progress: 0,
      next: nextStart?.next || null,
      period: null,
    };
  }

  const first = periods[0];
  const last = periods[periods.length - 1];
  const firstStart = parseHHMM(first.start);
  const lastEnd = parseHHMM(last.end);

  if (minutes < firstStart) {
    const secs = (firstStart - minutes) * 60;
    return {
      ...base,
      state: "before",
      title: "Before school",
      subtitle: `Starts with ${first.name} at ${formatHHMM(first.start)}`,
      countdownSeconds: secs,
      progress: 0,
      next: { id: first.id, name: first.name, start: first.start },
      period: null,
    };
  }

  if (minutes >= lastEnd) {
    const nextStart = getNextSchoolStart(data, now, overrideId);
    return {
      ...base,
      state: "after",
      title: "Day over",
      subtitle: `Ended at ${formatHHMM(last.end)}`,
      countdownSeconds: nextStart ? nextStart.seconds : null,
      progress: 1,
      next: nextStart?.next || null,
      period: null,
    };
  }

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const start = parseHHMM(p.start);
    const end = parseHHMM(p.end);

    if (minutes >= start && minutes < end) {
      const total = end - start;
      const elapsed = minutes - start;
      const secsLeft = (end - minutes) * 60;
      const title = labelForPeriod(p, lunchPref, minutes);
      const nextPeriod = periods[i + 1] || null;

      return {
        ...base,
        state: "in_period",
        title,
        subtitle: `${formatHHMM(p.start)} – ${formatHHMM(p.end)}`,
        countdownSeconds: secsLeft,
        progress: Math.min(1, Math.max(0, elapsed / total)),
        next: nextPeriod
          ? {
              id: nextPeriod.id,
              name: nextPeriod.name,
              start: nextPeriod.start,
            }
          : null,
        period: p,
      };
    }

    const next = periods[i + 1];
    if (next) {
      const nextStart = parseHHMM(next.start);
      if (minutes >= end && minutes < nextStart) {
        const secs = (nextStart - minutes) * 60;
        return {
          ...base,
          state: "passing",
          title: "Passing",
          subtitle: `To ${next.name}`,
          countdownSeconds: secs,
          progress: 0,
          next: { id: next.id, name: next.name, start: next.start },
          period: null,
        };
      }
    }
  }

  return {
    ...base,
    state: "unknown",
    title: "—",
    subtitle: "",
    countdownSeconds: null,
    progress: 0,
    next: null,
    period: null,
  };
}

function labelForPeriod(period, lunchPref, minutes) {
  if (period.lunches && period.lunches[lunchPref]) {
    const lunch = period.lunches[lunchPref];
    const ls = parseHHMM(lunch.start);
    const le = parseHHMM(lunch.end);
    if (minutes >= ls && minutes < le) {
      return `${period.name} · ${lunchPref} Lunch`;
    }
    return `${period.name} · ${lunchPref} Lunch day`;
  }
  return period.name;
}

function formatClock(parts) {
  const h = parts.hour % 12 || 12;
  const suffix = parts.hour >= 12 ? "PM" : "AM";
  return `${h}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")} ${suffix}`;
}
