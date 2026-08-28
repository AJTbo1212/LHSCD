import {
  loadScheduleData,
  getPeriodStatus,
  formatDuration,
  getSavedOverride,
  setSavedOverride,
  getSavedLunch,
  setSavedLunch,
  getSavedClockDelay,
  setSavedClockDelay,
  getSavedThemePrimary,
  setSavedThemePrimary,
  getSavedThemeSecondary,
  setSavedThemeSecondary,
  getAdjustedNow,
  getOneprideSignupReminder,
  chicagoDateString,
  resolveScheduleId,
  getScheduleById,
  getDayTimeline,
  getActiveTimelineId,
  getPassingSummary,
  formatHHMM,
} from "./schedules.js";
import {
  fetchLiveEvents,
  loadCachedEventsData,
  mergeScheduleEvents,
  getVisibleEvents,
  CALENDAR_PAGE,
} from "./events.js";

const HORIZON_DAYS = 60;
const REFRESH_MS = 15 * 60 * 1000;

const els = {
  brandSub: document.getElementById("brand-sub"),
  statusTitle: document.getElementById("status-title"),
  statusSub: document.getElementById("status-sub"),
  countdown: document.getElementById("countdown"),
  countdownLabel: document.getElementById("countdown-label"),
  progressFill: document.getElementById("progress-fill"),
  nextLine: document.getElementById("next-line"),
  oneprideReminder: document.getElementById("onepride-reminder"),
  clock: document.getElementById("live-clock"),
  scheduleChip: document.getElementById("schedule-chip"),
  override: document.getElementById("schedule-override"),
  lunch: document.getElementById("lunch-pref"),
  themePrimary: document.getElementById("theme-primary"),
  themeSecondary: document.getElementById("theme-secondary"),
  clockDelay: document.getElementById("clock-delay"),
  error: document.getElementById("error-banner"),
  eventsTrack: document.getElementById("events-track"),
  eventsEmpty: document.getElementById("events-empty"),
  eventsStatus: document.getElementById("events-status"),
  dayTimeline: document.getElementById("day-timeline"),
  daySchedule: document.getElementById("day-schedule"),
  dayScheduleLabel: document.getElementById("day-schedule-label"),
  scheduleEnlargeBtn: document.getElementById("schedule-enlarge-btn"),
  dialog: document.getElementById("event-dialog"),
  dialogTitle: document.getElementById("event-dialog-title"),
  dialogCalendar: document.getElementById("event-dialog-calendar"),
  dialogWhen: document.getElementById("event-dialog-when"),
  dialogTime: document.getElementById("event-dialog-time"),
  dialogLocationRow: document.getElementById("event-dialog-location-row"),
  dialogLocation: document.getElementById("event-dialog-location"),
  dialogLink: document.getElementById("event-dialog-link"),
};

let data = null;
let allEvents = [];
let eventsByKey = new Map();
let eventsLive = false;
let overrideId = getSavedOverride();
let lunchPref = getSavedLunch();
let themePrimary = getSavedThemePrimary();
let themeSecondary = getSavedThemeSecondary();
let clockDelaySec = getSavedClockDelay();
let lastSecond = -1;
let lastReminderDate = "";
let lastEventsDate = "";
let lastTimelineKey = "";
let lastActiveTimelineId = "";
const SCHEDULE_ENLARGED_KEY = "lhs-schedule-enlarged";

function isScheduleEnlarged() {
  return document.body.classList.contains("schedule-enlarged");
}

function setScheduleEnlarged(on) {
  document.body.classList.toggle("schedule-enlarged", on);
  localStorage.setItem(SCHEDULE_ENLARGED_KEY, on ? "1" : "0");
  if (els.scheduleEnlargeBtn) {
    els.scheduleEnlargeBtn.textContent = on ? "Shrink" : "Enlarge";
    els.scheduleEnlargeBtn.setAttribute("aria-pressed", on ? "true" : "false");
    els.scheduleEnlargeBtn.setAttribute(
      "aria-label",
      on ? "Shrink today’s schedule" : "Enlarge today’s schedule"
    );
  }
}

function toggleScheduleEnlarged() {
  setScheduleEnlarged(!isScheduleEnlarged());
}
function showError(msg) {
  els.error.hidden = !msg;
  els.error.textContent = msg || "";
}

function syncControls() {
  els.override.value = overrideId;
  els.lunch.value = lunchPref;
  if (els.themePrimary) els.themePrimary.value = themePrimary;
  if (els.themeSecondary) els.themeSecondary.value = themeSecondary;
  if (els.clockDelay) els.clockDelay.value = String(clockDelaySec);
}

function applyThemeColors(primary, secondary) {
  const root = document.documentElement;
  root.style.setProperty("--gold", primary);
  root.style.setProperty(
    "--gold-soft",
    `color-mix(in srgb, ${primary} 65%, white)`
  );
  root.style.setProperty("--line", `${primary}47`);
  root.style.setProperty("--navy", secondary);
  root.style.setProperty(
    "--navy-mid",
    `color-mix(in srgb, ${secondary} 75%, white)`
  );
  document.body.style.background = secondary;
}

function eventKey(ev) {
  return `${ev.date}|${ev.title}|${ev.start || "all"}|${ev.calendar || ""}`;
}

function setEventsStatus(text) {
  if (els.eventsStatus) els.eventsStatus.textContent = text;
}

function openEventDialog(ev) {
  if (!els.dialog) return;
  els.dialogTitle.textContent = ev.title;
  els.dialogCalendar.textContent = ev.calendar || "School calendar";
  els.dialogWhen.textContent = ev.longDate || ev.dayLabel || ev.date;
  els.dialogTime.textContent = ev.timeLabel || (ev.allDay ? "All day" : "—");
  if (ev.location) {
    els.dialogLocationRow.hidden = false;
    els.dialogLocation.textContent = ev.location;
  } else {
    els.dialogLocationRow.hidden = true;
    els.dialogLocation.textContent = "";
  }
  els.dialogLink.href = ev.url || CALENDAR_PAGE;
  if (typeof els.dialog.showModal === "function") {
    els.dialog.showModal();
  } else {
    els.dialog.setAttribute("open", "");
  }
}

function renderEvents(now, force = false) {
  if (!els.eventsTrack) return;
  const dateStr = chicagoDateString(now);
  if (!force && dateStr === lastEventsDate) return;
  lastEventsDate = dateStr;

  const visible = getVisibleEvents(allEvents, now, HORIZON_DAYS);
  eventsByKey = new Map(visible.map((ev) => [eventKey(ev), ev]));

  if (!visible.length) {
    els.eventsTrack.replaceChildren();
    if (els.eventsEmpty) els.eventsEmpty.hidden = false;
    return;
  }

  if (els.eventsEmpty) els.eventsEmpty.hidden = true;
  const frag = document.createDocumentFragment();
  for (const ev of visible) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "event-item";
    btn.dataset.key = eventKey(ev);
    btn.dataset.today = ev.isToday ? "true" : "false";
    btn.setAttribute("aria-label", `${ev.title}, ${ev.dayLabel}, ${ev.timeLabel}`);

    const day = document.createElement("p");
    day.className = "event-day";
    day.textContent = ev.dayLabel;

    const title = document.createElement("p");
    title.className = "event-title";
    title.textContent = ev.title;

    const time = document.createElement("p");
    time.className = "event-time";
    time.textContent = ev.timeLabel;

    btn.append(day, title, time);

    if (ev.location) {
      const loc = document.createElement("p");
      loc.className = "event-location";
      loc.textContent = ev.location;
      btn.append(loc);
    }

    frag.appendChild(btn);
  }
  els.eventsTrack.replaceChildren(frag);
}

function renderDayTimeline(status, now) {
  if (!els.dayTimeline || !data) return;

  const dateStr = chicagoDateString(now);
  const resolved = resolveScheduleId(data, dateStr, overrideId);
  const schedule = getScheduleById(data, resolved.id);
  const timeline = getDayTimeline(schedule);
  const activeId = getActiveTimelineId(timeline, now);
  const key = `${schedule.id}|${timeline.length}`;
  const showAllPassing =
    status.state === "after" || status.state === "weekend";

  if (els.dayScheduleLabel) {
    els.dayScheduleLabel.textContent = schedule.label;
  }

  if (key !== lastTimelineKey) {
    lastTimelineKey = key;
    const frag = document.createDocumentFragment();
    for (const row of timeline) {
      const li = document.createElement("li");
      li.className = `timeline-row timeline-${row.type}`;
      li.dataset.id = row.id;

      const name = document.createElement("span");
      name.className = "timeline-name";
      name.textContent =
        row.type === "passing"
          ? `Passing → ${row.toName}`
          : row.name;

      const times = document.createElement("span");
      times.className = "timeline-times";
      times.textContent = `${formatHHMM(row.start)} – ${formatHHMM(row.end)}`;

      const dur = document.createElement("span");
      dur.className = "timeline-duration";
      dur.textContent = `${row.durationMin} min`;

      li.append(name, times, dur);
      frag.appendChild(li);
    }
    els.dayTimeline.replaceChildren(frag);
    lastActiveTimelineId = "";
  }

  for (const li of els.dayTimeline.querySelectorAll(".timeline-row")) {
    const isActive = li.dataset.id === activeId;
    const isPassing = li.classList.contains("timeline-passing");
    li.dataset.active = isActive ? "true" : "false";
    li.dataset.emphasis =
      showAllPassing && isPassing ? "true" : isActive ? "true" : "false";
  }
  lastActiveTimelineId = activeId || (showAllPassing ? "passing-all" : "");
}

function passingDetailLine(summary) {
  if (!summary?.gaps?.length) return "";
  return summary.gaps
    .map((g) => `${formatHHMM(g.start)}–${formatHHMM(g.end)} (${g.durationMin}m)`)
    .join(" · ");
}

function renderOneprideReminder(now) {
  if (!els.oneprideReminder || !data) return;
  const dateStr = chicagoDateString(now);
  if (
    dateStr === lastReminderDate &&
    els.oneprideReminder.dataset.date === dateStr
  ) {
    return;
  }
  lastReminderDate = dateStr;

  const reminder = getOneprideSignupReminder(data, now);
  if (!reminder) {
    els.oneprideReminder.hidden = true;
    els.oneprideReminder.textContent = "";
    els.oneprideReminder.dataset.date = dateStr;
    return;
  }

  els.oneprideReminder.hidden = false;
  els.oneprideReminder.textContent = reminder.message;
  els.oneprideReminder.dataset.date = dateStr;
  els.oneprideReminder.dataset.daysUntil = String(reminder.daysUntil);
}

function formatFriendlyNextDay(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  return utc.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function render(status, now) {
  els.statusTitle.textContent = status.title;
  els.statusSub.textContent = status.subtitle;
  els.clock.textContent = status.clockLabel;
  els.scheduleChip.textContent = status.autoPicked
    ? `Auto · ${status.scheduleLabel}`
    : `Manual · ${status.scheduleLabel}`;
  if (clockDelaySec) {
    const sign = clockDelaySec > 0 ? "+" : "";
    els.scheduleChip.textContent += ` · delay ${sign}${clockDelaySec}s`;
  }

  const dateStr = chicagoDateString(now);
  const resolved = resolveScheduleId(data, dateStr, overrideId);
  const schedule = getScheduleById(data, resolved.id);
  const timeline = getDayTimeline(schedule);
  const passing = getPassingSummary(timeline);

  const hasCountdown = status.countdownSeconds != null;
  if (hasCountdown) {
    els.countdown.textContent = formatDuration(status.countdownSeconds);
    if (status.state === "in_period") {
      els.countdownLabel.textContent = "remaining";
    } else if (status.state === "passing") {
      els.countdownLabel.textContent = "until next bell";
    } else if (status.state === "before") {
      els.countdownLabel.textContent = "until first period";
    } else if (status.state === "after" || status.state === "weekend") {
      els.countdownLabel.textContent = "until school starts";
    } else {
      els.countdownLabel.textContent = "";
    }
  } else {
    els.countdown.textContent = "—";
    els.countdownLabel.textContent = "";
  }

  const pct = Math.round((status.progress || 0) * 1000) / 10;
  els.progressFill.style.width = `${pct}%`;
  els.progressFill.parentElement.setAttribute("aria-valuenow", String(pct));

  if (status.next) {
    const start = status.next.start;
    const [h, m] = start.split(":").map(Number);
    const suffix = h >= 12 ? "p" : "a";
    const hour12 = h % 12 || 12;
    const dayNote =
      status.next.date && status.next.date !== dateStr
        ? `${formatFriendlyNextDay(status.next.date)} · `
        : "";
    els.nextLine.textContent = `Next: ${dayNote}${status.next.name} at ${hour12}:${String(m).padStart(2, "0")}${suffix}`;
  } else if (status.state === "after") {
    els.nextLine.textContent = "No more periods today";
  } else if (status.state === "weekend") {
    els.nextLine.textContent = "Back Monday";
  } else {
    els.nextLine.textContent = "";
  }

  // Passing windows stay listed under the schedule for reference
  if (
    passing &&
    (status.state === "after" || status.state === "weekend") &&
    els.nextLine.textContent
  ) {
    els.nextLine.textContent += ` · Passing ${passing.label}`;
  }

  renderOneprideReminder(now);
  renderDayTimeline(status, now);
  renderEvents(now);
  document.body.dataset.state = status.state;
  document.body.dataset.schedule = status.scheduleId || "";
  document.body.dataset.urgency =
    status.state === "in_period" &&
    status.countdownSeconds != null &&
    status.countdownSeconds <= 60
      ? "final-minute"
      : "";
}

function tick() {
  if (!data) return;
  const now = getAdjustedNow(clockDelaySec);
  const sec = now.getSeconds();
  if (sec === lastSecond) {
    requestAnimationFrame(tick);
    return;
  }
  lastSecond = sec;

  const status = getPeriodStatus(data, { now, overrideId, lunchPref });
  render(status, now);
  requestAnimationFrame(tick);
}

function populateOverrideOptions() {
  const auto = document.createElement("option");
  auto.value = "auto";
  auto.textContent = "Auto (by date)";
  els.override.replaceChildren(auto);

  for (const s of data.schedules) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.label;
    els.override.appendChild(opt);
  }
}

async function loadEvents(schedule) {
  setEventsStatus("Updating from lisle202.org…");
  try {
    const live = await fetchLiveEvents(new Date());
    allEvents = mergeScheduleEvents(live.events, schedule);
    eventsLive = true;
    setEventsStatus(
      `Live from lisle202.org · ${allEvents.length} events · next ${HORIZON_DAYS} days`
    );
  } catch (err) {
    console.warn("Live calendar unavailable, using cached events.", err);
    try {
      const cached = await loadCachedEventsData();
      allEvents = mergeScheduleEvents(cached.events || [], schedule);
      eventsLive = false;
      setEventsStatus(
        "Cached events (run node scripts/serve.mjs for live school calendar)"
      );
    } catch (cacheErr) {
      console.error(cacheErr);
      allEvents = mergeScheduleEvents([], schedule);
      setEventsStatus("Could not load school events");
    }
  }
  lastEventsDate = "";
  renderEvents(new Date(), true);
}

els.override.addEventListener("change", () => {
  overrideId = els.override.value;
  setSavedOverride(overrideId);
  lastTimelineKey = "";
  lastSecond = -1;
});

els.lunch.addEventListener("change", () => {
  lunchPref = els.lunch.value;
  setSavedLunch(lunchPref);
  lastSecond = -1;
});

els.themePrimary?.addEventListener("input", () => {
  themePrimary = setSavedThemePrimary(els.themePrimary.value);
  els.themePrimary.value = themePrimary;
  applyThemeColors(themePrimary, themeSecondary);
});

els.themeSecondary?.addEventListener("input", () => {
  themeSecondary = setSavedThemeSecondary(els.themeSecondary.value);
  els.themeSecondary.value = themeSecondary;
  applyThemeColors(themePrimary, themeSecondary);
});

function onClockDelayInput() {
  clockDelaySec = setSavedClockDelay(els.clockDelay.value);
  els.clockDelay.value = String(clockDelaySec);
  lastSecond = -1;
}

els.clockDelay?.addEventListener("change", onClockDelayInput);
els.clockDelay?.addEventListener("input", () => {
  // Live preview while typing/spinning, persist on change
  const n = Number(els.clockDelay.value);
  if (!Number.isFinite(n)) return;
  clockDelaySec = Math.max(-600, Math.min(600, Math.round(n)));
  lastSecond = -1;
});
els.clockDelay?.addEventListener("blur", onClockDelayInput);

els.eventsTrack?.addEventListener("click", (e) => {
  const btn = e.target.closest(".event-item");
  if (!btn) return;
  const ev = eventsByKey.get(btn.dataset.key);
  if (ev) openEventDialog(ev);
});

els.scheduleEnlargeBtn?.addEventListener("click", () => {
  toggleScheduleEnlarged();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isScheduleEnlarged()) {
    setScheduleEnlarged(false);
  }
});

async function init() {
  try {
    data = await loadScheduleData();
    populateOverrideOptions();
    syncControls();
    applyThemeColors(themePrimary, themeSecondary);
    setScheduleEnlarged(localStorage.getItem(SCHEDULE_ENLARGED_KEY) === "1");
    els.brandSub.textContent = "Live period tracker";
    showError("");
    await loadEvents(data);
    requestAnimationFrame(tick);
    setInterval(() => {
      if (data) loadEvents(data);
    }, REFRESH_MS);
  } catch (err) {
    console.error(err);
    showError(
      "Could not load schedule data. Run: node scripts/serve.mjs — then open http://localhost:8080"
    );
  }
}

init();
