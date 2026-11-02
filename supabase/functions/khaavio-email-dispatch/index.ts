import {
  constantTimeEqual,
  dbRequest,
  json,
  requiredEnv,
  sha256Hex,
} from "../_shared/razorpay.ts";

type TemplateKey =
  | "trial_started"
  | "subscription_activated"
  | "trial_ending_reminder"
  | "subscription_renewal_reminder"
  | "subscription_payment_issue"
  | "subscription_renewal_successful"
  | "subscription_cancelled"
  | "subscription_expired";

type OutboxRow = {
  id: string;
  event_key: string;
  template_key: TemplateKey;
  recipient_email: string;
  variables: Record<string, string | number | boolean | null>;
  attempt_count: number;
  lock_token: string;
};

const TEMPLATE_IDS: Record<TemplateKey, string> = {
  trial_started: "ff515b79-81a5-49b8-a9f0-b3285cff875b",
  subscription_activated: "10647559-15d7-4db0-a6a4-5503ad3bf809",
  trial_ending_reminder: "f3c88bed-1e40-467c-be45-1085fbd6edcb",
  subscription_renewal_reminder: "0310d27b-1739-4b54-a415-813208b3e501",
  subscription_payment_issue: "1fb9077b-7e6b-43d1-89d7-4572eeaca4fb",
  subscription_renewal_successful: "842362d0-39d6-4f2a-a00f-c35571c680ea",
  subscription_cancelled: "79cf3cb1-3bfb-4731-a89c-b63526a458ca",
  subscription_expired: "13037d3a-f80f-4799-b5ec-5f537ffbf0e5",
};

const FROM = "Khaavio <hello@khaavio.in>";
const REPLY_TO = "billing@khaavio.in";

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : "Unknown email delivery error";
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(21_600, 60 * 2 ** Math.max(0, attempt - 1));
}

function hasDispatchSecret(req: Request): boolean {
  const expected = requiredEnv("KHAAVIO_EMAIL_DISPATCH_SECRET");
  const provided = req.headers.get("x-khaavio-dispatch-secret")?.trim() ?? "";
  return constantTimeEqual(expected, provided);
}

async function finishRow(
  row: OutboxRow,
  success: boolean,
  resendEmailId: string | null,
  error: string | null,
): Promise<void> {
  await dbRequest("rpc/khaavio_finish_email_outbox", {
    method: "POST",
    body: {
      p_id: row.id,
      p_lock_token: row.lock_token,
      p_success: success,
      p_resend_email_id: resendEmailId,
      p_error: error,
      p_retry_after_seconds: retryDelaySeconds(row.attempt_count),
    },
  });
}

async function sendTemplateEmail(row: OutboxRow, resendApiKey: string): Promise<string> {
  const templateId = TEMPLATE_IDS[row.template_key];
  if (!templateId) throw new Error("Unknown Khaavio email template key");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + resendApiKey,
      "Content-Type": "application/json",
      // Stable per outbox event. Resend retains idempotency keys for 24 hours;
      // the database event_key remains the durable duplicate-prevention layer.
      "Idempotency-Key": "khaavio-" + await sha256Hex(row.event_key),
    },
    body: JSON.stringify({
      from: FROM,
      to: [row.recipient_email],
      reply_to: REPLY_TO,
      template: {
        id: templateId,
        variables: row.variables,
      },
    }),
  });

  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : {};
    const code = typeof error.name === "string"
      ? error.name
      : typeof error.code === "string"
        ? error.code
        : "HTTP_" + response.status;
    throw new Error("Resend request failed: " + code);
  }

  if (typeof payload.id !== "string" || !payload.id) {
    throw new Error("Resend accepted the request without returning an email ID");
  }

  return payload.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, x-khaavio-dispatch-secret",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    if (!hasDispatchSecret(req)) return json({ error: "UNAUTHORIZED" }, 401);

    const resendApiKey = requiredEnv("RESEND_API_KEY");

    // Expire subscriptions and queue calendar-based reminders before dispatch.
    const queued = await dbRequest<number>("rpc/khaavio_queue_due_platform_email_events", {
      method: "POST",
      body: {},
    });

    const rows = await dbRequest<OutboxRow[]>("rpc/khaavio_claim_email_outbox", {
      method: "POST",
      body: { p_limit: 25 },
    });

    let sent = 0;
    let failed = 0;

    for (const row of rows ?? []) {
      try {
        const resendEmailId = await sendTemplateEmail(row, resendApiKey);
        await finishRow(row, true, resendEmailId, null);
        sent += 1;
      } catch (error) {
        failed += 1;
        const message = errorText(error).slice(0, 500);
        console.error("Khaavio email delivery failed", {
          outboxId: row.id,
          templateKey: row.template_key,
          error: message,
        });

        try {
          await finishRow(row, false, null, message);
        } catch (finishError) {
          console.error("Could not release Khaavio email outbox lock", {
            outboxId: row.id,
            error: errorText(finishError).slice(0, 300),
          });
        }
      }
    }

    return json({
      ok: true,
      queued: typeof queued === "number" ? queued : 0,
      claimed: rows?.length ?? 0,
      sent,
      failed,
    });
  } catch (error) {
    const message = errorText(error);
    console.error("Khaavio email dispatcher failed:", message);
    return json({ error: "EMAIL_DISPATCH_FAILED" }, 500);
  }
});
