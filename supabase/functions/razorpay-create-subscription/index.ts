import {
  authenticateUser,
  BILLABLE_PLANS,
  dbRequest,
  firstRow,
  json,
  razorpayRequest,
  requiredEnv,
  type PlanKey,
} from "../_shared/razorpay.ts";

function getPlanKey(value: unknown): PlanKey | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BILLABLE_PLANS, value)
    ? value as PlanKey
    : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const user = await authenticateUser(req);
    if (!user) return json({ error: "UNAUTHENTICATED", message: "Please sign in again before subscribing." }, 401);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const planKey = getPlanKey(body?.plan_key);
    if (!planKey) return json({ error: "INVALID_PLAN", message: "Choose a valid Starter or Growth billing plan." }, 400);
    const planConfig = BILLABLE_PLANS[planKey];
    const razorpayPlanId = requiredEnv(planConfig.envName);
    // Fail closed if a secret was accidentally configured with a plan from another mode/account.
    const plan = await razorpayRequest<Record<string, unknown>>("GET", `plans/${encodeURIComponent(razorpayPlanId)}`);
    const item = plan.item && typeof plan.item === "object" ? plan.item as Record<string, unknown> : {};
    if (
      plan.id !== razorpayPlanId ||
      item.currency !== "INR" ||
      Number(item.amount) !== planConfig.amountInr * 100 ||
      plan.period !== planConfig.interval ||
      Number(plan.interval) !== 1
    ) {
      console.error("Configured Razorpay plan does not match the expected Khaavio plan.", planKey);
      return json({ error: "PLAN_CONFIGURATION_MISMATCH", message: "This billing plan is not configured correctly. Please contact Khaavio support." }, 503);
    }

    const encodedUserId = encodeURIComponent(user.id);
    const restaurants = await dbRequest<Array<{ id: string; name: string; slug?: string }>>(
      `restaurants?owner_id=eq.${encodedUserId}&select=id,name,slug&limit=2`,
    );
    if (!Array.isArray(restaurants) || restaurants.length !== 1) {
      return json({ error: "RESTAURANT_NOT_FOUND", message: "A single restaurant owned by your account is required before subscribing." }, 404);
    }
    const restaurant = restaurants[0];

    const planRows = await dbRequest<Array<{ plan_key: string; price_inr: number | string | null; billing_interval: string; is_active: boolean }>>(
      `subscription_plans?plan_key=eq.${encodeURIComponent(planKey)}&is_active=eq.true&select=plan_key,price_inr,billing_interval,is_active&limit=1`,
    );
    const catalogPlan = planRows?.[0];
    if (!catalogPlan || catalogPlan.billing_interval !== planConfig.interval || Math.round(Number(catalogPlan.price_inr) * 100) !== planConfig.amountInr * 100) {
      console.error("Khaavio subscription catalog is out of sync with the configured Razorpay plan.", planKey);
      return json({ error: "CATALOG_CONFIGURATION_MISMATCH", message: "The displayed price and payment plan do not match. Please contact Khaavio support." }, 503);
    }

    const currentRows = await dbRequest<Array<{ status: string; plan_key: string; payment_provider?: string; ends_at?: string | null; razorpay_subscription_id?: string | null }>>(
      `restaurant_subscriptions?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&select=status,plan_key,payment_provider,ends_at,razorpay_subscription_id&limit=1`,
    );
    const current = currentRows?.[0];
    if (current?.payment_provider === "razorpay" && ["active", "past_due"].includes(current.status) && current.razorpay_subscription_id && (!current.ends_at || Date.parse(current.ends_at) > Date.now())) {
      return json({ error: "SUBSCRIPTION_ALREADY_ACTIVE", message: "Your paid subscription is already active. Contact Khaavio support before changing plans; switching an active paid subscription is not automated yet." }, 409);
    }

    // Expire abandoned checkout attempts after 15 minutes. Cancel their uncharged Razorpay
    // subscriptions best-effort before allowing a new attempt for this restaurant.
    const openAttempts = await dbRequest<Array<{ id: string; status: string; created_at: string; razorpay_subscription_id?: string | null }>>(
      `razorpay_subscription_attempts?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&status=in.(creating,created,signature_verified,authenticated)&select=id,status,created_at,razorpay_subscription_id&order=created_at.desc`,
    );
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const old of openAttempts || []) {
      if (Date.parse(old.created_at) > cutoff) {
        return json({ error: "CHECKOUT_ALREADY_PENDING", message: "A checkout was started recently for this restaurant. Finish it or close it; if it was abandoned, wait up to 15 minutes and try again." }, 409);
      }
      if (old.razorpay_subscription_id) {
        try {
          await razorpayRequest("POST", `subscriptions/${encodeURIComponent(old.razorpay_subscription_id)}/cancel`, { cancel_at_cycle_end: false });
        } catch (cancelError) {
          console.warn("Could not cancel an abandoned uncharged subscription; continuing with expired local attempt.", cancelError instanceof Error ? cancelError.message : "unknown error");
        }
      }
      await dbRequest(`razorpay_subscription_attempts?id=eq.${encodeURIComponent(old.id)}`, {
        method: "PATCH", body: { status: "expired", updated_at: new Date().toISOString() },
      });
    }

    const attemptPayload = await dbRequest<unknown>("razorpay_subscription_attempts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: [{
        restaurant_id: restaurant.id,
        created_by: user.id,
        plan_key: planKey,
        razorpay_plan_id: razorpayPlanId,
        amount_inr: planConfig.amountInr,
        billing_interval: planConfig.interval,
        status: "creating",
      }],
    });
    const attempt = firstRow<{ id: string }>(attemptPayload);
    if (!attempt?.id) throw new Error("Could not create a local payment attempt.");

    try {
      const totalCount = planConfig.interval === "monthly" ? 120 : 10;
      const created = await razorpayRequest<Record<string, unknown>>("POST", "subscriptions", {
        plan_id: razorpayPlanId,
        quantity: 1,
        customer_notify: false,
        total_count: totalCount,
        notes: {
          khaavio_attempt_id: attempt.id,
          khaavio_restaurant_id: restaurant.id,
          khaavio_plan_key: planKey,
        },
      });
      if (typeof created.id !== "string" || !created.id.startsWith("sub_")) throw new Error("Razorpay did not return a valid subscription ID.");
      await dbRequest(`razorpay_subscription_attempts?id=eq.${encodeURIComponent(attempt.id)}`, {
        method: "PATCH",
        body: { razorpay_subscription_id: created.id, status: "created", updated_at: new Date().toISOString() },
      });
      return json({
        attempt_id: attempt.id,
        subscription_id: created.id,
        key_id: requiredEnv("RAZORPAY_KEY_ID"),
        customer_email: user.email || "",
        restaurant_name: restaurant.name || "Your restaurant",
        plan_key: planKey,
      }, 200);
    } catch (createError) {
      await dbRequest(`razorpay_subscription_attempts?id=eq.${encodeURIComponent(attempt.id)}`, {
        method: "PATCH", body: { status: "failed", updated_at: new Date().toISOString() },
      }).catch(() => null);
      throw createError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Missing server configuration") || message.includes("Missing Supabase")) {
      console.error(message);
      return json({ error: "BILLING_NOT_CONFIGURED", message: "Online payments are not configured yet. Please contact Khaavio support." }, 503);
    }
    console.error("Razorpay subscription creation failed:", message);
    return json({ error: "SUBSCRIPTION_CREATION_FAILED", message: message.startsWith("Razorpay API request failed:") ? message : "Could not start checkout. Please try again or contact Khaavio support." }, 502);
  }
});
