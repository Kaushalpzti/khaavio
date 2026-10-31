import { createHmac } from "node:crypto";

const MAX_BODY_BYTES = 12_000;
const RATE_LIMIT = 4;
const RATE_WINDOW_SECONDS = 60;

function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function getBody(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

function safeText(value, max) {
  if (typeof value !== "string") return "";
  const cleaned = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");
  return cleaned.trim().slice(0, max);
}

function originAllowed(origin) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "khaavio.in" || host === "www.khaavio.in" ||
      host === "app.khaavio.in" || host.endsWith(".vercel.app")
    ) || (url.protocol === "http:" && (host === "localhost" || host === "127.0.0.1"));
  } catch {
    return false;
  }
}

function clientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",").pop().trim();
  return req.socket?.remoteAddress || "";
}

async function consumeRateLimit(baseUrl, serviceKey, ip) {
  const keyHash = createHmac("sha256", serviceKey).update("khaavio-leads:v1:" + ip).digest("hex");
  const response = await fetch(baseUrl + "/rest/v1/rpc/consume_khaavio_ai_rate_limit", {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_key_hash: keyHash, p_limit: RATE_LIMIT, p_window_seconds: RATE_WINDOW_SECONDS }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error("Rate limiter unavailable");
  const result = await response.json();
  const row = Array.isArray(result) ? result[0] : result;
  if (!row || typeof row.allowed !== "boolean") throw new Error("Rate limiter response invalid");
  return row.allowed;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { error: "METHOD_NOT_ALLOWED" });
  }
  if (!originAllowed(req.headers.origin)) return respond(res, 403, { error: "ORIGIN_NOT_ALLOWED" });

  const body = getBody(req);
  if (!body || Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_BODY_BYTES) {
    return respond(res, 400, { error: "INVALID_REQUEST" });
  }

  // Honeypot: acknowledge silently, but never store a bot-filled form.
  if (safeText(body.website, 200)) return respond(res, 201, { ok: true });

  const leadType = body.type === "demo" ? "demo" : body.type === "contact" ? "contact" : "";
  const fullName = safeText(body.name, 100);
  const phone = safeText(body.phone, 24);
  const businessName = safeText(body.business, 120);
  const businessType = safeText(body.businessType, 80);
  const city = safeText(body.city, 100);
  const email = safeText(body.email, 254).toLowerCase();
  const preferredTime = safeText(body.preferredTime, 80);
  const enquiryType = safeText(body.enquiryType, 80);
  const message = safeText(body.message, 2000);

  if (!leadType || fullName.length < 2 || !/^[+0-9() .-]{8,24}$/.test(phone) ||
      businessName.length < 2 || businessType.length < 2 || city.length < 2) {
    return respond(res, 400, { error: "REQUIRED_FIELDS_MISSING", message: "Please check the required fields and try again." });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond(res, 400, { error: "INVALID_EMAIL", message: "Enter a valid email address." });
  }
  if (leadType === "contact" && (!enquiryType || message.length < 2)) {
    return respond(res, 400, { error: "MESSAGE_REQUIRED", message: "Please add your enquiry type and message." });
  }

  const baseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceKey) {
    console.error("Lead capture is not configured: missing server-side Supabase credentials.");
    return respond(res, 503, { error: "LEAD_CAPTURE_UNAVAILABLE", message: "Enquiries are temporarily unavailable. Please email Khaavio support." });
  }

  const ip = clientIp(req);
  if (!ip) return respond(res, 503, { error: "RATE_LIMIT_UNAVAILABLE" });
  try {
    const allowed = await consumeRateLimit(baseUrl, serviceKey, ip);
    if (!allowed) return respond(res, 429, { error: "RATE_LIMITED", message: "Too many requests. Please try again in a minute." });

    const insert = await fetch(baseUrl + "/rest/v1/platform_contact_leads", {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify([{
        lead_type: leadType,
        full_name: fullName,
        phone,
        business_name: businessName,
        business_type: businessType,
        city,
        email: email || null,
        preferred_time: preferredTime || null,
        enquiry_type: enquiryType || null,
        message: message || null,
        source: "khaavio_website",
      }]),
      signal: AbortSignal.timeout(5000),
    });
    if (!insert.ok) {
      const detail = await insert.text();
      console.error("Lead insert failed:", insert.status, detail.slice(0, 200));
      return respond(res, 502, { error: "LEAD_SAVE_FAILED", message: "We couldn't save your enquiry. Please try again." });
    }
    return respond(res, 201, { ok: true });
  } catch (error) {
    console.error("Lead capture failed:", error instanceof Error ? error.message : "unknown error");
    return respond(res, 503, { error: "LEAD_CAPTURE_UNAVAILABLE", message: "Enquiries are temporarily unavailable. Please try again shortly." });
  }
}
