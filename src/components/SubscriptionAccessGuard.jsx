import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CreditCard, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuthSession } from "../context/AuthSessionContext";
import { PlanAccessProvider } from "../context/PlanAccessContext";
import "./SubscriptionAccessGuard.css";

const ACCESS_CACHE_TTL_MS = 90_000;
const workspaceAccessCache = new Map();
const workspaceAccessRequests = new Map();

function readCachedAccess(userId) {
  if (!userId) return null;
  const cached = workspaceAccessCache.get(userId);
  if (!cached || cached.expiresAt <= Date.now()) {
    workspaceAccessCache.delete(userId);
    return null;
  }
  return cached.value;
}

function cacheAccess(userId, value) {
  if (!userId || value.state === "error" || value.state === "login") return value;
  workspaceAccessCache.set(userId, {
    value,
    expiresAt: Date.now() + ACCESS_CACHE_TTL_MS,
  });
  return value;
}

function canAccessWorkspace(subscription, now = Date.now()) {
  if (!subscription) return false;
  const startsAt = new Date(subscription.starts_at).getTime();
  if (!Number.isFinite(startsAt) || startsAt > now) return false;

  // Existing and approved pilot restaurants keep access without a scheduled expiry.
  if (
    subscription.plan_key === "pilot" &&
    subscription.status === "active" &&
    !subscription.ends_at
  ) {
    return true;
  }

  const endsAt = subscription.ends_at ? new Date(subscription.ends_at).getTime() : NaN;
  return (
    ["active", "trialing"].includes(subscription.status) &&
    Number.isFinite(endsAt) &&
    endsAt > now
  );
}

async function fetchWorkspaceAccess(userId) {
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  if (restaurantError) throw restaurantError;

  // Keep onboarding and empty-workspace states usable before a restaurant exists.
  if (!restaurant) return { state: "allowed", reason: "", subscription: null };

  const { data: subscription, error: subscriptionError } = await supabase
    .from("restaurant_subscriptions")
    .select("plan_key, status, starts_at, ends_at, subscription_plans(plan_key, name, features, limits)")
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;

  if (canAccessWorkspace(subscription)) {
    return { state: "allowed", reason: "", subscription };
  }

  const reason = !subscription
    ? "unassigned"
    : subscription.ends_at && new Date(subscription.ends_at).getTime() <= Date.now()
      ? "expired"
      : subscription.status || "inactive";
  return { state: "blocked", reason, subscription: subscription || null };
}

async function resolveWorkspaceAccess(userId, force = false) {
  if (!force) {
    const cached = readCachedAccess(userId);
    if (cached) return cached;
  }

  const pending = workspaceAccessRequests.get(userId);
  if (pending) return pending;

  const request = fetchWorkspaceAccess(userId)
    .then((value) => cacheAccess(userId, value))
    .finally(() => {
      if (workspaceAccessRequests.get(userId) === request) {
        workspaceAccessRequests.delete(userId);
      }
    });

  workspaceAccessRequests.set(userId, request);
  return request;
}

function getErrorMessage(error) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : "Subscription access could not be verified.";
}

export default function SubscriptionAccessGuard({ children }) {
  const {
    status: authStatus,
    userId,
    error: authError,
  } = useAuthSession();
  const [access, setAccess] = useState(
    () => readCachedAccess(userId) || { state: "loading", reason: "" },
  );
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function checkAccess(force = false) {
      if (authStatus === "checking") {
        if (mounted) setAccess({ state: "loading", reason: "" });
        return;
      }
      if (authStatus === "error") {
        if (mounted) setAccess({ state: "error", reason: authError || "Unable to verify login." });
        return;
      }
      if (authStatus !== "authenticated" || !userId) {
        if (mounted) setAccess({ state: "login", reason: "" });
        return;
      }

      const cached = !force ? readCachedAccess(userId) : null;
      if (cached) {
        if (mounted) setAccess(cached);
        return;
      }

      try {
        const result = await resolveWorkspaceAccess(userId, force);
        if (mounted) setAccess(result);
      } catch (error) {
        if (mounted) {
          setAccess({ state: "error", reason: getErrorMessage(error) });
        }
      }
    }

    checkAccess(retryKey > 0);
    // Revalidate periodically while a workspace is open, but share the result
    // across route remounts to avoid repeating sequential auth/DB requests per click.
    const intervalId = window.setInterval(() => checkAccess(true), 60_000);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [retryKey, userId, authStatus, authError]);

  if (access.state === "login" || authStatus === "unauthenticated") {
    return (
      <main className="subscription-guard-state">
        <ShieldCheck size={30} />
        <h1>Sign in to continue</h1>
        <p>Your restaurant workspace requires an authenticated account.</p>
        <Link to="/login" className="subscription-guard-primary">Sign in</Link>
      </main>
    );
  }

  if (access.state === "loading" || authStatus === "checking") {
    return (
      <main className="subscription-guard-state" role="status" aria-live="polite">
        <LoaderCircle size={30} className="subscription-guard-spinner" />
        <h1>Checking your Khaavio access</h1>
        <p>Verifying the restaurant subscription before opening this workspace.</p>
      </main>
    );
  }

  if (access.state === "error" || authStatus === "error") {
    return (
      <main className="subscription-guard-state">
        <AlertTriangle size={32} />
        <h1>We couldn’t verify subscription access</h1>
        <p>{access.reason || authError || "Please check your connection and try again."}</p>
        <button type="button" className="subscription-guard-primary" onClick={() => setRetryKey((key) => key + 1)}>
          <RefreshCw size={16} /> Try again
        </button>
        <Link to="/dashboard/subscription" className="subscription-guard-link">Open subscription & plans</Link>
      </main>
    );
  }

  if (access.state === "blocked") {
    const message = access.reason === "expired"
      ? "Your trial or subscription period has ended. Your restaurant data is kept safely; renew or request activation to restore workspace access."
      : access.reason === "cancelled"
        ? "This subscription is cancelled. Your restaurant data is preserved; contact Khaavio to reactivate access."
        : access.reason === "past_due"
          ? "Payment or renewal needs attention before workspace access can continue."
          : "No active plan is assigned to this restaurant yet. Choose a plan and contact Khaavio for manual activation.";

    return (
      <main className="subscription-guard-state subscription-guard-blocked">
        <div className="subscription-guard-icon"><CreditCard size={27} /></div>
        <span className="subscription-guard-eyebrow">ACCOUNT & BILLING</span>
        <h1>Subscription access required</h1>
        <p>{message}</p>
        <Link to="/dashboard/subscription" className="subscription-guard-primary">View plans and renew <CreditCard size={16} /></Link>
        <Link to="/" className="subscription-guard-link">Back to Khaavio</Link>
        <small>Orders and booking history are not deleted when access expires. Plan activation is currently handled manually.</small>
      </main>
    );
  }

  return (
    <PlanAccessProvider subscription={access.subscription}>
      {children}
    </PlanAccessProvider>
  );
}
