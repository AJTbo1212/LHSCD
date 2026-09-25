/**
 * Lisle Senior High School · Live Period Tracker
 * Google Apps Script web app entry point.
 *
 * Deploy: Deploy → New deployment → Web app
 * Or: clasp push from "LHSCD Appscript/" or gas/
 */

var LHS_CALENDAR_ELEMENT =
  "https://www.lisle202.org/fs/elements/4419?is_ajax=true&cal_date=";
var LHS_CALENDAR_PAGE =
  "https://www.lisle202.org/lisle-high-school/about-our-school/lhs-calendar";

/**
 * Serve the tracker UI.
 * @return {HtmlOutput}
 */
function doGet() {
  var output = HtmlService.createTemplateFromFile("Index").evaluate();
  output
    .setTitle("Lisle Senior High School · Period Tracker")
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return output;
}

/**
 * Include another HTML file's contents (CSS/JS partials).
 * @param {string} filename file name without .html
 * @return {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Manual smoke test — run from the Apps Script editor (Run → testCalendar).
 * Opens an authorization prompt for UrlFetchApp on first run.
 * @return {string}
 */
function testCalendar() {
  var today = Utilities.formatDate(new Date(), "America/Chicago", "yyyy-MM-dd");
  var month = today.slice(0, 8) + "01";
  var events = fetchLhsCalendarEvents([month]);
  var msg =
    "OK — fetched " +
    events.length +
    " events for " +
    month +
    (events[0] ? ". First: " + events[0].title : "");
  Logger.log(msg);
  return msg;
}

/**
 * Fetch + parse several calendar months in one round-trip.
 * @param {string[]} monthDates list of YYYY-MM-DD (first of each month)
 * @return {Object[]} normalized event objects
 */
function fetchLhsCalendarEvents(monthDates) {
  var dates = Array.isArray(monthDates) ? monthDates : [];
  var all = [];
  for (var i = 0; i < dates.length; i++) {
    var date = String(dates[i] || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Invalid date: " + date);
    }
    all = all.concat(parseCalendarHtml_(fetchCalendarHtml_(date)));
  }

  var seen = {};
  var deduped = [];
  for (var j = 0; j < all.length; j++) {
    var ev = all[j];
    var key =
      ev.date +
      "|" +
      ev.title +
      "|" +
      (ev.start || "all") +
      "|" +
      (ev.calendar || "");
    if (seen[key]) continue;
    seen[key] = true;
    deduped.push(ev);
  }
  return deduped;
}

/**
 * @param {string} dateYmd
 * @return {string}
 * @private
 */
function fetchCalendarHtml_(dateYmd) {
  var url = LHS_CALENDAR_ELEMENT + encodeURIComponent(dateYmd);
  var response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; LHSPeriodTracker/1.0; +apps-script)",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "text/html, */*",
    },
  });
  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("Calendar upstream " + code);
  }
  return body;
}

/**
 * Regex parse Finalsite calendar AJAX HTML (no DOM in Apps Script).
 * @param {string} html
 * @return {Object[]}
 * @private
 */
function parseCalendarHtml_(html) {
  var events = [];
  if (!html) return events;

  var boxes = String(html).split(/<div class="fsCalendarDaybox[^"]*">/);
  for (var b = 1; b < boxes.length; b++) {
    var box = boxes[b];
    var parts = box.match(
      /class="fsCalendarDate"[^>]*data-day="(\d+)"[^>]*data-year="(\d+)"[^>]*data-month="(\d+)"/
    );
    if (!parts) {
      parts = box.match(
        /data-day="(\d+)"[^>]*data-year="(\d+)"[^>]*data-month="(\d+)"/
      );
    }
    if (!parts) continue;

    var day = Number(parts[1]);
    var year = Number(parts[2]);
    var monthIndex = Number(parts[3]);
    var date =
      year + "-" + pad2_(monthIndex + 1) + "-" + pad2_(day);

    var infoChunks = box.split(/class="fsCalendarInfo"/).slice(1);
    for (var c = 0; c < infoChunks.length; c++) {
      var chunk = infoChunks[c];
      var tm = chunk.match(
        /class="fsCalendarEventTitle fsCalendarEventLink" title="([^"]*)" data-occur-id="([^"]*)"/
      );
      if (!tm) {
        tm = chunk.match(
          /fsCalendarEventTitle[^>]*title="([^"]*)"[^>]*data-occur-id="([^"]*)"/
        );
      }
      if (!tm) continue;

      var title = decodeEntities_(tm[1]);
      if (!title) continue;
      var occurId = tm[2] || null;

      var calM = chunk.match(
        /fsElementEventColorIcon[^>]*title=["']([^"']*)["']/
      );
      if (!calM) {
        calM = chunk.match(/fsStyleSROnly[^>]*>([^<]+)</);
      }
      var calendar = decodeEntities_((calM && calM[1]) || "School calendar");
      var allDay = /fsAllDayEvent/.test(chunk);

      var startIsoM = chunk.match(
        /<time datetime="([^"]+)" class="fsStartTime"/
      );
      var endIsoM = chunk.match(/<time datetime="([^"]+)" class="fsEndTime"/);
      var startIso = startIsoM ? startIsoM[1] : null;
      var endIso = endIsoM ? endIsoM[1] : null;

      var locM = chunk.match(/<div class="fsLocation">([^<]*)</);
      var location = decodeEntities_((locM && locM[1]) || "");

      var category = /athletics/i.test(calendar)
        ? "athletics"
        : /fine arts/i.test(calendar)
          ? "arts"
          : "school";

      events.push({
        id: occurId || date + "|" + title + "|" + (startIso || "all"),
        date: date,
        title: title,
        calendar: calendar,
        category: category,
        allDay: allDay,
        start: allDay ? null : hhmmFromIso_(startIso),
        end: allDay ? null : hhmmFromIso_(endIso),
        startIso: startIso,
        endIso: endIso,
        location: location || null,
        occurId: occurId,
        source: "live",
        url: LHS_CALENDAR_PAGE,
      });
    }
  }
  return events;
}

/** @private */
function pad2_(n) {
  var s = String(n);
  return s.length < 2 ? "0" + s : s;
}

/** @private */
function decodeEntities_(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** @private */
function hhmmFromIso_(iso) {
  if (!iso) return null;
  var m = String(iso).match(/T(\d{2}):(\d{2})/);
  return m ? m[1] + ":" + m[2] : null;
}
