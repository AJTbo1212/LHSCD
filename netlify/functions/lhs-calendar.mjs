/**
 * Netlify Function: proxy Lisle High calendar HTML (avoids browser CORS).
 * GET /.netlify/functions/lhs-calendar?date=YYYY-MM-DD
 * Also available as /api/lhs-calendar via netlify.toml redirect.
 */

const LHS_ELEMENT =
  "https://www.lisle202.org/fs/elements/4419?is_ajax=true&cal_date=";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const date =
    event.queryStringParameters?.date ||
    new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { statusCode: 400, body: "Invalid date" };
  }

  try {
    const upstream = LHS_ELEMENT + encodeURIComponent(date);
    const res = await fetch(upstream, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LHSPeriodTracker/1.0; +netlify)",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "text/html, */*",
      },
    });
    const text = await res.text();
    return {
      statusCode: res.ok ? 200 : res.status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: `Upstream fetch failed: ${err.message || err}`,
    };
  }
}
