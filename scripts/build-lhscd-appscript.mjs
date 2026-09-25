/**
 * Build the sendable "LHSCD Appscript" package.
 *
 * Produces:
 *   LHSCD Appscript/     — Code.gs + Index.html + appsscript.json (2-file import)
 *   LHSCD Appscript.zip  — same files, ready to email / share
 *
 * Does not modify the main site frontend (index.html / styles.css / js/).
 * Run after scripts/build-gas.mjs (or via that script).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GAS = path.join(ROOT, "gas");
const OUT_DIR = path.join(ROOT, "LHSCD Appscript");
const OUT_ZIP = path.join(ROOT, "LHSCD Appscript.zip");

function readGas(name) {
  return fs.readFileSync(path.join(GAS, name), "utf8");
}

function stripGeneratedComment(text) {
  return text.replace(/^<!-- Generated[\s\S]*?-->\n?/, "");
}

function stripOuterTag(html, tag) {
  const open = new RegExp(`^\\s*<${tag}>\\s*`, "i");
  const close = new RegExp(`\\s*</${tag}>\\s*$`, "i");
  return html.replace(open, "").replace(close, "");
}

/**
 * Inline gas/ HtmlService partials into one Index.html (no include() needed).
 */
function buildInlinedIndex() {
  let index = stripGeneratedComment(readGas("Index.html"));

  const styles = stripOuterTag(
    stripGeneratedComment(readGas("Styles.html")),
    "style"
  );
  const data = stripOuterTag(
    stripGeneratedComment(readGas("Data.html")),
    "script"
  );
  const schedules = stripOuterTag(
    stripGeneratedComment(readGas("Schedules.html")),
    "script"
  );
  const events = stripOuterTag(
    stripGeneratedComment(readGas("Events.html")),
    "script"
  );
  const clock = stripOuterTag(
    stripGeneratedComment(readGas("Clock.html")),
    "script"
  );

  index = index.replace(
    /<\?!=\s*include\('Styles'\);\s*\?>/,
    `<style>\n${styles}\n</style>`
  );
  index = index.replace(
    /<\?!=\s*include\('Data'\);\s*\?>\s*<\?!=\s*include\('Schedules'\);\s*\?>\s*<\?!=\s*include\('Events'\);\s*\?>\s*<\?!=\s*include\('Clock'\);\s*\?>/,
    `<script>\n${data}\n</script>\n<script>\n${schedules}\n</script>\n<script>\n${events}\n</script>\n<script>\n${clock}\n</script>`
  );

  if (index.includes("<?!=")) {
    throw new Error(
      "LHSCD Appscript Index still has template includes — rebuild gas/ first"
    );
  }

  return `<!-- LHSCD Appscript — paste into an Apps Script HTML file named Index -->
${index}`;
}

/**
 * Code.gs for the 2-file package (no include() helper).
 */
function buildCodeGs() {
  let code = readGas("Code.gs");

  // Swap template+include serve path for a single Index.html file.
  code = code.replace(
    /function doGet\(\) \{[\s\S]*?\n\}/,
    `function doGet() {
  var output = HtmlService.createHtmlOutputFromFile("Index");
  output.setTitle("Lisle Senior High School · Period Tracker");
  output.addMetaTag("viewport", "width=device-width, initial-scale=1");
  output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return output;
}`
  );

  // Drop include() — not used in the 2-file package.
  code = code.replace(
    /\/\*\*\s*\n \* Include another HTML file[\s\S]*?\nfunction include\(filename\) \{[\s\S]*?\n\}\n\n/,
    ""
  );

  code = code.replace(
    / \* Or from gas\/: clasp push && clasp deploy\n/,
    " * Or unzip \"LHSCD Appscript.zip\" and clasp push from that folder.\n"
  );

  return code;
}

function writeImportReadme() {
  return `LHSCD Appscript — import & deploy
================================

This folder is a complete Google Apps Script web app (2 files).
Send "LHSCD Appscript.zip" to someone — they do not need the rest of the repo.

A) Fastest import (script.google.com)
-------------------------------------
1. Open https://script.google.com → New project
2. Delete the default code; paste Code.gs into Code.gs
3. File → New → HTML file → name it exactly: Index
4. Paste Index.html into that file (replace the default <html> stub)
5. (Optional) Project Settings → show "appsscript.json" and paste appsscript.json
   Or set time zone to America/Chicago
6. Deploy → New deployment → Type: Web app
   - Execute as: Me
   - Who has access: Anyone
7. Authorize when prompted (UrlFetchApp reads the school calendar)
8. Open the web app URL

B) clasp (from this folder)
--------------------------
  npm i -g @google/clasp
  clasp login
  clasp create --type webapp --title "LHSCD Period Tracker"
  clasp push
  Then Deploy → Web app in the Apps Script editor (same settings as above)

Notes
-----
- Live school events need the deployed web app (UrlFetchApp). Opening Index.html
  in a browser alone will not load the live calendar.
- Preferences (lunch, theme, clock delay) stay in the visitor's browser localStorage.
- Rebuild this package from the LHSCD repo with:
    node scripts/build-gas.mjs
    node scripts/build-lhscd-appscript.mjs
`;
}

function main() {
  if (!fs.existsSync(path.join(GAS, "Index.html"))) {
    throw new Error("gas/ missing — run node scripts/build-gas.mjs first");
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = {
    "Code.gs": buildCodeGs(),
    "Index.html": buildInlinedIndex(),
    "appsscript.json": readGas("appsscript.json"),
    "IMPORT.txt": writeImportReadme(),
  };

  for (const [name, contents] of Object.entries(files)) {
    const dest = path.join(OUT_DIR, name);
    fs.writeFileSync(dest, contents);
    console.log(`wrote ${path.relative(ROOT, dest)} (${contents.length} bytes)`);
  }

  // Zip at repo root for easy sharing (space name + no-space alias)
  for (const zipName of ["LHSCD Appscript.zip", "LHSCD-Appscript.zip"]) {
    const zipPath = path.join(ROOT, zipName);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execFileSync("zip", ["-r", "-q", zipPath, "LHSCD Appscript"], {
      cwd: ROOT,
    });
    const zipStat = fs.statSync(zipPath);
    console.log(
      `wrote ${zipName} (${zipStat.size} bytes) — send this file to import`
    );
  }
}

main();
