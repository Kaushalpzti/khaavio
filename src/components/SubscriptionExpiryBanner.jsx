import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock3 } from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import "./SubscriptionExpiryBanner.css";

const DAY_MS = 24 * 60 * 60 * 1000;
const NEAR_WHOLE_DAY_TOLERANCE = (5 * 60 * 1000) / DAY_MS;

function daysRemaining(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;

  const difference = timestamp - Date.now();
  if (difference <= 0) return 0;

  const exactDays = difference / DAY_MS;
  const nearestWholeDay = Math.round(exactDays);

  // Avoid briefly showing 8 days immediately after a 7-day trial is assigned.
  if (Math.abs(exactDays - nearestWholeDay) <= NEAR_WHOLE_DAY_TOLERANCE) {
    return Math.max(0, nearestWholeDay);
  }

  return Math.max(0, Math.ceil(exactDays));
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "the listed end date";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getReminder(subscription) {
  const status = String(subscription?.status || "").toLowerCase();
  const planKey = String(subscription?.plan_key || "").toLowerCase();
  const endDate = subscription?.ends_at;
  const isTrial = planKey === "trial" || status === "trialing";

  if (status === "past_due") {
    return {
      tone: "urgent",
      Icon: AlertTriangle,
      title: "Your subscription needs attention",
      message: "Review your plan and contact Khaavio before access is interrupted.",
    };
  }

  if (status === "expired") {
    return {
      tone: "urgent",
      Icon: AlertTriangle,
      title: "Your Khaavio access has ended",
      message: "Open Subscription & Plans to review the available plans and next steps.",
    };
  }

  if (!endDate) {
    if (status === "cancelled") {
      return {
        tone: "urgent",
        Icon: AlertTriangle,
        title: "Your subscription is cancelled",
        message: "Open Subscription & Plans to review your access and next steps.",
      };
    }
    return null;
  }

  const endTimestamp = new Date(endDate).getTime();
  if (!Number.isFinite(endTimestamp)) return null;

  if (endTimestamp <= Date.now() && ["active", "trialing", "cancelled"].includes(status)) {
    return {
      tone: "urgent",
      Icon: AlertTriangle,
      title: isTrial ? "Your free trial has ended" : "Your access period has ended",
      message: `The listed end date was ${formatDate(endDate)}. Review your subscription to see the next steps.`,
    };
  }

  const remaining = daysRemaining(endDate);
  if (remaining == null || remaining > 7) return null;

  if (status === "cancelled") {
    if (remaining > 7) return null;
    return {
      tone: remaining <= 3 ? "urgent" : "warning",
      Icon: CalendarClock,
      title: remaining === 0
        ? "Your subscription ends today"
        : `Your subscription ends in ${remaining} ${remaining === 1 ? "day" : "days"}`,
      message: `Your listed access end date is ${formatDate(endDate)}. Review your plan if you need continued access.`,
    };
  }

  return {
    tone: remaining <= 3 ? "urgent" : "warning",
    Icon: remaining <= 3 ? Clock3 : CheckCircle2,
    title: remaining === 0
      ? (isTrial ? "Your free trial ends today" : "Your plan ends today")
      : isTrial
        ? `Your free trial ends in ${remaining} ${remaining === 1 ? "day" : "days"}`
        : `Your Khaavio access ends in ${remaining} ${remaining === 1 ? "day" : "days"}`,
    message: `Current plan: ${subscription?.subscription_plans?.name || (isTrial ? "Free Trial" : "Khaavio plan")}. Listed end date: ${formatDate(endDate)}. Review plans before access ends.`,
  };
}

/**
 * Shows a reminder only when the current restaurant's subscription needs attention
 * or has seven days or fewer remaining. Query failures do not block the dashboard.
 */
export default function SubscriptionExpiryBanner({ restaurantId }) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;

    async function loadSubscription() {
      if (!restaurantId) {
        setSubscription(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("restaurant_subscriptions")
          .select("id, restaurant_id, plan_key, status, starts_at, ends_at, subscription_plans(name)")
          .eq("restaurant_id", restaurantId)
          .order("starts_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (isCurrent) setSubscription(data || null);
      } catch (error) {
        // Keep a subscription lookup failure from breaking the restaurant dashboard.
        console.warn("Could not load the subscription reminder:", error?.message || error);
        if (isCurrent) setSubscription(null);
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    loadSubscription();

    return () => {
      isCurrent = false;
    };
  }, [restaurantId]);

  if (loading || !subscription) return null;

  const reminder = getReminder(subscription);
  if (!reminder) return null;

  const Icon = reminder.Icon;

  return (
    <aside
      className={`khaavio-expiry-banner khaavio-expiry-banner-${reminder.tone}`}
      role={reminder.tone === "urgent" ? "alert" : "status"}
      aria-live={reminder.tone === "urgent" ? "assertive" : "polite"}
    >
      <div className="khaavio-expiry-banner-icon" aria-hidden="true">
        <Icon size={21} />
      </div>

      <div className="khaavio-expiry-banner-copy">
        <span className="khaavio-expiry-banner-eyebrow">SUBSCRIPTION REMINDER</span>
        <h2>{reminder.title}</h2>
        <p>{reminder.message}</p>
      </div>

      <Link to="/dashboard/subscription" className="khaavio-expiry-banner-link">
        Review plans <ArrowRight size={16} />
      </Link>
    </aside>
  );
}
