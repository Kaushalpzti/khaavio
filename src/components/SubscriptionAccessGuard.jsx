import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CreditCard, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "./SubscriptionAccessGuard.css";

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

export default function SubscriptionAccessGuard({ children }) {
  const [access, setAccess] = useState({ state: "loading", reason: "" });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          if (mounted) setAccess({ state: "login", reason: "" });
          return;
        }

        const { data: restaurant, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (restaurantError) throw restaurantError;

        // Keep onboarding and empty-workspace states usable before a restaurant exists.
        if (!restaurant) {
          if (mounted) setAccess({ state: "allowed", reason: "" });
          return;
        }

        const { data: subscription, error: subscriptionError } = await supabase
          .from("restaurant_subscriptions")
          .select("plan_key, status, starts_at, ends_at")
          .eq("restaurant_id", restaurant.id)
          .maybeSingle();
        if (subscriptionError) throw subscriptionError;

        if (!mounted) return;
        if (canAccessWorkspace(subscription)) {
          setAccess({ state: "allowed", reason: "" });
        } else {
          const reason = !subscription
            ? "unassigned"
            : subscription.ends_at && new Date(subscription.ends_at).getTime() <= Date.now()
              ? "expired"
              : subscription.status || "inactive";
          setAccess({ state: "blocked", reason });
        }
      } catch (error) {
        if (mounted) {
          setAccess({
            state: "error",
            reason: typeof error?.message === "string" ? error.message : "Subscription access could not be verified.",
          });
        }
      }
    }

    checkAccess();
    // Re-check active sessions periodically so a workspace is locked when its term expires.
    const intervalId = window.setInterval(checkAccess, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [retryKey]);

  if (access.state === "login") {
    return (
      <main className="subscription-guard-state">
        <ShieldCheck size={30} />
        <h1>Sign in to continue</h1>
        <p>Your restaurant workspace requires an authenticated account.</p>
        <Link to="/login" className="subscription-guard-primary">Sign in</Link>
      </main>
    );
  }

  if (access.state === "loading") {
    return (
      <main className="subscription-guard-state" role="status" aria-live="polite">
        <LoaderCircle size={30} className="subscription-guard-spinner" />
        <h1>Checking your Khaavio access</h1>
        <p>Verifying the restaurant subscription before opening this workspace.</p>
      </main>
    );
  }

  if (access.state === "error") {
    return (
      <main className="subscription-guard-state">
        <AlertTriangle size={32} />
        <h1>We couldn’t verify subscription access</h1>
        <p>{access.reason || "Please check your connection and try again."}</p>
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

  return children;
}
