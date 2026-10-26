export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-razorpay-signature, x-razorpay-event-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

export type AppUser = { id: string; email?: string };
export type PlanKey = "starter" | "starter_yearly" | "growth" | "growth_yearly";
export type PlanConfiguration = {
  key: PlanKey;
  amountInr: number;
  interval: "monthly" | "yearly";
  envName: string;
};

export const BILLABLE_PLANS: Record<PlanKey, PlanConfiguration> = {
  starter: { key: "starter", amountInr: 499, interval: "monthly", envName: "RAZORPAY_PLAN_STARTER_MONTHLY" },
  starter_yearly: { key: "starter_yearly", amountInr: 4990, interval: "yearly", envName: "RAZORPAY_PLAN_STARTER_YEARLY" },
  growth: { key: "growth", amountInr: 899, interval: "monthly", envName: "RAZORPAY_PLAN_GROWTH_MONTHLY" },
  growth_yearly: { key: "growth_yearly", amountInr: 8990, interval: "yearly", envName: "RAZORPAY_PLAN_GROWTH_YEARLY" },
};

export function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function supabaseBaseUrl(): string {
  return requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
}

export function serviceKey(): string {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (direct) return direct;
  // Support newer key bundles where the service-role secret may be stored as JSON.
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS")?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.default === "string") return parsed.default;
      if (Array.isArray(parsed)) {
        const item = parsed.find((entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>).name === "service_role");
        if (item && typeof (item as Record<string, unknown>).api_key === "string") return String((item as Record<string, unknown>).api_key);
      }
    } catch { /* use the explicit configuration error below */ }
  }
  throw new Error("Missing Supabase service-role configuration.");
}

export async function authenticateUser(req: Request): Promise<AppUser | null> {
  const authorization = req.headers.get("authorization")?.trim();
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return null;
  const url = supabaseBaseUrl();
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim();
  if (!publicKey) throw new Error("Missing Supabase public API key configuration.");
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publicKey, Authorization: authorization },
  });
  if (!response.ok) return null;
  const user = await response.json() as Record<string, unknown>;
  if (typeof user.id !== "string") return null;
  return { id: user.id, email: typeof user.email === "string" ? user.email : undefined };
}

export async function dbRequest<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const base = supabaseBaseUrl();
  const key = serviceKey();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...init.headers,
  };
  const response = await fetch(`${base}/rest/v1/${path.replace(/^\/+/, "")}`, {
    method: init.method || "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) {
    const details = payload && typeof payload === "object" ? (payload as Record<string, unknown>).message : undefined;
    throw new Error(`Database request failed (${response.status})${typeof details === "string" ? `: ${details.slice(0, 180)}` : "."}`);
  }
  return payload as T;
}

export async function razorpayRequest<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const keyId = requiredEnv("RAZORPAY_KEY_ID");
  const secret = requiredEnv("RAZORPAY_KEY_SECRET");
  const basic = btoa(`${keyId}:${secret}`);
  const response = await fetch(`https://api.razorpay.com/v1/${path.replace(/^\/+/, "")}`, {
    method,
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text) {
    try { payload = JSON.parse(text) as Record<string, unknown>; } catch { payload = {}; }
  }
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
    const reason = typeof error.description === "string" ? error.description : `HTTP ${response.status}`;
    throw new Error(`Razorpay API request failed: ${method} /v1/${path.replace(/^\/+/, "")} returned HTTP ${response.status} (${typeof error.code === "string" ? error.code : "UNKNOWN"}): ${reason.slice(0, 180)}`);
  }
  return payload as T;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function fromUnixSeconds(value: unknown): string | null {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function addBillingInterval(startIso: string, interval: "monthly" | "yearly"): string {
  const date = new Date(startIso);
  if (interval === "yearly") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

export function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
}
