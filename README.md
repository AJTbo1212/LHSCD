# Lisle Senior High School · Live Period Tracker

Static live tracker for Lisle Senior High School bell periods. Shows the current period, time remaining, school events from lisle202.org, and what’s next — all in America/Chicago time.

## Run locally (live calendar)

```bash
node scripts/serve.mjs
```

Then visit `http://localhost:8080`.

## Deploy to Netlify

The site is static HTML/CSS/JS. Live school events need a tiny proxy (browser CORS blocks lisle202.org). This repo includes that as a Netlify Function.

### Option A — Netlify UI (Git)

1. Push this project to GitHub/GitLab/Bitbucket.
2. In [Netlify](https://app.netlify.com): **Add new site → Import an existing project**.
3. Pick the repo.
4. Build settings (already in [`netlify.toml`](netlify.toml)):
   - **Publish directory:** `.` (site root)
   - **Functions directory:** `netlify/functions`
   - **Build command:** leave empty
5. Deploy. Your site URL will look like `https://something.netlify.app`.

### Option B — Netlify CLI

```bash
npx netlify login
npx netlify init
npx netlify deploy --prod
```

### Option C — Drag and drop (static only)

Drag the project folder onto Netlify’s **Deploy manually** page.

**Note:** drag-and-drop does **not** run Functions, so the calendar falls back to [`js/events-data.json`](js/events-data.json). For live updates from lisle202.org, use Option A or B.

### After deploy

- Open the site and confirm periods + **School events** load.
- Status should say **Live from lisle202.org** when the function works.
- Refresh cached fallback anytime with: `node scripts/sync-calendar.mjs` then redeploy.

## What’s included

- Full-window layout sized to the browser viewport
- School events from lisle202.org (academic, athletics, fine arts) for the next **60 days**
- Click an event for title, calendar, date/time, location, and a link to the school site
- Live period countdown + ONEPRIDE signup reminder (2 days before)
- Enlargeable today’s schedule (Chromebook-friendly)
- Manual schedule override + A/C lunch preference
- Custom primary/secondary theme colors (saved in browser)
- State-driven micro-animations (passing urgency, final-minute pulse, calm weekends, ONEPRIDE glow)

## Update schedules

Edit [`js/schedule-data.json`](js/schedule-data.json):

- `schedules` — period `start` / `end` as 24-hour `HH:MM`
- `specialDates.onepride` / `plc155` / `early1122` — `YYYY-MM-DD` in Central Time

## Project layout

```
index.html
styles.css
netlify.toml
netlify/functions/lhs-calendar.mjs
js/…
scripts/serve.mjs
scripts/sync-calendar.mjs
README.md
```
