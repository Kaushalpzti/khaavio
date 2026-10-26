import {
  authenticateUser,
  constantTimeEqual,
  dbRequest,
  firstRow,
  hmacSha256Hex,
  json,
  razorpayRequest,
  requiredEnv,
} from "../_shared/razorpay.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const user = await authenticateUser(req);
    if (!user) return json({ error: "UNAUTHENTICATED", message: "Please sign in again." }, 401);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const attemptId = typeof body?.attempt_id === "string" ? body.attempt_id : "";
    const paymentId = typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
    const subscriptionId = typeof body?.razorpay_subscription_id === "string" ? body.razorpay_subscription_id : "";
    const signature = typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "";
    if (!/^[0-9a-f-]{36}$/i.test(attemptId) || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId) || !/^[a-f0-9]{64}$/i.test(signature)) {
      return json({ error: "INVALID_CHECKOUT_RESPONSE", message: "Razorpay returned an invalid checkout response." }, 400);
    }
    const attempts = await dbRequest<Array<Record<string, unknown>>>(
      `razorpay_subscription_attempts?id=eq.${encodeURIComponent(attemptId)}&created_by=eq.${encodeURIComponent(user.id)}&select=id,restaurant_id,plan_key,razorpay_plan_id,razorpay_subscription_id,status,created_by&limit=1`,
    );
    const attempt = attempts?.[0];
    if (!attempt || attempt.razorpay_subscription_id !== subscriptionId) {
      return json({ error: "ATTEMPT_NOT_FOUND", message: "This checkout does not match your account. Refresh the page or contact support." }, 404);
    }
    const expectedSignature = await hmacSha256Hex(requiredEnv("RAZORPAY_KEY_SECRET"), `${paymentId}|${attempt.razorpay_subscription_id}`);
    if (!constantTimeEqual(expectedSignature, signature.toLowerCase())) {
      return json({ error: "SIGNATURE_INVALID", message: "Razorpay signature verification failed. Access has not been changed." }, 400);
    }
    const razorpaySubscription = await razorpayRequest<Record<string, unknown>>("GET", `subscriptions/${encodeURIComponent(subscriptionId)}`);
    if (razorpaySubscription.id !== subscriptionId || razorpaySubscription.plan_id !== attempt.razorpay_plan_id) {
      return json({ error: "SUBSCRIPTION_MISMATCH", message: "The Razorpay subscription details did not match the original checkout." }, 400);
    }
    const currentStatus = String(attempt.status || "created");
    const nextStatus = currentStatus === "charged" || currentStatus === "authenticated" ? currentStatus : "signature_verified";
    await dbRequest(`razorpay_subscription_attempts?id=eq.${encodeURIComponent(attemptId)}`, {
      method: "PATCH",
      body: { razorpay_payment_id: paymentId, status: nextStatus, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    });
    const activeRows = await dbRequest<Array<{ status: string; plan_key: string; payment_provider: string; razorpay_subscription_id: string | null; ends_at: string | null }>>(
      `restaurant_subscriptions?restaurant_id=eq.${encodeURIComponent(String(attempt.restaurant_id))}&select=status,plan_key,payment_provider,razorpay_subscription_id,ends_at&limit=1`,
    );
    const active = activeRows?.[0];
    const accessActive = Boolean(active && active.status === "active" && active.payment_provider === "razorpay" && active.razorpay_subscription_id === subscriptionId && (!active.ends_at || Date.parse(active.ends_at) > Date.now()));
    return json({
      verified: true,
      access_active: accessActive,
      message: accessActive
        ? "Payment verified and the paid subscription is active."
        : "Checkout signature verified. Khaavio will enable paid access after Razorpay confirms the captured subscription charge by webhook.",
    });
  } catch (error) {
    console.error("Razorpay checkout verification failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "CHECKOUT_VERIFICATION_FAILED", message: "Could not verify this checkout. If your account was charged, do not pay again; contact Khaavio support." }, 502);
  }
});
