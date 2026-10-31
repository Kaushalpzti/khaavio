const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const rawBody = await req.text();
  if (!rawBody || rawBody.length > 8_192) return json({ error: "INVALID_REQUEST" }, 400);
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); }
  catch { return json({ error: "INVALID_JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "INVALID_REQUEST" }, 400);

  // Silent success for bots that fill the off-screen honeypot.
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });

  const slug = typeof body.restaurantSlug === "string" ? body.restaurantSlug.trim() : "";
  const rating = Number(body.rating);
  const category = typeof body.category === "string" ? body.category.trim().toLowerCase() : "other";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!/^[a-z0-9][a-z0-9-]{0,159}$/i.test(slug)) return json({ error: "INVALID_RESTAURANT" }, 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "INVALID_RATING" }, 400);
  if (!["food", "service", "ambience", "other"].includes(category)) return json({ error: "INVALID_CATEGORY" }, 400);
  if (message.length > 1000) return json({ error: "MESSAGE_TOO_LONG" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "FEEDBACK_NOT_CONFIGURED", message: "Feedback is temporarily unavailable. Please contact the restaurant team." }, 503);

  // Supabase's edge gateway supplies CF-Connecting-IP. Never accept a browser
  // supplied X-Forwarded-For value as the identity for a public write limit.
  const clientIp = req.headers.get("cf-connecting-ip")?.trim() || "missing-trusted-client-ip";
  const ipHash = await hmacSha256Hex(serviceRoleKey, "khaavio-public-feedback:v1:" + clientIp.slice(0, 64));
  try {
    const response = await fetch(supabaseUrl + "/rest/v1/rpc/submit_public_restaurant_feedback_rate_limited", {
      method: "POST",
      headers: { apikey: serviceRoleKey, Authorization: "Bearer " + serviceRoleKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_restaurant_slug: slug, p_rating: rating, p_category: category, p_message: message || null, p_ip_hash: ipHash }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      if (details?.code === "54000") return json({ error: "RATE_LIMITED", message: "Too many feedback notes were sent from this connection. Please try again in a few minutes." }, 429);
      console.error("Public feedback database request failed:", response.status, details?.code || "unknown");
      return json({ error: "FEEDBACK_SUBMISSION_FAILED", message: "We couldn't send your feedback right now. Please try again later." }, 503);
    }
    return json({ ok: true }, 201);
  } catch (error) {
    console.error("Public feedback request failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "FEEDBACK_SUBMISSION_FAILED", message: "We couldn't send your feedback right now. Please try again later." }, 503);
  }
});
