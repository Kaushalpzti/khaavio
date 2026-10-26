import { confirmKhaavio, promptKhaavio } from "../components/KhaavioDialogSystem.jsx";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Banknote,
  MessageSquareText,
  XCircle,
  CreditCard,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import khaavioIcon from "../assets/icon.png";
import "./PlatformAdminSubscriptions.css";

function getErrorMessage(error, fallback) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : fallback;
}

function formatDate(value) {
  if (!value) return "No expiry date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPrice(value, interval) {
  if (value == null) return "Pricing not set";
  if (Number(value) === 0) return "Free";
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
  if (interval === "monthly") return `${formatted}/month`;
  if (interval === "yearly") return `${formatted}/year`;
  return formatted;
}

function displayStatus(row) {
  if (
    row.ends_at &&
    new Date(row.ends_at).getTime() <= Date.now() &&
    ["active", "trialing"].includes(row.subscription_status)
  ) {
    return "expired";
  }
  return row.subscription_status || "unassigned";
}

const STATUS_LABELS = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment due",
  expired: "Expired",
  cancelled: "Cancelled",
  unassigned: "No plan assigned",
};

export default function PlatformAdminSubscriptions() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [plans, setPlans] = useState([]);
  const [renewalRequests, setRenewalRequests] = useState([]);
  const [resolvingRequestId, setResolvingRequestId] = useState("");
  const [draftPlanKeys, setDraftPlanKeys] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatingRestaurantId, setUpdatingRestaurantId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadData() {
      setError("");
      setAccessDenied(false);

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

        // This RPC enforces the allowlist on the server; hiding the UI is not the security boundary.
        const { data: subscriptionData, error: listError } = await supabase.rpc(
          "platform_admin_list_subscriptions",
        );
        if (listError) {
          if (
            listError.code === "42501" ||
            /platform admin access required/i.test(listError.message || "")
          ) {
            if (active) setAccessDenied(true);
            return;
          }
          throw listError;
        }
        if (!active) return;

        const { data: planData, error: plansError } = await supabase
          .from("subscription_plans")
          .select(
            "plan_key, name, description, price_inr, billing_interval, duration_days, is_active, sort_order",
          )
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        if (plansError) throw plansError;
        if (!active) return;

        const { data: renewalData, error: renewalError } = await supabase.rpc(
          "platform_admin_list_renewal_requests",
        );
        if (renewalError) throw renewalError;
        if (!active) return;

        const nextRows = Array.isArray(subscriptionData)
          ? subscriptionData
          : [];
        const nextPlans = Array.isArray(planData) ? planData : [];
        setRows(nextRows);
        setPlans(nextPlans);
        setRenewalRequests(Array.isArray(renewalData) ? renewalData : []);
        setDraftPlanKeys(
          Object.fromEntries(
            nextRows.map((row) => [
              row.restaurant_id,
              nextPlans.some((plan) => plan.plan_key === row.plan_key)
                ? row.plan_key
                : "pilot",
            ]),
          ),
        );
      } catch (loadError) {
        if (active) {
          setError(
            getErrorMessage(
              loadError,
              "Unable to load platform subscriptions.",
            ),
          );
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [navigate, refreshKey]);

  function refresh() {
    if (loading || refreshing) return;
    setNotice("");
    setRefreshing(true);
    setRefreshKey((current) => current + 1);
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [
        row.restaurant_name,
        row.restaurant_slug,
        row.plan_name,
        row.plan_key,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      ),
    );
  }, [rows, search]);

  async function assignPlan(row) {
    const planKey = draftPlanKeys[row.restaurant_id];
    const selectedPlan = plans.find((plan) => plan.plan_key === planKey);
    if (!selectedPlan || updatingRestaurantId) return;

    const confirmed = await confirmKhaavio(
      `Assign ${selectedPlan.name} to ${row.restaurant_name}?\n\nThis replaces the current subscription period and starts the new period now. This panel does not collect or verify payment. Confirm only after payment has been handled manually, unless assigning Pilot Access or a trial.`,
    );
    if (!confirmed) return;

    setError("");
    setNotice("");
    setUpdatingRestaurantId(row.restaurant_id);
    try {
      const { error: assignError } = await supabase.rpc(
        "platform_admin_assign_plan",
        {
          p_restaurant_id: row.restaurant_id,
          p_plan_key: planKey,
        },
      );
      if (assignError) throw assignError;
      setNotice(`${selectedPlan.name} assigned to ${row.restaurant_name}.`);
      setRefreshing(true);
      setRefreshKey((current) => current + 1);
    } catch (assignError) {
      setError(getErrorMessage(assignError, "Could not assign this plan."));
    } finally {
      setUpdatingRestaurantId("");
    }
  }

  async function resolveRenewalRequest(request, decision) {
    if (!request || resolvingRequestId) return;
    let confirmedAmount = null;
    let paymentReference = null;
    let adminNote = null;

    if (decision === "activate") {
      const confirmed = await confirmKhaavio(
        `Before continuing, confirm that you independently verified payment for ${request.restaurant_name}.\n\nThis will activate ${request.plan_name} ${request.billing_interval} and start a new subscription period.`,
      );
      if (!confirmed) return;

      const defaultAmount = request.founding_offer_requested
        ? ""
        : String(request.catalog_price_inr);
      const amountInput = await promptKhaavio(
        `Enter the amount actually received in INR. Catalog price is ₹${request.catalog_price_inr}. A lower amount is allowed only for a requested founding offer after you verify eligibility.`,
        defaultAmount,
      );
      if (amountInput === null) return;
      confirmedAmount = Number(amountInput.trim());
      const catalogAmount = Number(request.catalog_price_inr);
      const discountedAmountNeedsOffer =
        !request.founding_offer_requested && confirmedAmount !== catalogAmount;
      if (
        !Number.isFinite(confirmedAmount) ||
        confirmedAmount <= 0 ||
        confirmedAmount > catalogAmount ||
        discountedAmountNeedsOffer
      ) {
        setError(
          request.founding_offer_requested
            ? "Enter a valid received amount greater than ₹0 and no higher than the catalog price. Verify founding-offer eligibility before applying a discount."
            : "The full catalog price is required unless the restaurant requested a founding annual offer.",
        );
        return;
      }

      paymentReference = await promptKhaavio(
        "Enter the verified UPI/bank payment reference or UTR (required):",
        "",
      );
      if (paymentReference === null) return;
      paymentReference = paymentReference.trim();
      if (paymentReference.length < 4) {
        setError(
          "A verified payment reference of at least 4 characters is required.",
        );
        return;
      }
      adminNote = await promptKhaavio(
        "Optional admin note (offer eligibility or payment context):",
        "",
      );
      if (adminNote === null) return;
    } else {
      const confirmed = await confirmKhaavio(
        `Reject the subscription request from ${request.restaurant_name}?`,
      );
      if (!confirmed) return;
      adminNote = await promptKhaavio(
        "Optional reason shown to the restaurant owner:",
        "",
      );
      if (adminNote === null) return;
    }

    setError("");
    setNotice("");
    setResolvingRequestId(request.request_id);
    try {
      const { error: resolveError } = await supabase.rpc(
        "platform_admin_resolve_renewal_request",
        {
          p_request_id: request.request_id,
          p_decision: decision,
          p_confirmed_amount_inr: confirmedAmount,
          p_payment_reference: paymentReference,
          p_admin_note: adminNote?.trim() || null,
        },
      );
      if (resolveError) throw resolveError;
      setNotice(
        decision === "activate"
          ? `${request.plan_name} activated for ${request.restaurant_name} after recording the verified payment.`
          : `Request from ${request.restaurant_name} was rejected.`,
      );
      setRefreshing(true);
      setRefreshKey((current) => current + 1);
    } catch (resolveError) {
      setError(
        getErrorMessage(resolveError, "Could not resolve the renewal request."),
      );
    } finally {
      setResolvingRequestId("");
    }
  }

  if (loading) {
    return (
      <main className="platform-admin-state">
        <LoaderCircle className="platform-admin-spinner" size={30} />
        <p>Loading platform subscriptions...</p>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className="platform-admin-page">
        <header className="platform-admin-header">
          <Link to="/dashboard" className="platform-admin-back">
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <Link to="/" className="platform-admin-brand">
            <img src={khaavioIcon} alt="" /> Khaavio
          </Link>
        </header>
        <section className="platform-admin-denied">
          <ShieldAlert size={34} />
          <h1>Platform admin access required</h1>
          <p>
            This account is not allowlisted to manage platform subscriptions.
            Ask the project administrator to add your user ID to{" "}
            <code>platform_admins</code>.
          </p>
          <Link to="/dashboard" className="platform-admin-primary">
            Back to restaurant dashboard
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="platform-admin-page">
      <header className="platform-admin-header">
        <Link to="/dashboard" className="platform-admin-back">
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <Link to="/" className="platform-admin-brand">
          <img src={khaavioIcon} alt="" /> Khaavio
        </Link>
        <button
          type="button"
          className="platform-admin-refresh"
          onClick={refresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <LoaderCircle size={15} className="platform-admin-spinner" />
          ) : (
            <RefreshCw size={15} />
          )}
          Refresh
        </button>
      </header>

      <div className="platform-admin-container">
        <div className="platform-admin-heading">
          <span className="platform-admin-eyebrow">
            <ShieldCheck size={14} /> PLATFORM OPERATIONS
          </span>
          <h1>Subscription management</h1>
          <p>
            Review restaurant access and manually assign a plan after checking
            payment or pilot eligibility.
          </p>
        </div>

        {error && (
          <div
            className="platform-admin-alert platform-admin-alert-error"
            role="alert"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            className="platform-admin-alert platform-admin-alert-success"
            role="status"
          >
            <CheckCircle2 size={16} /> {notice}
          </div>
        )}

        <section className="platform-admin-notice" role="note">
          <ShieldAlert size={19} />
          <p>
            <strong>Manual billing only.</strong> Assigning a paid plan does not
            collect or verify payment. Confirm payment or approved pilot access
            outside Khaavio first. No automatic renewal or feature gating is
            implemented by this panel.
          </p>
        </section>

        <section className="platform-admin-renewals">
          <div className="platform-admin-renewals-heading">
            <div>
              <span className="platform-admin-eyebrow">
                <MessageSquareText size={14} /> SUBSCRIPTION REQUESTS
              </span>
              <h2>Renewal & plan requests</h2>
              <p>
                Approve only after you have checked payment outside Khaavio. No
                payment is collected in this app.
              </p>
            </div>
            <span className="platform-admin-pending-count">
              {
                renewalRequests.filter(
                  (request) => request.request_status === "pending",
                ).length
              }{" "}
              pending
            </span>
          </div>
          {renewalRequests.length ? (
            <div className="platform-admin-renewal-list">
              {renewalRequests.map((request) => (
                <article
                  className="platform-admin-renewal-card"
                  key={request.request_id}
                >
                  <div className="platform-admin-renewal-top">
                    <div>
                      <h3>{request.restaurant_name || "Unnamed restaurant"}</h3>
                      <p>
                        /{request.restaurant_slug || "no-slug"} · Requested{" "}
                        {formatDate(request.created_at)}
                      </p>
                    </div>
                    <span
                      className={`platform-admin-status status-${request.request_status}`}
                    >
                      {request.request_status}
                    </span>
                  </div>
                  <div className="platform-admin-renewal-facts">
                    <div>
                      <span>Plan requested</span>
                      <strong>
                        {request.plan_name} · {request.billing_interval}
                      </strong>
                    </div>
                    <div>
                      <span>Catalog price</span>
                      <strong>
                        {formatPrice(
                          request.catalog_price_inr,
                          request.billing_interval,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Founding offer</span>
                      <strong>
                        {request.founding_offer_requested
                          ? "Requested · verify eligibility"
                          : "Not requested"}
                      </strong>
                    </div>
                    {request.confirmed_amount_inr != null && (
                      <div>
                        <span>Amount verified</span>
                        <strong>
                          {formatPrice(
                            request.confirmed_amount_inr,
                            request.billing_interval,
                          )}
                        </strong>
                      </div>
                    )}
                  </div>
                  {request.request_note && (
                    <p className="platform-admin-renewal-note">
                      Owner note: {request.request_note}
                    </p>
                  )}
                  {request.payment_reference && (
                    <p className="platform-admin-renewal-note">
                      Payment reference: {request.payment_reference}
                    </p>
                  )}
                  {request.admin_note && (
                    <p className="platform-admin-renewal-note">
                      Admin note: {request.admin_note}
                    </p>
                  )}
                  {request.request_status === "pending" ? (
                    <div className="platform-admin-renewal-actions">
                      <button
                        type="button"
                        className="platform-admin-assign-button"
                        onClick={() =>
                          resolveRenewalRequest(request, "activate")
                        }
                        disabled={Boolean(resolvingRequestId)}
                      >
                        {resolvingRequestId === request.request_id ? (
                          <LoaderCircle
                            size={15}
                            className="platform-admin-spinner"
                          />
                        ) : (
                          <Banknote size={15} />
                        )}
                        Verify payment & activate
                      </button>
                      <button
                        type="button"
                        className="platform-admin-reject-button"
                        onClick={() => resolveRenewalRequest(request, "reject")}
                        disabled={Boolean(resolvingRequestId)}
                      >
                        <XCircle size={15} /> Reject request
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="platform-admin-renewal-empty">
              No plan requests yet. New customer requests will appear here.
            </div>
          )}
        </section>

        <section className="platform-admin-toolbar">
          <label className="platform-admin-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search restaurant or current plan..."
            />
          </label>
          <span>
            {filteredRows.length} of {rows.length} restaurants
          </span>
        </section>

        {filteredRows.length > 0 ? (
          <section
            className="platform-admin-list"
            aria-label="Restaurant subscriptions"
          >
            {filteredRows.map((row) => {
              const status = displayStatus(row);
              const draftKey = draftPlanKeys[row.restaurant_id] || "pilot";
              const chosenPlan = plans.find(
                (plan) => plan.plan_key === draftKey,
              );
              const samePlanAlreadyActive =
                chosenPlan?.plan_key === row.plan_key &&
                ["active", "trialing"].includes(row.subscription_status) &&
                status !== "expired";
              return (
                <article
                  className="platform-admin-card"
                  key={row.restaurant_id}
                >
                  <div className="platform-admin-card-top">
                    <div className="platform-admin-restaurant-icon">
                      <Store size={21} />
                    </div>
                    <div className="platform-admin-restaurant-copy">
                      <h2>{row.restaurant_name || "Unnamed restaurant"}</h2>
                      <p>/{row.restaurant_slug || "no-slug"}</p>
                    </div>
                    <span className={`platform-admin-status status-${status}`}>
                      {STATUS_LABELS[status] || status}
                    </span>
                  </div>

                  <div className="platform-admin-facts">
                    <div>
                      <span>Current plan</span>
                      <strong>{row.plan_name || "No plan assigned"}</strong>
                    </div>
                    <div>
                      <span>Current price catalog</span>
                      <strong>
                        {row.plan_key
                          ? formatPrice(
                              row.plan_price_inr,
                              row.billing_interval,
                            )
                          : "—"}
                      </strong>
                    </div>
                    <div>
                      <span>Starts</span>
                      <strong>{formatDate(row.starts_at)}</strong>
                    </div>
                    <div>
                      <span>Expires</span>
                      <strong>{formatDate(row.ends_at)}</strong>
                    </div>
                  </div>

                  <div className="platform-admin-assignment">
                    <label>
                      <span>Assign plan</span>
                      <select
                        value={draftKey}
                        onChange={(event) =>
                          setDraftPlanKeys((current) => ({
                            ...current,
                            [row.restaurant_id]: event.target.value,
                          }))
                        }
                        disabled={updatingRestaurantId === row.restaurant_id}
                      >
                        {plans.map((plan) => (
                          <option key={plan.plan_key} value={plan.plan_key}>
                            {plan.name} ·{" "}
                            {formatPrice(plan.price_inr, plan.billing_interval)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="platform-admin-assign-button"
                      onClick={() => assignPlan(row)}
                      disabled={
                        !chosenPlan ||
                        updatingRestaurantId === row.restaurant_id ||
                        samePlanAlreadyActive
                      }
                    >
                      {updatingRestaurantId === row.restaurant_id ? (
                        <LoaderCircle
                          size={16}
                          className="platform-admin-spinner"
                        />
                      ) : (
                        <CreditCard size={16} />
                      )}
                      {updatingRestaurantId === row.restaurant_id
                        ? "Saving..."
                        : "Assign / activate"}
                    </button>
                  </div>
                  <p className="platform-admin-card-footnote">
                    {chosenPlan?.plan_key === "trial"
                      ? "Starts a fresh 7-day trial from now. Use only when approved."
                      : chosenPlan?.plan_key === "pilot"
                        ? "Provides Pilot Access with no scheduled expiry."
                        : `Starts a new ${chosenPlan?.billing_interval || "manual"} access period from now.`}
                  </p>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="platform-admin-empty">
            <Store size={28} />
            <h2>
              {rows.length ? "No matching restaurants" : "No restaurants found"}
            </h2>
            <p>
              {rows.length
                ? "Try a different search term."
                : "Restaurants will appear here after onboarding."}
            </p>
          </section>
        )}

        <footer className="platform-admin-footer">
          <span>
            <Clock3 size={14} /> Changes are recorded in the platform audit log.
          </span>
          <Link to="/dashboard">Return to workspace</Link>
        </footer>
      </div>
    </main>
  );
}
