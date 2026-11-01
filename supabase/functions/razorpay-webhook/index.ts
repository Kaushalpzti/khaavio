import {
  addBillingInterval,
  BILLABLE_PLANS,
  constantTimeEqual,
  dbRequest,
  firstRow,
  fromUnixSeconds,
  hmacSha256Hex,
  json,
  requiredEnv,
  sha256Hex,
} from "../_shared/razorpay.ts";

type BillingAttempt = {
  id: string;
  restaurant_id: string;
  plan_key: keyof typeof BILLABLE_PLANS;
  razorpay_plan_id: string;
  razorpay_subscription_id: string | null;
  amount_inr: number | string;
  billing_interval: "monthly" | "yearly";
  status: string;
  created_at: string;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function dateForCharge(subscription: Record<string, unknown>, interval: "monthly" | "yearly") {
  const startIso = fromUnixSeconds(subscription.current_start) || new Date().toISOString();
  let endIso = fromUnixSeconds(subscription.current_end);
  if (!endIso || Date.parse(endIso) <= Date.parse(startIso)) endIso = addBillingInterval(startIso, interval);
  return { startIso, endIso };
}

function displayEmailDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}
async function setEventState(eventId: string, state: "processed" | "failed" | "ignored", errorMessage?: string) {
  await dbRequest(`razorpay_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: { processing_status: state, error_message: errorMessage ? errorMessage.slice(0, 240) : null, processed_at: new Date().toISOString() },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-razorpay-signature, x-razorpay-event-id", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let eventId = "";
  let eventRecorded = false;
  try {
    // Verify the exact raw bytes before parsing JSON; Razorpay signs the raw body.
    const rawBody = await req.text();
    if (!rawBody || rawBody.length > 1_000_000) return json({ error: "INVALID_WEBHOOK_BODY" }, 400);
    const providedSignature = req.headers.get("x-razorpay-signature")?.trim().toLowerCase() || "";
    const webhookSecret = requiredEnv("RAZORPAY_WEBHOOK_SECRET");
    const expectedSignature = await hmacSha256Hex(webhookSecret, rawBody);
    if (!constantTimeEqual(expectedSignature, providedSignature)) {
      console.warn("Rejected Razorpay webhook with an invalid signature.");
      return json({ error: "INVALID_WEBHOOK_SIGNATURE" }, 401);
    }
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const eventType = safeString(payload.event);
    eventId = req.headers.get("x-razorpay-event-id")?.trim() || await sha256Hex(rawBody);
    if (!eventType) return json({ error: "INVALID_WEBHOOK_EVENT" }, 400);

    const inserted = await dbRequest<unknown>("razorpay_webhook_events?on_conflict=event_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: [{ event_id: eventId, event_type: eventType, processing_status: "processing" }],
    });
    const newEvent = firstRow<Record<string, unknown>>(inserted);
    if (!newEvent) {
      const existingRows = await dbRequest<Array<{ processing_status: string; received_at: string }>>(
        `razorpay_webhook_events?event_id=eq.${encodeURIComponent(eventId)}&select=processing_status,received_at&limit=1`,
      );
      const existing = existingRows?.[0];
      if (existing?.processing_status === "processed" || existing?.processing_status === "ignored") return json({ ok: true, duplicate: true });
      if (existing?.processing_status === "processing" && Date.now() - Date.parse(existing.received_at) < 120_000) {
        // A concurrent delivery is still running. Return 500 so Razorpay can retry if it fails.
        return json({ error: "WEBHOOK_ALREADY_PROCESSING" }, 500);
      }
      await dbRequest(`razorpay_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, {
        method: "PATCH", body: { processing_status: "processing", error_message: null, received_at: new Date().toISOString(), processed_at: null },
      });
    }
    eventRecorded = true;

    const payloadMap = payload.payload && typeof payload.payload === "object" ? payload.payload as Record<string, unknown> : {};
    const subscriptionPayload = payloadMap.subscription && typeof payloadMap.subscription === "object" ? payloadMap.subscription as Record<string, unknown> : {};
    const paymentPayload = payloadMap.payment && typeof payloadMap.payment === "object" ? payloadMap.payment as Record<string, unknown> : {};
    const subscription = subscriptionPayload.entity && typeof subscriptionPayload.entity === "object" ? subscriptionPayload.entity as Record<string, unknown> : {};
    const payment = paymentPayload.entity && typeof paymentPayload.entity === "object" ? paymentPayload.entity as Record<string, unknown> : {};
    const subscriptionId = safeString(subscription.id);

    const knownEvents = new Set([
      "subscription.authenticated", "subscription.activated", "subscription.charged",
      "subscription.pending", "subscription.halted", "subscription.cancelled", "subscription.completed",
    ]);
    if (!knownEvents.has(eventType)) {
      await setEventState(eventId, "ignored");
      return json({ ok: true, ignored: true });
    }
    if (!subscriptionId) throw new Error("Subscription webhook did not contain a subscription ID.");

    const attempts = await dbRequest<BillingAttempt[]>(
      `razorpay_subscription_attempts?razorpay_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id,restaurant_id,plan_key,razorpay_plan_id,razorpay_subscription_id,amount_inr,billing_interval,status,created_at&limit=1`,
    );
    const attempt = attempts?.[0];
    if (!attempt) {
      // Could be a subscription created outside Khaavio. Acknowledge it without granting access.
      await setEventState(eventId, "ignored");
      return json({ ok: true, ignored: true });
    }

    const latestAttempts = await dbRequest<Array<{ id: string }>>(
      `razorpay_subscription_attempts?restaurant_id=eq.${encodeURIComponent(attempt.restaurant_id)}&select=id&order=created_at.desc&limit=1`,
    );
    if (latestAttempts?.[0]?.id !== attempt.id) {
      await setEventState(eventId, "ignored");
      return json({ ok: true, ignored: true, stale_attempt: true });
    }

    if (subscription.plan_id !== attempt.razorpay_plan_id) throw new Error("Webhook plan ID does not match the stored checkout attempt.");

    if (eventType === "subscription.authenticated" || eventType === "subscription.activated") {
      if (attempt.status !== "charged") {
        await dbRequest(`razorpay_subscription_attempts?id=eq.${encodeURIComponent(attempt.id)}`, {
          method: "PATCH", body: { status: "authenticated", updated_at: new Date().toISOString() },
        });
      }
      // Authentication/mandate authorization alone is not proof of a captured plan payment.
    } else if (eventType === "subscription.charged") {
      const paymentId = safeString(payment.id);
      const paymentStatus = safeString(payment.status);
      const amountPaise = Number(payment.amount);
      const expectedPaise = Math.round(Number(attempt.amount_inr) * 100);
      if (!paymentId || paymentStatus !== "captured" || safeString(payment.currency) !== "INR" || amountPaise !== expectedPaise) {
        throw new Error("Charged event did not contain a captured INR payment for the exact configured plan amount.");
      }
      const paymentInsert = await dbRequest<unknown>("razorpay_subscription_payments?on_conflict=razorpay_payment_id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: [{
          razorpay_payment_id: paymentId,
          attempt_id: attempt.id,
          restaurant_id: attempt.restaurant_id,
          plan_key: attempt.plan_key,
          amount_paise: amountPaise,
          currency: "INR",
          payment_status: "captured",
          webhook_event_id: eventId,
          paid_at: fromUnixSeconds(payment.created_at) || new Date().toISOString(),
        }],
      });
      // If insert is a duplicate, the previous delivery already recorded this payment; the
      // subscription upsert below remains idempotent because it writes the same cycle dates.
      void paymentInsert;
      const dates = dateForCharge(subscription, attempt.billing_interval);
      const subscriptionRow = {
        restaurant_id: attempt.restaurant_id,
        plan_key: attempt.plan_key,
        status: "active",
        starts_at: dates.startIso,
        ends_at: dates.endIso,
        payment_provider: "razorpay",
        razorpay_subscription_id: subscriptionId,
        razorpay_payment_id: paymentId,
        razorpay_attempt_id: attempt.id,
        cancel_at_period_end: subscription.cancel_at_cycle_end === true,
        updated_at: new Date().toISOString(),
      };
      await dbRequest("restaurant_subscriptions?on_conflict=restaurant_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: [subscriptionRow],
      });
      await dbRequest(`razorpay_subscription_attempts?id=eq.${encodeURIComponent(attempt.id)}`, {
        method: "PATCH", body: { status: "charged", razorpay_payment_id: paymentId, updated_at: new Date().toISOString() },
      });

      // Queue the platform email only after the captured INR payment has been
      // recorded and the subscription access row has been updated. The first
      // captured payment for this billing attempt gets the activation template;
      // later captured payments get the renewal-success template. Looking up
      // the earliest payment keeps the choice stable if Razorpay retries after
      // a partial webhook failure.
      const earliestPayments = await dbRequest<Array<{ razorpay_payment_id: string }>>(
        `razorpay_subscription_payments?attempt_id=eq.${encodeURIComponent(attempt.id)}&select=razorpay_payment_id&order=paid_at.asc,created_at.asc&limit=1`,
      );
      const isInitialCharge = earliestPayments?.[0]?.razorpay_payment_id === paymentId;
      const catalogPlans = await dbRequest<Array<{ name: string; billing_interval: string | null }>>(
        `subscription_plans?plan_key=eq.${encodeURIComponent(attempt.plan_key)}&select=name,billing_interval&limit=1`,
      );
      const planName = catalogPlans?.[0]?.name || attempt.plan_key;
      const billingInterval = attempt.billing_interval === "yearly" ? "Yearly" : "Monthly";
      const amountLabel = `₹${(amountPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
      const paymentDateIso = fromUnixSeconds(payment.created_at) || new Date().toISOString();
      const emailVariables: Record<string, string> = {
        PLAN_NAME: planName,
        BILLING_INTERVAL: billingInterval,
        AMOUNT: amountLabel,
        PAYMENT_DATE: displayEmailDate(paymentDateIso),
        PAYMENT_ID: paymentId,
      };
      if (isInitialCharge) {
        emailVariables.PERIOD_START_DATE = displayEmailDate(dates.startIso);
        emailVariables.PERIOD_END_DATE = displayEmailDate(dates.endIso);
      } else {
        emailVariables.NEXT_RENEWAL_DATE = displayEmailDate(dates.endIso);
      }

      await dbRequest("rpc/khaavio_enqueue_platform_email", {
        method: "POST",
        body: {
          p_event_key: `subscription-charge:${paymentId}`,
          p_template_key: isInitialCharge ? "subscription_activated" : "subscription_renewal_successful",
          p_restaurant_id: attempt.restaurant_id,
          p_variables: emailVariables,
        },
      });
    } else if (eventType === "subscription.pending" || eventType === "subscription.halted") {
      const currentRows = await dbRequest<Array<{ razorpay_subscription_id: string | null }>>(
        `restaurant_subscriptions?restaurant_id=eq.${encodeURIComponent(attempt.restaurant_id)}&select=razorpay_subscription_id&limit=1`,
      );
      if (currentRows?.[0]?.razorpay_subscription_id === subscriptionId) {
        await dbRequest(`restaurant_subscriptions?restaurant_id=eq.${encodeURIComponent(attempt.restaurant_id)}&razorpay_subscription_id=eq.${encodeURIComponent(subscriptionId)}`, {
          method: "PATCH", body: { status: "past_due", updated_at: new Date().toISOString() },
        });
      } else if (attempt.status !== "charged") {
        await dbRequest(`razorpay_subscription_attempts?id=eq.${encodeURIComponent(attempt.id)}`, {
          method: "PATCH", body: { status: "failed", updated_at: new Date().toISOString() },
        });
      }
    } else if (eventType === "subscription.cancelled") {
      const currentRows = await dbRequest<Array<{ razorpay_subscription_id: string | null; ends_at: string | null }>>(
        `restaurant_subscriptions?restaurant_id=eq.${encodeURIComponent(attempt.restaurant_id)}&select=razorpay_subscription_id,ends_at&limit=1`,
      );
      const current = currentRows?.[0];
      if (current?.razorpay_subscription_id === subscriptionId) {
        const keepThroughPeriod = subscription.cancel_at_cycle_end === true && current.ends_at && Date.parse(current.ends_at) > Date.now();
        await dbRequest(`restaurant_subscriptions?restaurant_id=eq.${encodeURIComponent(attempt.restaurant_id)}&razorpay_subscription_id=eq.${encodeURIComponent(subscriptionId)}`, {
          method: "PATCH", body: { status: keepThroughPeriod ? "active" : "cancelled", cancel_at_period_end: Boolean(subscription.cancel_at_cycle_end), updated_at: new Date().toISOString() },
        });
      }
      await dbRequest(`razorpay_subscription_attempts?id=eq.${encodeURIComponent(attempt.id)}`, {
        method: "PATCH", body: { status: "cancelled", updated_at: new Date().toISOString() },
      });
    } else if (eventType === "subscription.completed") {
      await dbRequest(`restaurant_subscriptions?restaurant_id=eq.${encodeURIComponent(attempt.restaurant_id)}&razorpay_subscription_id=eq.${encodeURIComponent(subscriptionId)}`, {
        method: "PATCH", body: { status: "expired", cancel_at_period_end: false, updated_at: new Date().toISOString() },
      });
      await dbRequest(`razorpay_subscription_attempts?id=eq.${encodeURIComponent(attempt.id)}`, {
        method: "PATCH", body: { status: "expired", updated_at: new Date().toISOString() },
      });
    }

    await setEventState(eventId, "processed");
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook processing error";
    console.error("Razorpay webhook processing failed:", message);
    if (eventRecorded && eventId) {
      try { await setEventState(eventId, "failed", message); } catch { /* Razorpay retry remains the recovery path. */ }
    }
    // Return non-2xx so Razorpay can retry after transient database/provider failures.
    return json({ error: "WEBHOOK_PROCESSING_FAILED" }, 500);
  }
});
