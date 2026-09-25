/**
 * Build the sendable "LHSCD Appscript" package from gas/.
 *
 * Multi-file HtmlService project (paste-friendly + clasp-ready):
 *   Code.gs, Index, Styles, Data, Schedules, Events, Clock, appsscript.json
 *
 * Also writes:
 *   LHSCD Appscript.zip
 *   LHSCD-Appscript.zip
 *
 * Does not modify the main site frontend (index.html / styles.css / js/).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GAS = path.join(ROOT, "gas");
const OUT_DIR = path.join(ROOT, "LHSCD Appscript");

const COPY_FILES = [
  "Code.gs",
  "appsscript.json",
  "Index.html",
  "Styles.html",
  "Data.html",
  "Schedules.html",
  "Events.html",
  "Clock.html",
];

function readGas(name) {
  return fs.readFileSync(path.join(GAS, name), "utf8");
}

function writeImportReadme() {
  return `LHSCD Appscript — make it work
=================================

This folder is a complete Google Apps Script web app.
Send LHSCD-Appscript.zip (repo root). Recipient does not need the rest of the repo.

Files (create each HTML file with the EXACT name, no .html in the Apps Script UI):
  Code.gs      → Code.gs
  Index.html   → HTML file named Index
  Styles.html  → HTML file named Styles
  Data.html    → HTML file named Data
  Schedules.html → HTML file named Schedules
  Events.html  → HTML file named Events
  Clock.html   → HTML file named Clock
  appsscript.json → Project Settings → Show "appsscript.json" (or set TZ America/Chicago)

------------------------------------------------
RECOMMENDED: clasp (avoids giant paste errors)
------------------------------------------------
  npm i -g @google/clasp
  cd "LHSCD Appscript"
  clasp login
  clasp create --type webapp --title "LHSCD Period Tracker"
  clasp push
  Then in the Apps Script editor:
    Deploy → New deployment → Web app
      Execute as: Me
      Who has access: Anyone
    Authorize when prompted.

------------------------------------------------
Manual paste (script.google.com)
------------------------------------------------
1. https://script.google.com → New project
2. Paste Code.gs over the default Code.gs
3. For each HTML file above: File → New → HTML → name it exactly (Index, Styles, …)
   Paste the matching file contents (replace the stub)
4. Deploy → New deployment → Web app → Anyone
5. Run testCalendar once (select testCalendar → Run) to grant UrlFetchApp
6. Open the web app URL

------------------------------------------------
Verify it works
------------------------------------------------
- Editor: Run → testCalendar → should log "OK — fetched N events…"
- Web app: status should say "Live from lisle202.org"
- If calendar fails, events still fall back to embedded cache in Data.html

Rebuild from the LHSCD repo:
  node scripts/build-gas.mjs
`;
}

function main() {
  for (const name of COPY_FILES) {
    if (!fs.existsSync(path.join(GAS, name))) {
      throw new Error(`gas/${name} missing — run node scripts/build-gas.mjs first`);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Clean old inlined-only leftovers if any
  for (const existing of fs.readdirSync(OUT_DIR)) {
    fs.unlinkSync(path.join(OUT_DIR, existing));
  }

  for (const name of COPY_FILES) {
    const contents = readGas(name);
    fs.writeFileSync(path.join(OUT_DIR, name), contents);
    console.log(`wrote LHSCD Appscript/${name} (${contents.length} bytes)`);
  }

  const importTxt = writeImportReadme();
  fs.writeFileSync(path.join(OUT_DIR, "IMPORT.txt"), importTxt);
  console.log(`wrote LHSCD Appscript/IMPORT.txt (${importTxt.length} bytes)`);

  // clasp helper (no scriptId until create)
  fs.writeFileSync(
    path.join(OUT_DIR, ".clasp.json.example"),
    JSON.stringify({ scriptId: "YOUR_SCRIPT_ID", rootDir: "." }, null, 2) + "\n"
  );

  for (const zipName of ["LHSCD Appscript.zip", "LHSCD-Appscript.zip"]) {
    const zipPath = path.join(ROOT, zipName);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execFileSync("zip", ["-r", "-q", zipPath, "LHSCD Appscript"], {
      cwd: ROOT,
    });
    console.log(
      `wrote ${zipName} (${fs.statSync(zipPath).size} bytes) — send this file`
    );
  }
}

main();
