import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import khaavioIcon from "../assets/icon.png";
import "./Subscription.css";

const INITIAL_NOW = new Date();

// Launch offers are informational until checkout and offer eligibility are implemented.
// The founding offer must be confirmed manually by Khaavio; the UI does not count customers.
const FOUNDING_OFFERS = {
  starter_yearly: { offerPrice: 3999, regularPrice: 4990 },
  growth_yearly: { offerPrice: 6999, regularPrice: 8990 },
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

const STATUS_LABELS = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment due",
  expired: "Expired",
  cancelled: "Cancelled",
};

function formatDate(value) {
  if (!value) return "No expiry date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatPrice(value, interval) {
  if (value == null) return "Pricing to be announced";
  if (Number(value) === 0) return "Free";
  const price = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
  if (interval === "monthly") return `${price} / month`;
  if (interval === "yearly") return `${price} / year`;
  return price;
}

function resolveStatus(subscription, now) {
  if (
    subscription?.ends_at &&
    new Date(subscription.ends_at).getTime() <= now.getTime() &&
    ["active", "trialing"].includes(subscription.status)
  ) {
    return "expired";
  }
  return subscription?.status || "unassigned";
}

function daysRemaining(value, now) {
  if (!value) return null;

  const difference = new Date(value).getTime() - now.getTime();
  if (!Number.isFinite(difference)) return null;
  if (difference <= 0) return 0;

  const dayMs = 86_400_000;
  const exactDays = difference / dayMs;
  const nearestWholeDay = Math.round(exactDays);

  // Avoid displaying 8 days immediately after assigning a 7-day trial
  // when timestamps differ by only a few minutes due to clock/transaction timing.
  const nearWholeDayTolerance = (5 * 60_000) / dayMs;
  if (Math.abs(exactDays - nearestWholeDay) <= nearWholeDayTolerance) {
    return Math.max(0, nearestWholeDay);
  }

  return Math.max(0, Math.ceil(exactDays));
}

function getErrorMessage(error, fallback) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : fallback;
}

export default function Subscription() {
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [billingInterval, setBillingInterval] = useState("yearly");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [now, setNow] = useState(INITIAL_NOW);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSubscription() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        const { data: restaurantData, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name, slug")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (restaurantError) throw restaurantError;
        if (!active) return;
        setRestaurant(restaurantData);

        const { data: planData, error: plansError } = await supabase
          .from("subscription_plans")
          .select(
            "plan_key, name, description, price_inr, billing_interval, duration_days, features, limits",
          )
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        if (plansError) throw plansError;
        if (!active) return;
        setPlans(Array.isArray(planData) ? planData : []);

        if (!restaurantData) {
          setSubscription(null);
          return;
        }

        const { data: subscriptionData, error: subscriptionError } =
          await supabase
            .from("restaurant_subscriptions")
            .select(
              "id, restaurant_id, plan_key, status, starts_at, ends_at, created_at, updated_at, subscription_plans(plan_key, name, description, price_inr, billing_interval, duration_days, features, limits)",
            )
            .eq("restaurant_id", restaurantData.id)
            .maybeSingle();
        if (subscriptionError) throw subscriptionError;
        if (!active) return;
        setSubscription(subscriptionData || null);
      } catch (loadError) {
        if (active) {
          setError(
            getErrorMessage(loadError, "Unable to load subscription details."),
          );
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadSubscription();
    return () => {
      active = false;
    };
  }, [navigate, refreshKey]);

  function refresh() {
    if (loading || refreshing) return;
    setError("");
    setRefreshing(true);
    setRefreshKey((current) => current + 1);
  }

  const plan = subscription?.subscription_plans || null;
  const currentStatus = resolveStatus(subscription, now);
  const remainingDays = daysRemaining(subscription?.ends_at, now);
  const trialPlan = plans.find(
    (availablePlan) => availablePlan.plan_key === "trial",
  );
  const paidPlanKeys =
    billingInterval === "yearly"
      ? ["starter_yearly", "growth_yearly"]
      : ["starter", "growth"];
  const paidPlans = paidPlanKeys
    .map((key) => plans.find((availablePlan) => availablePlan.plan_key === key))
    .filter(Boolean);
  const visiblePlans = [trialPlan, ...paidPlans].filter(Boolean);

  if (loading) {
    return (
      <main className="subscription-state">
        <LoaderCircle className="subscription-spinner" size={30} />
        <p>Loading subscription details...</p>
      </main>
    );
  }

  return (
    <main className="subscription-page">
      <header className="subscription-header">
        <Link to="/dashboard" className="subscription-back">
          <ArrowLeft size={17} /> Dashboard
        </Link>
        <Link
          to="/"
          className="subscription-brand"
          aria-label="Khaavio homepage"
        >
          <img src={khaavioIcon} alt="" />
          <span>Khaavio</span>
        </Link>
        <button
          type="button"
          className="subscription-refresh"
          onClick={refresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <LoaderCircle size={16} className="subscription-spinner" />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh
        </button>
      </header>

      <div className="subscription-container">
        <div className="subscription-heading">
          <span className="subscription-eyebrow">ACCOUNT & BILLING</span>
          <h1>Subscription & plans</h1>
          <p>Check your current Khaavio access and explore upcoming plans.</p>
        </div>

        {error && (
          <div
            className="subscription-alert subscription-alert-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {!restaurant ? (
          <section className="subscription-empty">
            <Store size={30} />
            <h2>No restaurant workspace found</h2>
            <p>
              Complete restaurant setup before managing subscription details.
            </p>
            <Link to="/onboarding" className="subscription-primary-button">
              Set up restaurant
            </Link>
          </section>
        ) : (
          <>
            <section className="subscription-current-card">
              <div className="subscription-current-top">
                <div className="subscription-current-icon">
                  <CreditCard size={23} />
                </div>
                <div className="subscription-current-copy">
                  <span className="subscription-eyebrow">CURRENT ACCESS</span>
                  <h2>{plan?.name || "Plan not assigned"}</h2>
                  <p>{restaurant.name}</p>
                </div>
                <span className={`subscription-status status-${currentStatus}`}>
                  {STATUS_LABELS[currentStatus] || "Not assigned"}
                </span>
              </div>

              {subscription ? (
                <div className="subscription-facts">
                  <div>
                    <span>Access started</span>
                    <strong>{formatDate(subscription.starts_at)}</strong>
                  </div>
                  <div>
                    <span>
                      {subscription.ends_at ? "Access ends" : "Access expiry"}
                    </span>
                    <strong>{formatDate(subscription.ends_at)}</strong>
                  </div>
                  <div>
                    <span>Time remaining</span>
                    <strong>
                      {remainingDays == null
                        ? "No scheduled expiry"
                        : remainingDays === 0
                          ? "Ended"
                          : `${remainingDays} day${remainingDays === 1 ? "" : "s"}`}
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="subscription-unassigned-note">
                  No subscription record is assigned to this restaurant yet.
                  Contact Khaavio support to review access.
                </p>
              )}

              {plan?.features?.length > 0 && (
                <div className="subscription-included">
                  <h3>
                    <CheckCircle2 size={17} /> Included in your plan
                  </h3>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <CheckCircle2 size={15} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <div className="subscription-notice" role="note">
              <Info size={19} />
              <p>
                This is the manual-plan MVP. Prices are displayed for planning
                only; payment collection, automatic renewals and feature limits
                are not enabled. Plan activation is handled manually during the
                pilot.
              </p>
            </div>

            <section className="subscription-plans-section">
              <div className="subscription-section-heading subscription-pricing-heading">
                <div>
                  <span className="subscription-eyebrow">PLAN OVERVIEW</span>
                  <h2>Simple plans for growing restaurants</h2>
                  <p>
                    Start free, then choose monthly flexibility or annual
                    savings.
                  </p>
                </div>
                <span className="subscription-manual-label">
                  <ShieldCheck size={14} /> Manual activation during pilot
                </span>
              </div>

              <div
                className="subscription-billing-switch"
                role="group"
                aria-label="Billing period"
              >
                <button
                  type="button"
                  className={billingInterval === "monthly" ? "active" : ""}
                  aria-pressed={billingInterval === "monthly"}
                  onClick={() => setBillingInterval("monthly")}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className={billingInterval === "yearly" ? "active" : ""}
                  aria-pressed={billingInterval === "yearly"}
                  onClick={() => setBillingInterval("yearly")}
                >
                  Yearly{" "}
                  <span className="subscription-save-chip">Save 2 months</span>
                </button>
              </div>

              {billingInterval === "yearly" && (
                <div className="subscription-founding-banner" role="note">
                  <div className="subscription-founding-banner-icon">
                    <Tag size={18} />
                  </div>
                  <div>
                    <strong>
                      Founding restaurant offer · first 10 restaurants
                    </strong>
                    <p>
                      Special first-year prices are shown on yearly plans.
                      Khaavio will confirm eligibility manually; this offer is
                      not automatically counted or activated yet.
                    </p>
                  </div>
                </div>
              )}

              {visiblePlans.length ? (
                <div className="subscription-plans-grid subscription-plans-grid-pricing">
                  {visiblePlans.map((availablePlan) => {
                    const isCurrent =
                      availablePlan.plan_key === subscription?.plan_key;
                    const isTrial = availablePlan.plan_key === "trial";
                    const offer = FOUNDING_OFFERS[availablePlan.plan_key];
                    const isGrowth = ["growth", "growth_yearly"].includes(
                      availablePlan.plan_key,
                    );
                    const price = availablePlan.price_inr;
                    const period = availablePlan.billing_interval;

                    return (
                      <article
                        key={availablePlan.plan_key}
                        className={`subscription-plan-card ${isCurrent ? "is-current" : ""} ${isGrowth ? "is-recommended" : ""} ${isTrial ? "is-trial-plan" : ""}`}
                      >
                        <div className="subscription-plan-card-top">
                          <div className="subscription-plan-icon">
                            {isGrowth ? (
                              <Sparkles size={20} />
                            ) : (
                              <CreditCard size={20} />
                            )}
                          </div>
                          {isCurrent ? (
                            <span className="subscription-current-label">
                              Current
                            </span>
                          ) : isGrowth ? (
                            <span className="subscription-popular-label">
                              Best for growing cafés
                            </span>
                          ) : null}
                        </div>

                        <h3>
                          {isTrial ? "7-day Free Trial" : availablePlan.name}
                        </h3>
                        <p>
                          {isTrial
                            ? "Try Khaavio's core restaurant workflows for a full week, with no payment required during the trial."
                            : availablePlan.description}
                        </p>

                        {isTrial ? (
                          <div className="subscription-price-block">
                            <div className="subscription-plan-price">
                              ₹0 <span>/ 7 days</span>
                            </div>
                            <span className="subscription-price-caption">
                              No card required
                            </span>
                          </div>
                        ) : offer ? (
                          <div className="subscription-price-block">
                            <span className="subscription-offer-tag">
                              FOUNDING OFFER
                            </span>
                            <div className="subscription-plan-price">
                              {formatCurrency(offer.offerPrice)}{" "}
                              <span>/ first year</span>
                            </div>
                            <div className="subscription-price-regular">
                              <del>
                                {formatCurrency(offer.regularPrice)} / year
                              </del>
                              <span>Standard annual price</span>
                            </div>
                            <span className="subscription-price-caption">
                              Effective {formatCurrency(offer.offerPrice / 12)}{" "}
                              per month in year one
                            </span>
                            <span className="subscription-price-renewal">
                              Renewal: {formatCurrency(offer.regularPrice)} /
                              year, unless changed before renewal
                            </span>
                          </div>
                        ) : (
                          <div className="subscription-price-block">
                            <div className="subscription-plan-price">
                              {formatPrice(price, period)}
                            </div>
                            <span className="subscription-price-caption">
                              {period === "monthly"
                                ? "Billed monthly"
                                : "Billed yearly"}
                            </span>
                          </div>
                        )}

                        {Array.isArray(availablePlan.features) &&
                          availablePlan.features.length > 0 && (
                            <ul>
                              {availablePlan.features.map((feature) => (
                                <li key={feature}>
                                  <CheckCircle2 size={15} />
                                  {feature}
                                </li>
                              ))}
                            </ul>
                          )}

                        <div className="subscription-plan-footer">
                          {isCurrent
                            ? "Your current plan"
                            : isTrial
                              ? "Available to new restaurants"
                              : "Manual activation · no checkout yet"}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="subscription-empty-inline">
                  Pricing plans are not loaded yet. Apply the Khaavio pricing
                  update migration, then refresh this page.
                </div>
              )}

              <p className="subscription-pricing-footnote">
                Monthly and annual prices are the planned launch prices.
                Checkout, automated billing, renewals and plan-based feature
                restrictions are not active in this MVP. Founding discounts are
                manually confirmed and are not automatically applied.
              </p>
            </section>

            <section className="subscription-next-steps">
              <CalendarClock size={21} />
              <div>
                <h3>Need to change your plan?</h3>
                <p>
                  Plan changes are handled manually during the pilot. Khaavio
                  does not collect payments from this screen.
                </p>
              </div>
            </section>
          </>
        )}

        <footer className="subscription-footer">
          <Link to="/dashboard">
            <ArrowLeft size={15} /> Back to workspace
          </Link>
          <span>Every Table, Digitally Connected.</span>
        </footer>
      </div>
    </main>
  );
}
