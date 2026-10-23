import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
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
          .select("plan_key, name, description, price_inr, billing_interval, duration_days, is_active, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        if (plansError) throw plansError;
        if (!active) return;

        const nextRows = Array.isArray(subscriptionData) ? subscriptionData : [];
        const nextPlans = Array.isArray(planData) ? planData : [];
        setRows(nextRows);
        setPlans(nextPlans);
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
          setError(getErrorMessage(loadError, "Unable to load platform subscriptions."));
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
      [row.restaurant_name, row.restaurant_slug, row.plan_name, row.plan_key]
        .some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [rows, search]);

  async function assignPlan(row) {
    const planKey = draftPlanKeys[row.restaurant_id];
    const selectedPlan = plans.find((plan) => plan.plan_key === planKey);
    if (!selectedPlan || updatingRestaurantId) return;

    const confirmed = window.confirm(
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
          <Link to="/dashboard" className="platform-admin-back"><ArrowLeft size={16} /> Dashboard</Link>
          <Link to="/" className="platform-admin-brand"><img src={khaavioIcon} alt="" /> Khaavio</Link>
        </header>
        <section className="platform-admin-denied">
          <ShieldAlert size={34} />
          <h1>Platform admin access required</h1>
          <p>This account is not allowlisted to manage platform subscriptions. Ask the project administrator to add your user ID to <code>platform_admins</code>.</p>
          <Link to="/dashboard" className="platform-admin-primary">Back to restaurant dashboard</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="platform-admin-page">
      <header className="platform-admin-header">
        <Link to="/dashboard" className="platform-admin-back"><ArrowLeft size={16} /> Dashboard</Link>
        <Link to="/" className="platform-admin-brand"><img src={khaavioIcon} alt="" /> Khaavio</Link>
        <button type="button" className="platform-admin-refresh" onClick={refresh} disabled={refreshing}>
          {refreshing ? <LoaderCircle size={15} className="platform-admin-spinner" /> : <RefreshCw size={15} />}
          Refresh
        </button>
      </header>

      <div className="platform-admin-container">
        <div className="platform-admin-heading">
          <span className="platform-admin-eyebrow"><ShieldCheck size={14} /> PLATFORM OPERATIONS</span>
          <h1>Subscription management</h1>
          <p>Review restaurant access and manually assign a plan after checking payment or pilot eligibility.</p>
        </div>

        {error && <div className="platform-admin-alert platform-admin-alert-error" role="alert">{error}</div>}
        {notice && <div className="platform-admin-alert platform-admin-alert-success" role="status"><CheckCircle2 size={16} /> {notice}</div>}

        <section className="platform-admin-notice" role="note">
          <ShieldAlert size={19} />
          <p><strong>Manual billing only.</strong> Assigning a paid plan does not collect or verify payment. Confirm payment or approved pilot access outside Khaavio first. No automatic renewal or feature gating is implemented by this panel.</p>
        </section>

        <section className="platform-admin-toolbar">
          <label className="platform-admin-search">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search restaurant or current plan..." />
          </label>
          <span>{filteredRows.length} of {rows.length} restaurants</span>
        </section>

        {filteredRows.length > 0 ? (
          <section className="platform-admin-list" aria-label="Restaurant subscriptions">
            {filteredRows.map((row) => {
              const status = displayStatus(row);
              const draftKey = draftPlanKeys[row.restaurant_id] || "pilot";
              const chosenPlan = plans.find((plan) => plan.plan_key === draftKey);
              const samePlanAlreadyActive =
                chosenPlan?.plan_key === row.plan_key &&
                ["active", "trialing"].includes(row.subscription_status) &&
                status !== "expired";
              return (
                <article className="platform-admin-card" key={row.restaurant_id}>
                  <div className="platform-admin-card-top">
                    <div className="platform-admin-restaurant-icon"><Store size={21} /></div>
                    <div className="platform-admin-restaurant-copy">
                      <h2>{row.restaurant_name || "Unnamed restaurant"}</h2>
                      <p>/{row.restaurant_slug || "no-slug"}</p>
                    </div>
                    <span className={`platform-admin-status status-${status}`}>{STATUS_LABELS[status] || status}</span>
                  </div>

                  <div className="platform-admin-facts">
                    <div><span>Current plan</span><strong>{row.plan_name || "No plan assigned"}</strong></div>
                    <div><span>Current price catalog</span><strong>{row.plan_key ? formatPrice(row.plan_price_inr, row.billing_interval) : "—"}</strong></div>
                    <div><span>Starts</span><strong>{formatDate(row.starts_at)}</strong></div>
                    <div><span>Expires</span><strong>{formatDate(row.ends_at)}</strong></div>
                  </div>

                  <div className="platform-admin-assignment">
                    <label>
                      <span>Assign plan</span>
                      <select
                        value={draftKey}
                        onChange={(event) => setDraftPlanKeys((current) => ({ ...current, [row.restaurant_id]: event.target.value }))}
                        disabled={updatingRestaurantId === row.restaurant_id}
                      >
                        {plans.map((plan) => (
                          <option key={plan.plan_key} value={plan.plan_key}>
                            {plan.name} · {formatPrice(plan.price_inr, plan.billing_interval)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="platform-admin-assign-button"
                      onClick={() => assignPlan(row)}
                      disabled={!chosenPlan || updatingRestaurantId === row.restaurant_id || samePlanAlreadyActive}
                    >
                      {updatingRestaurantId === row.restaurant_id ? <LoaderCircle size={16} className="platform-admin-spinner" /> : <CreditCard size={16} />}
                      {updatingRestaurantId === row.restaurant_id ? "Saving..." : "Assign / activate"}
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
            <h2>{rows.length ? "No matching restaurants" : "No restaurants found"}</h2>
            <p>{rows.length ? "Try a different search term." : "Restaurants will appear here after onboarding."}</p>
          </section>
        )}

        <footer className="platform-admin-footer">
          <span><Clock3 size={14} /> Changes are recorded in the platform audit log.</span>
          <Link to="/dashboard">Return to workspace</Link>
        </footer>
      </div>
    </main>
  );
}
