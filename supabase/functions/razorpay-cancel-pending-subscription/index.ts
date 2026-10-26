import { authenticateUser, dbRequest, json, razorpayRequest } from "../_shared/razorpay.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const user = await authenticateUser(req);
    if (!user) return json({ error: "UNAUTHENTICATED" }, 401);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const attemptId = typeof body?.attempt_id === "string" ? body.attempt_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) return json({ error: "INVALID_ATTEMPT_ID" }, 400);
    const attempts = await dbRequest<Array<Record<string, unknown>>>(
      `razorpay_subscription_attempts?id=eq.${encodeURIComponent(attemptId)}&created_by=eq.${encodeURIComponent(user.id)}&select=id,restaurant_id,status,razorpay_subscription_id&limit=1`,
    );
    const attempt = attempts?.[0];
    if (!attempt) return json({ error: "ATTEMPT_NOT_FOUND" }, 404);
    if (attempt.status === "charged") return json({ cancelled: false, message: "A payment was already confirmed; this subscription was not cancelled by checkout dismissal." }, 409);
    if (["cancelled", "expired", "failed"].includes(String(attempt.status))) return json({ cancelled: true, already_closed: true });
    if (attempt.razorpay_subscription_id) {
      await razorpayRequest("POST", `subscriptions/${encodeURIComponent(String(attempt.razorpay_subscription_id))}/cancel`, { cancel_at_cycle_end: false });
    }
    await dbRequest(`razorpay_subscription_attempts?id=eq.${encodeURIComponent(attemptId)}`, {
      method: "PATCH", body: { status: "cancelled", updated_at: new Date().toISOString() },
    });
    return json({ cancelled: true });
  } catch (error) {
    console.warn("Could not clean up a dismissed Razorpay checkout:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "CHECKOUT_CANCELLATION_FAILED", message: "Checkout was closed, but the unfinished Razorpay session could not be cancelled automatically. Please wait a few minutes before retrying." }, 502);
  }
});
