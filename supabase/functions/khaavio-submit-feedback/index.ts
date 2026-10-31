const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function respond(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error("Missing server configuration: " + name);
  return value;
}

async function rateKey(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("khaavio-public-feedback:v1:" + ip));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function consumeLimit(url: string, key: string, serviceKey: string) {
  const response = await fetch(url + "/rest/v1/rpc/consume_khaavio_ai_rate_limit", {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_key_hash: key, p_limit: 5, p_window_seconds: 60 }),
  });
  if (!response.ok) throw new Error("Rate limiter unavailable");
  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row.allowed !== "boolean") throw new Error("Invalid rate limiter response");
  return row.allowed as boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const rawBody = await req.text();
    if (!rawBody || rawBody.length > 8_000) return respond({ error: "INVALID_REQUEST" }, 400);
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) return respond({ error: "INVALID_REQUEST" }, 400);

    // A filled honeypot is acknowledged without creating a feedback record.
    if (typeof body.website === "string" && body.website.trim()) return respond({ ok: true });

    const slug = typeof body.restaurantSlug === "string" ? body.restaurantSlug.trim() : "";
    const rating = Number(body.rating);
    const category = typeof body.category === "string" ? body.category.trim().toLowerCase() : "other";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!/^[a-z0-9][a-z0-9-]{0,159}$/i.test(slug) || !Number.isInteger(rating) || rating < 1 || rating > 5 ||
        !["food", "service", "ambience", "other"].includes(category) || message.length > 1000) {
      return respond({ error: "INVALID_FEEDBACK", message: "Please check your rating and feedback, then try again." }, 400);
    }

    const baseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const clientIp = req.headers.get("cf-connecting-ip")?.trim();
    // If the trusted edge IP is missing, all such requests share one bucket: fail closed.
    const identity = clientIp && clientIp.length <= 64 ? clientIp.toLowerCase() : "missing-trusted-client-ip";
    const allowed = await consumeLimit(baseUrl, await rateKey(identity, serviceKey), serviceKey);
    if (!allowed) return respond({ error: "RATE_LIMITED", message: "Too many feedback submissions. Please wait a minute and try again." }, 429);

    const response = await fetch(baseUrl + "/rest/v1/rpc/submit_restaurant_feedback", {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_restaurant_slug: slug,
        p_rating: rating,
        p_category: category,
        p_message: message || null,
      }),
    });
    if (!response.ok) {
      console.error("Feedback database write failed:", response.status, (await response.text()).slice(0, 180));
      return respond({ error: "FEEDBACK_SAVE_FAILED", message: "We couldn't send your feedback right now. Please try again." }, 502);
    }
    return respond({ ok: true });
  } catch (error) {
    console.error("Public feedback submission failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "FEEDBACK_TEMPORARILY_UNAVAILABLE", message: "Feedback is temporarily unavailable. Please try again shortly." }, 503);
  }
});
