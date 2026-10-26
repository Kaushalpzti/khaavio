import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  Send,
  CheckCircle2,
  CreditCard,
  FileText,
  Info,
  LoaderCircle,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { loadRazorpayCheckout } from "../lib/razorpayCheckout";
import khaavioIcon from "../assets/icon.png";
import "./Subscription.css";

const INITIAL_NOW = new Date();

// Launch offers are informational until checkout and offer eligibility are implemented.
// The founding offer must be confirmed manually by Khaavio; the UI does not count customers.
const FOUNDING_OFFERS = {};

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

function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getReceiptNumber(requestId) {
  const compactId = String(requestId || "")
    .replace(/-/g, "")
    .slice(0, 10)
    .toUpperCase();
  return `KHV-RCPT-${compactId || "UNAVAILABLE"}`;
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

async function getCheckoutFunctionError(error, fallback) {
  const context = error?.context;
  if (context && typeof context.clone === "function") {
    try {
      const payload = await context.clone().json();
      if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
    } catch { /* Use the generic error below. */ }
  }
  return getErrorMessage(error, fallback);
}
export default function Subscription() {
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [renewalRequests, setRenewalRequests] = useState([]);
  const [receiptRequest, setReceiptRequest] = useState(null);
  const [requestingPlanKey, setRequestingPlanKey] = useState("");
  const [foundingOfferRequested, setFoundingOfferRequested] = useState(false);
  const [requestNotice, setRequestNotice] = useState("");
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

        const { data: requestData, error: requestError } = await supabase.rpc(
          "get_my_subscription_renewal_requests",
        );
        if (requestError) throw requestError;
        if (!active) return;
        setRenewalRequests(Array.isArray(requestData) ? requestData : []);
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

  async function requestPlan(availablePlan) {
    if (!availablePlan || requestingPlanKey) return;
    const confirmed = window.confirm(
      `Continue to secure Razorpay checkout for ${availablePlan.name} (${formatPrice(availablePlan.price_inr, availablePlan.billing_interval)})? This is a recurring subscription. The selected plan will be activated only after Razorpay confirms a captured payment.`,
    );
    if (!confirmed) return;
    setError("");
    setRequestNotice("");
    setRequestingPlanKey(availablePlan.plan_key);
    let checkoutData = null;
    let checkoutCompleted = false;
    try {
      const checkoutLoaded = await loadRazorpayCheckout();
      if (!checkoutLoaded || !window.Razorpay) {
        throw new Error("Razorpay Checkout could not be loaded. Check your connection and try again.");
      }
      const { data, error: createError } = await supabase.functions.invoke(
        "razorpay-create-subscription",
        { body: { plan_key: availablePlan.plan_key } },
      );
      if (createError) throw new Error(await getCheckoutFunctionError(createError, "Could not create the Razorpay subscription."));
      if (!data?.subscription_id || !data?.attempt_id || !data?.key_id) {
        throw new Error("The billing server did not return a valid checkout session. Please contact Khaavio support.");
      }
      checkoutData = data;
      const Checkout = window.Razorpay;
      const checkout = new Checkout({
        key: data.key_id,
        subscription_id: data.subscription_id,
        name: "Khaavio",
        description: `${availablePlan.name} recurring subscription`,
        image: new URL(khaavioIcon, window.location.origin).toString(),
        prefill: {
          name: data.restaurant_name || restaurant?.name || "",
          email: data.customer_email || "",
        },
        notes: { khaavio_attempt_id: data.attempt_id, khaavio_plan_key: availablePlan.plan_key },
        theme: { color: "#216e52" },
        handler: async (response) => {
          checkoutCompleted = true;
          setError("");
          setRequestNotice("Checkout returned. Verifying the payment securely with Khaavioâ€¦");
          try {
            const { data: verification, error: verifyError } = await supabase.functions.invoke(
              "razorpay-verify-subscription",
              {
                body: {
                  attempt_id: data.attempt_id,
                  razorpay_payment_id: response?.razorpay_payment_id,
                  razorpay_subscription_id: response?.razorpay_subscription_id,
                  razorpay_signature: response?.razorpay_signature,
                },
              },
            );
            if (verifyError) throw new Error(await getCheckoutFunctionError(verifyError, "Checkout signature verification failed."));
            if (!verification?.verified) throw new Error("The checkout could not be verified. If you were charged, do not pay again; contact Khaavio support.");
            if (verification.access_active) {
              setRequestNotice("Payment verified and your subscription is active. Welcome to Khaavio!");
            } else {
              setRequestNotice("Checkout signature verified. Your plan will activate automatically after Razorpay confirms the captured payment. Refresh this page in a few seconds if it does not update.");
            }
            setRefreshKey((current) => current + 1);
          } catch (verifyError) {
            setError(getErrorMessage(verifyError, "Payment returned, but the verification response could not be confirmed. If money was deducted, do not retry payment; contact Khaavio support."));
          } finally {
            setRequestingPlanKey("");
          }
        },
        modal: {
          ondismiss: async () => {
            if (!checkoutCompleted && checkoutData?.attempt_id) {
              try {
                await supabase.functions.invoke("razorpay-cancel-pending-subscription", {
                  body: { attempt_id: checkoutData.attempt_id },
                });
              } catch { /* The server expires abandoned attempts after a short timeout. */ }
              setRequestNotice("Checkout closed. No plan change was made. You can start checkout again.");
            }
            setRequestingPlanKey("");
          },
        },
      });
      checkout.on("payment.failed", (event) => {
        const description = event?.error?.description;
        setError(typeof description === "string" && description.trim()
          ? `Razorpay reported a payment issue: ${description}`
          : "Razorpay could not complete this payment. Please try again or contact Khaavio support.");
        setRequestingPlanKey("");
      });
      checkout.open();
    } catch (checkoutError) {
      setError(getErrorMessage(checkoutError, "Could not start Razorpay checkout. Please try again."));
      setRequestingPlanKey("");
    }
  }

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

        {requestNotice && (
          <div
            className="subscription-alert subscription-alert-success"
            role="status"
          >
            <CheckCircle2 size={17} /> <span>{requestNotice}</span>
          </div>
        )}

        {restaurant &&
          ["expired", "cancelled", "past_due", "unassigned"].includes(
            currentStatus,
          ) && (
            <section className="subscription-access-attention" role="status">
              <div className="subscription-access-attention-icon">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2>
                  {currentStatus === "expired"
                    ? "Your access period has ended"
                    : currentStatus === "cancelled"
                      ? "Your subscription is cancelled"
                      : currentStatus === "past_due"
                        ? "Your subscription needs attention"
                        : "No active plan assigned"}
                </h2>
                <p>
                  Your restaurant data and history are preserved. Select an
                  annual or monthly plan below, then contact Khaavio support to
                  verify payment and activate access. Payments are still handled
                  manually.
                </p>
              </div>
            </section>
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
                Secure recurring billing is handled through Razorpay Checkout. Your
                plan changes only after Khaavio verifies the checkout response and
                receives a server-verified captured-payment webhook from Razorpay.
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
                  <ShieldCheck size={14} /> Secure Razorpay checkout
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

              {false && billingInterval === "yearly" && (
                <div className="subscription-founding-banner" role="note">
                  <div className="subscription-founding-banner-icon">
                    <Tag size={18} />
                  </div>
                  <div>
                    <strong>
                      Founding restaurant offer · first 10 restaurants
                    </strong>
                    <p>
                      Requesting the founding offer does not guarantee a
                      discount. Khaavio will confirm eligibility and the final
                      amount before payment.
                    </p>
                    <label className="subscription-founding-request-check">
                      <input
                        type="checkbox"
                        checked={foundingOfferRequested}
                        onChange={(event) =>
                          setFoundingOfferRequested(event.target.checked)
                        }
                        disabled={
                          Boolean(requestingPlanKey)
                        }
                      />
                      <span>
                        Request founding pricing for one of the first 10
                        restaurants
                      </span>
                    </label>
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
                              Best for growing cafes
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
                              {formatCurrency(0)} <span>/ 7 days</span>
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
                          {isTrial ? (
                            <span className="subscription-plan-footer-note">
                              A trial is assigned automatically to eligible new
                              restaurants.
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="subscription-request-button"
                              onClick={() => requestPlan(availablePlan)}
                              disabled={
                                Boolean(requestingPlanKey)
                              }
                            >
                              {requestingPlanKey === availablePlan.plan_key ? (
                                <LoaderCircle
                                  size={15}
                                  className="subscription-spinner"
                                />
                              ) : (
                                <Send size={15} />
                              )}
                              {renewalRequests.some(
                                (request) => request.status === "pending",
                              )
                                ? "Processingâ€¦"
                                : isCurrent
                                  ? "Subscribe & pay"
                                  : "Subscribe & pay"}
                            </button>
                          )}
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
                Choose monthly or yearly billing above. Razorpay handles recurring checkout; Khaavio activates a paid plan only after server-side verification of a captured payment. The listed catalog price is charged; founding discounts are not applied in online checkout.
              </p>
            </section>

            <section className="subscription-renewal-history">
              <div className="subscription-section-heading">
                <div>
                  <span className="subscription-eyebrow">PREVIOUS REQUESTS</span>
                  <h2>Previous manual requests</h2>
                  <p>
                    Older manually reviewed requests remain visible here. New subscriptions use Razorpay Checkout and activate only after server-side verification of a captured payment.
                  </p>
                </div>
              </div>
              {renewalRequests.length ? (
                <div className="subscription-request-list">
                  {renewalRequests.map((request) => (
                    <article
                      className="subscription-request-history-card"
                      key={request.request_id}
                    >
                      <div className="subscription-request-history-main">
                        <div>
                          <strong>
                            {request.plan_name} ·{" "}
                            {request.billing_interval === "yearly"
                              ? "Yearly"
                              : "Monthly"}
                          </strong>
                          <span>
                            Requested {formatDate(request.created_at)}
                          </span>
                        </div>
                        <span
                          className={`subscription-request-status status-${request.status}`}
                        >
                          {request.status === "pending"
                            ? "Awaiting review"
                            : request.status === "activated"
                              ? "Activated"
                              : "Declined"}
                        </span>
                      </div>
                      <p className="subscription-request-amount">
                        Catalog price:{" "}
                        {formatCurrency(request.catalog_price_inr)}
                        {request.billing_interval === "yearly"
                          ? " / year"
                          : " / month"}
                        {request.founding_offer_requested
                          ? " · Founding offer requested (subject to approval)"
                          : ""}
                      </p>
                      {request.confirmed_amount_inr != null && (
                        <p className="subscription-request-payment">
                          Confirmed amount:{" "}
                          {formatCurrency(request.confirmed_amount_inr)}
                          {request.payment_reference
                            ? ` · Reference: ${request.payment_reference}`
                            : ""}
                        </p>
                      )}
                      {request.status === "activated" &&
                        request.confirmed_amount_inr != null &&
                        request.payment_reference && (
                          <button
                            type="button"
                            className="subscription-receipt-button"
                            onClick={() => setReceiptRequest(request)}
                          >
                            <FileText size={15} /> View payment receipt
                          </button>
                        )}
                      {request.admin_note && (
                        <p className="subscription-request-admin-note">
                          Khaavio note: {request.admin_note}
                        </p>
                      )}
                      {request.status === "pending" && (
                        <p className="subscription-request-pending-note">
                          No payment has been collected in Khaavio. Wait for the
                          final quote and payment instructions before
                          transferring money.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="subscription-empty-inline">
                  You have not submitted a plan request yet.
                </div>
              )}
            </section>

            {receiptRequest && (
              <div className="subscription-receipt-backdrop">
                <section
                  className="subscription-receipt-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="subscription-receipt-title"
                >
                  <div className="subscription-receipt-actions">
                    <span>Payment receipt preview</span>
                    <button
                      type="button"
                      className="subscription-receipt-close"
                      onClick={() => setReceiptRequest(null)}
                      aria-label="Close receipt preview"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="subscription-receipt-paper">
                    <header className="subscription-receipt-brand-row">
                      <div className="subscription-receipt-brand">
                        <img src={khaavioIcon} alt="" />
                        <div>
                          <strong>Khaavio</strong>
                          <span>Every Table, Digitally Connected.</span>
                        </div>
                      </div>
                      <span className="subscription-receipt-paid-badge">
                        <CheckCircle2 size={14} /> Payment verified
                      </span>
                    </header>

                    <div className="subscription-receipt-title-row">
                      <div>
                        <span className="subscription-eyebrow">
                          ACCOUNT & BILLING
                        </span>
                        <h2 id="subscription-receipt-title">Payment receipt</h2>
                        <p>
                          Receipt for a manually verified Khaavio subscription
                          payment.
                        </p>
                      </div>
                    </div>

                    <div className="subscription-receipt-meta-grid">
                      <div>
                        <span>Receipt number</span>
                        <strong>
                          {getReceiptNumber(receiptRequest.request_id)}
                        </strong>
                      </div>
                      <div>
                        <span>Payment verified</span>
                        <strong>
                          {formatDateTime(
                            receiptRequest.payment_verified_at ||
                              receiptRequest.resolved_at,
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>Restaurant</span>
                        <strong>{restaurant?.name || "Restaurant"}</strong>
                      </div>
                      <div>
                        <span>Plan requested</span>
                        <strong>
                          {receiptRequest.plan_name || "Khaavio subscription"}
                        </strong>
                      </div>
                    </div>

                    <div className="subscription-receipt-line-item">
                      <div>
                        <strong>{receiptRequest.plan_name} subscription</strong>
                        <span>
                          {receiptRequest.billing_interval === "yearly"
                            ? "Annual subscription"
                            : "Monthly subscription"}
                        </span>
                      </div>
                      <strong>
                        {formatCurrency(receiptRequest.confirmed_amount_inr)}
                      </strong>
                    </div>

                    <div className="subscription-receipt-total">
                      <span>Amount recorded as received</span>
                      <strong>
                        {formatCurrency(receiptRequest.confirmed_amount_inr)}
                      </strong>
                    </div>

                    <div className="subscription-receipt-reference">
                      <span>Payment reference / UTR</span>
                      <strong>{receiptRequest.payment_reference}</strong>
                    </div>

                    <div className="subscription-receipt-note">
                      <ShieldCheck size={17} />
                      <p>
                        Khaavio marked this payment as verified manually. Keep
                        this receipt and the payment reference for your records.
                        Subscription activation was recorded against the
                        associated plan request.
                      </p>
                    </div>

                    <footer className="subscription-receipt-footer">
                      <span>
                        Request ID:{" "}
                        {String(receiptRequest.request_id || "").toUpperCase()}
                      </span>
                      <p>
                        This is a payment acknowledgement, not a GST tax
                        invoice.
                      </p>
                    </footer>
                  </div>

                  <div className="subscription-receipt-actions subscription-receipt-bottom-actions">
                    <span>
                      Use your browser's print dialog to save this receipt as
                      PDF.
                    </span>
                    <button
                      type="button"
                      className="subscription-receipt-print-button"
                      onClick={() => window.print()}
                    >
                      <Printer size={16} /> Print / Save as PDF
                    </button>
                  </div>
                </section>
              </div>
            )}

            <section className="subscription-next-steps">
              <CalendarClock size={21} />
              <div>
                <h3>Need to change your plan?</h3>
                <p>Switching between active paid subscriptions is not automated yet. Contact Khaavio support before starting a second paid subscription.</p>
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
