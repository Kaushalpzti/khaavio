import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Command,
  CreditCard,
  Eye,
  EyeOff,
  Filter,
  History,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Store,
  X,
  XCircle,
} from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const hasConfig = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = hasConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: "khaavio-control-auth-v1",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: { headers: { "x-application-name": "khaavio-control-pwa" } },
    })
  : null;

const STATUS_LABELS = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment due",
  expired: "Expired",
  cancelled: "Cancelled",
  unassigned: "No plan assigned",
  pending: "Pending review",
  activated: "Activated",
  rejected: "Rejected",
};

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "restaurants", label: "Restaurants", icon: Store },
  { id: "renewals", label: "Renewal queue", icon: CreditCard },
  { id: "audit", label: "Audit trail", icon: History },
  { id: "security", label: "Security", icon: ShieldCheck },
];

function messageFor(
  error,
  fallback = "Something went wrong. Please try again.",
) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message.trim()
    : fallback;
}

function isAccessDenied(error) {
  return (
    error?.code === "42501" ||
    /platform admin access required|permission denied/i.test(
      error?.message || "",
    )
  );
}

function money(value, interval) {
  if (value == null || value === "") return "Not set";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not set";
  if (amount === 0) return "Free";
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
  if (interval === "monthly") return `${formatted}/mo`;
  if (interval === "yearly") return `${formatted}/yr`;
  return formatted;
}

function dateTime(value) {
  if (!value) return "No expiry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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

function statusTone(status) {
  if (["active", "activated"].includes(status)) return "good";
  if (["trialing", "pending"].includes(status)) return "warn";
  if (
    ["expired", "past_due", "cancelled", "rejected", "unassigned"].includes(
      status,
    )
  )
    return "bad";
  return "neutral";
}

function Badge({ status, children }) {
  return (
    <span className={`badge badge-${statusTone(status)}`}>
      <span className="badge-dot" />
      {children || STATUS_LABELS[status] || status}
    </span>
  );
}

function Brand({ compact = false }) {
  return (
    <div className={`brand-lockup${compact ? " brand-compact" : ""}`}>
      <span className="brand-mark" aria-hidden="true">
        <Command size={20} strokeWidth={2.5} />
      </span>
      <span className="brand-text">
        <strong>Khaavio</strong>
        <small>CONTROL ROOM</small>
      </span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, detail, tone = "green" }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon tone-${tone}`}>
        <Icon size={19} strokeWidth={2.1} />
      </div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function EmptyState({ icon: Icon = Store, title, description }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={22} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function LoginScreen({ onLogin, busy, error, configMissing }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setLocalError("");
    if (!email.trim() || !password) {
      setLocalError("Enter your admin email and password.");
      return;
    }
    await onLogin(email.trim(), password, setLocalError);
  }

  return (
    <main className="auth-screen">
      <div className="auth-art" aria-hidden="true">
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
        <div className="art-grid" />
        <div className="art-copy">
          <span className="eyebrow light">
            <span /> PRIVATE PLATFORM ACCESS
          </span>
          <h1>
            Your restaurant network.
            <br />
            <em>One clear view.</em>
          </h1>
          <p>
            A private operations workspace for Khaavio. Review subscriptions,
            approve verified renewals and keep every change accountable.
          </p>
          <div className="art-bottom">
            <span>
              <ShieldCheck size={16} /> Server-verified admin access
            </span>
            <span>
              <Activity size={16} /> Live data from Supabase
            </span>
          </div>
        </div>
      </div>
      <section className="auth-panel">
        <Brand />
        <div className="auth-form-wrap">
          <span className="eyebrow">
            <LockKeyhole size={13} /> ADMIN SIGN IN
          </span>
          <h2>Welcome back.</h2>
          <p className="auth-subtitle">
            Sign in with the existing allowlisted Khaavio admin account.
          </p>
          {configMissing ? (
            <div className="callout callout-error">
              <AlertTriangle size={17} />
              <div>
                <strong>Supabase environment missing</strong>
                <p>
                  Copy <code>.env.example</code> to <code>.env.local</code>,
                  then add the existing Khaavio project URL and publishable/anon
                  key.
                </p>
              </div>
            </div>
          ) : null}
          {(error || localError) && (
            <div className="inline-error" role="alert">
              <AlertTriangle size={16} />
              {localError || error}
            </div>
          )}
          <form className="login-form" onSubmit={submit}>
            <label>
              Email address
              <span className="input-shell">
                <Mail size={17} />
                <input
                  autoComplete="username"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@khaavio.in"
                  required
                  disabled={busy || configMissing}
                />
              </span>
            </label>
            <label>
              Password
              <span className="input-shell">
                <KeyRound size={17} />
                <input
                  autoComplete="current-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter admin password"
                  required
                  disabled={busy || configMissing}
                />
                <button
                  className="input-icon-button"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            <button
              className="button button-primary button-full"
              type="submit"
              disabled={busy || configMissing}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <LockKeyhole size={17} />
              )}
              {busy ? "Verifying admin access…" : "Secure sign in"}
              <ChevronRight size={16} />
            </button>
          </form>
          <div className="auth-assurance">
            <ShieldCheck size={17} />
            <div>
              <strong>No public sign-up</strong>
              <span>
                Login alone does not grant access. The database checks your
                account against the platform admin allowlist.
              </span>
            </div>
          </div>
        </div>
        <p className="auth-footer">
          Khaavio Control · Private operations · v1.0.0
        </p>
      </section>
    </main>
  );
}

function Header({
  user,
  activeTab,
  setActiveTab,
  onRefresh,
  refreshing,
  onSignOut,
  onInstall,
  canInstall,
  mobileMenu,
  setMobileMenu,
}) {
  const title =
    NAV_ITEMS.find((item) => item.id === activeTab)?.label || "Overview";
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="mobile-menu-toggle"
          type="button"
          onClick={() => setMobileMenu((open) => !open)}
          aria-label="Toggle navigation"
        >
          {mobileMenu ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="mobile-brand">
          <Brand compact />
        </div>
        <div className="breadcrumbs">
          <span>Platform</span>
          <ChevronRight size={14} />
          <strong>{title}</strong>
        </div>
      </div>
      <div className="topbar-actions">
        {canInstall && (
          <button
            className="button button-install"
            type="button"
            onClick={onInstall}
          >
            <Smartphone size={16} /> Install app
          </button>
        )}
        <button
          className="icon-button refresh-button"
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh data"
          aria-label="Refresh data"
        >
          <RefreshCw size={17} className={refreshing ? "spin" : ""} />
        </button>
        <span className="topbar-divider" />
        <div className="profile-chip">
          <span className="profile-avatar">
            {(user?.email || "A").charAt(0).toUpperCase()}
          </span>
          <span className="profile-info">
            <strong>{user?.email || "Platform admin"}</strong>
            <small>
              <i /> Super Admin
            </small>
          </span>
        </div>
        <button
          className="icon-button signout-button"
          type="button"
          onClick={onSignOut}
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={17} />
        </button>
      </div>
      {mobileMenu && (
        <div className="mobile-nav">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={
                activeTab === id ? "mobile-nav-item active" : "mobile-nav-item"
              }
              onClick={() => {
                setActiveTab(id);
                setMobileMenu(false);
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

function Sidebar({ activeTab, setActiveTab, pendingCount, user }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Brand />
      </div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Admin navigation">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-item${activeTab === id ? " active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={18} strokeWidth={activeTab === id ? 2.3 : 1.9} />
            <span>{label}</span>
            {id === "renewals" && pendingCount > 0 ? (
              <span className="nav-count">{pendingCount}</span>
            ) : null}
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-security">
        <span className="security-shield">
          <ShieldCheck size={18} />
        </span>
        <strong>Protected session</strong>
        <p>
          Actions are verified by Supabase. Sensitive data stays online-only.
        </p>
        <span className="connection-status">
          <i /> Secure connection
        </span>
      </div>
      <div className="sidebar-bottom">
        <span className="profile-avatar sidebar-avatar">
          {(user?.email || "A").charAt(0).toUpperCase()}
        </span>
        <span>
          <strong>{user?.email || "Admin account"}</strong>
          <small>Primary operator</small>
        </span>
        <BadgeCheck size={16} className="sidebar-verified" />
      </div>
    </aside>
  );
}

function Overview({ rows, renewalRequests, auditLogs, onGo, nowMs }) {
  const total = rows.length;
  const active = rows.filter((row) => displayStatus(row) === "active").length;
  const trialing = rows.filter(
    (row) => displayStatus(row) === "trialing",
  ).length;
  const expiring = nowMs
    ? rows.filter(
        (row) =>
          row.ends_at &&
          ["active", "trialing"].includes(row.subscription_status) &&
          new Date(row.ends_at).getTime() > nowMs &&
          new Date(row.ends_at).getTime() <= nowMs + 7 * 86400000,
      ).length
    : 0;
  const pending = renewalRequests.filter(
    (request) => request.request_status === "pending",
  ).length;
  const recentAudit = auditLogs.slice(0, 5);
  const recentPending = renewalRequests
    .filter((request) => request.request_status === "pending")
    .slice(0, 4);

  return (
    <div className="page-content">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-pulse" /> PLATFORM OVERVIEW
          </span>
          <h1>Good to see you, operator.</h1>
          <p>
            A clear view of your restaurants, subscriptions and anything that
            needs attention.
          </p>
        </div>
        <div className="heading-mark">
          <Activity size={19} />
          <span>Live workspace</span>
        </div>
      </div>
      <div className="stat-grid">
        <StatCard
          icon={Building2}
          label="Total restaurants"
          value={total}
          detail="All onboarded workspaces"
        />
        <StatCard
          icon={BadgeCheck}
          label="Active subscriptions"
          value={active}
          detail="Paid / approved active plans"
          tone="mint"
        />
        <StatCard
          icon={Clock3}
          label="Free trials"
          value={trialing}
          detail="Restaurants trialling Khaavio"
          tone="gold"
        />
        <StatCard
          icon={BellRing}
          label="Renewals pending"
          value={pending}
          detail={
            expiring
              ? `${expiring} subscription${expiring === 1 ? "" : "s"} expiring in 7 days`
              : "Awaiting manual review"
          }
          tone={pending ? "orange" : "mint"}
        />
      </div>
      <div className="overview-grid">
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NEEDS ATTENTION</span>
              <h2>Renewal requests</h2>
              <p>Verify the payment outside Khaavio before activating.</p>
            </div>
            <span className="panel-count">{pending} open</span>
          </div>
          {recentPending.length ? (
            <div className="compact-list">
              {recentPending.map((request) => (
                <div className="compact-row" key={request.request_id}>
                  <span className="compact-icon">
                    <CreditCard size={17} />
                  </span>
                  <div className="compact-main">
                    <strong>
                      {request.restaurant_name || "Unnamed restaurant"}
                    </strong>
                    <span>
                      {request.plan_name} · {request.billing_interval}
                    </span>
                  </div>
                  <div className="compact-end">
                    <strong>
                      {money(
                        request.catalog_price_inr,
                        request.billing_interval,
                      )}
                    </strong>
                    <Badge status="pending" />
                  </div>
                </div>
              ))}
              <button
                className="text-action"
                type="button"
                onClick={() => onGo("renewals")}
              >
                Review all requests <ArrowUpRight size={15} />
              </button>
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="You're all caught up"
              description="There are no pending subscription requests right now."
            />
          )}
        </section>
        <section className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">QUICK ACCESS</span>
              <h2>Platform tools</h2>
              <p>Jump straight into a common operation.</p>
            </div>
          </div>
          <div className="quick-actions">
            <button type="button" onClick={() => onGo("restaurants")}>
              <span className="quick-action-icon">
                <Store size={18} />
              </span>
              <span>
                <strong>Manage restaurants</strong>
                <small>Search workspace and plans</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button type="button" onClick={() => onGo("renewals")}>
              <span className="quick-action-icon gold">
                <CreditCard size={18} />
              </span>
              <span>
                <strong>Process a renewal</strong>
                <small>Verify, activate or reject</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button type="button" onClick={() => onGo("audit")}>
              <span className="quick-action-icon lilac">
                <History size={18} />
              </span>
              <span>
                <strong>Review activity</strong>
                <small>See recent plan changes</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button type="button" onClick={() => onGo("security")}>
              <span className="quick-action-icon blue">
                <ShieldCheck size={18} />
              </span>
              <span>
                <strong>Security & access</strong>
                <small>Check your private session</small>
              </span>
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
      </div>
      <section className="panel audit-preview">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RECENT ACTIVITY</span>
            <h2>Latest subscription changes</h2>
          </div>
          <button
            className="text-action"
            type="button"
            onClick={() => onGo("audit")}
          >
            View audit trail <ArrowUpRight size={15} />
          </button>
        </div>
        {recentAudit.length ? (
          <div className="activity-list">
            {recentAudit.map((entry) => (
              <div className="activity-row" key={entry.id}>
                <span className="activity-check">
                  <Check size={15} />
                </span>
                <div className="activity-description">
                  <strong>{entry.restaurant_name || "Restaurant"}</strong>
                  <span>
                    {entry.previous_plan_key || "No plan"} →{" "}
                    {entry.new_plan_key} · {entry.new_status}
                  </span>
                </div>
                <time>{dateTime(entry.created_at)}</time>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={History}
            title="No activity recorded yet"
            description="Plan changes made through the protected admin tools will appear here."
          />
        )}
      </section>
      <div className="disclaimer-strip">
        <ShieldCheck size={16} />
        <p>
          <strong>Manual billing mode.</strong> This panel records admin
          actions; it does not collect payments or automatically verify bank/UPI
          transactions.
        </p>
      </div>
    </div>
  );
}

function Restaurants({
  rows,
  plans,
  draftPlanKeys,
  setDraftPlanKeys,
  updatingRestaurantId,
  onAssign,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
}) {
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const status = displayStatus(row);
      const matchesQuery =
        !query ||
        [
          row.restaurant_name,
          row.restaurant_slug,
          row.plan_name,
          row.plan_key,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(query),
        );
      return (
        matchesQuery && (statusFilter === "all" || status === statusFilter)
      );
    });
  }, [rows, search, statusFilter]);

  return (
    <div className="page-content">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">WORKSPACE DIRECTORY</span>
          <h1>Restaurants</h1>
          <p>
            Review current access and assign an approved plan to a restaurant.
          </p>
        </div>
        <span className="section-total">
          <Store size={15} />
          {rows.length} total
        </span>
      </div>
      <section className="panel directory-panel">
        <div className="directory-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search restaurant, slug or plan…"
            />
            <kbd>⌘ K</kbd>
          </label>
          <label className="filter-field">
            <Filter size={16} />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="trialing">Free trial</option>
              <option value="expired">Expired</option>
              <option value="past_due">Payment due</option>
              <option value="unassigned">No plan</option>
            </select>
          </label>
        </div>
        {filtered.length ? (
          <div className="restaurant-list">
            {filtered.map((row) => {
              const status = displayStatus(row);
              const draftKey =
                draftPlanKeys[row.restaurant_id] ||
                (plans.some((plan) => plan.plan_key === row.plan_key)
                  ? row.plan_key
                  : plans[0]?.plan_key || "");
              const selectedPlan = plans.find(
                (plan) => plan.plan_key === draftKey,
              );
              const samePlanAlreadyActive =
                selectedPlan?.plan_key === row.plan_key &&
                ["active", "trialing"].includes(row.subscription_status) &&
                status !== "expired";
              return (
                <article className="restaurant-card" key={row.restaurant_id}>
                  <div className="restaurant-card-head">
                    <span className="restaurant-avatar">
                      <Store size={20} />
                    </span>
                    <div className="restaurant-title">
                      <h3>{row.restaurant_name || "Unnamed restaurant"}</h3>
                      <span>/{row.restaurant_slug || "no-slug"}</span>
                    </div>
                    <Badge status={status} />
                  </div>
                  <div className="restaurant-metrics">
                    <div>
                      <span>Current plan</span>
                      <strong>{row.plan_name || "No plan assigned"}</strong>
                      <small>
                        {row.plan_key
                          ? money(row.plan_price_inr, row.billing_interval)
                          : "—"}
                      </small>
                    </div>
                    <div>
                      <span>Started</span>
                      <strong>{dateTime(row.starts_at)}</strong>
                    </div>
                    <div>
                      <span>Expires</span>
                      <strong>{dateTime(row.ends_at)}</strong>
                    </div>
                  </div>
                  <div className="assign-row">
                    <label>
                      <span>New access plan</span>
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
                            {money(plan.price_inr, plan.billing_interval)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => onAssign(row, selectedPlan)}
                      disabled={
                        !selectedPlan ||
                        Boolean(updatingRestaurantId) ||
                        samePlanAlreadyActive
                      }
                    >
                      {updatingRestaurantId === row.restaurant_id ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <CreditCard size={16} />
                      )}
                      {updatingRestaurantId === row.restaurant_id
                        ? "Saving…"
                        : "Assign plan"}
                    </button>
                  </div>
                  <p className="card-footnote">
                    {selectedPlan?.plan_key === "trial"
                      ? "Begins a fresh trial period from now."
                      : selectedPlan?.plan_key === "pilot"
                        ? "Pilot Access has no scheduled expiry."
                        : `Starts a new ${selectedPlan?.billing_interval || "manual"} period from now.`}
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Store}
            title={
              rows.length ? "No matching restaurants" : "No restaurants yet"
            }
            description={
              rows.length
                ? "Try another search or status filter."
                : "New restaurant workspaces will appear after onboarding."
            }
          />
        )}
        <div className="panel-foot">
          <span>
            Showing {filtered.length} of {rows.length} workspaces
          </span>
          <span>
            <ShieldCheck size={14} /> Plan changes are audit-logged
          </span>
        </div>
      </section>
    </div>
  );
}

function RenewalQueue({
  requests,
  loadingError,
  resolvingRequestId,
  onResolve,
  onRefresh,
}) {
  const [filter, setFilter] = useState("pending");
  const filtered = requests.filter(
    (request) => filter === "all" || request.request_status === filter,
  );
  const pendingCount = requests.filter(
    (request) => request.request_status === "pending",
  ).length;
  return (
    <div className="page-content">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">BILLING OPERATIONS</span>
          <h1>Renewal queue</h1>
          <p>
            Review plan requests, verify payment outside Khaavio and record your
            decision.
          </p>
        </div>
        <div className="heading-actions">
          <span className="panel-count">{pendingCount} pending</span>
          <button
            className="button button-secondary"
            type="button"
            onClick={onRefresh}
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>
      <div className="callout callout-warning">
        <AlertTriangle size={18} />
        <div>
          <strong>Verify payment independently</strong>
          <p>
            Never trust a screenshot alone. Check the UPI/bank reference in your
            payment app or statement before activating a paid plan. Khaavio does
            not collect payments here.
          </p>
        </div>
      </div>
      {loadingError ? (
        <div className="callout callout-error">
          <AlertTriangle size={17} />
          <div>
            <strong>Renewal queue unavailable</strong>
            <p>{loadingError}</p>
            <small>
              Check that the existing subscription-renewal migration is
              installed in the connected Supabase project.
            </small>
          </div>
        </div>
      ) : null}
      <section className="panel renewal-panel">
        <div className="directory-toolbar">
          <div
            className="segmented-filter"
            role="group"
            aria-label="Filter requests"
          >
            {[
              ["pending", "Pending"],
              ["activated", "Activated"],
              ["rejected", "Rejected"],
              ["all", "All requests"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filter === id ? "selected" : ""}
                onClick={() => setFilter(id)}
              >
                {label}
                {id === "pending" ? <em>{pendingCount}</em> : null}
              </button>
            ))}
          </div>
          <span className="muted-count">
            {filtered.length} request{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
        {filtered.length ? (
          <div className="renewal-list">
            {filtered.map((request) => (
              <article className="renewal-card" key={request.request_id}>
                <div className="renewal-card-header">
                  <span className="renewal-icon">
                    <CreditCard size={18} />
                  </span>
                  <div className="renewal-heading">
                    <h3>{request.restaurant_name || "Unnamed restaurant"}</h3>
                    <span>
                      /{request.restaurant_slug || "no-slug"} · Requested{" "}
                      {dateTime(request.created_at)}
                    </span>
                  </div>
                  <Badge status={request.request_status} />
                </div>
                <div className="renewal-facts">
                  <div>
                    <span>Plan requested</span>
                    <strong>
                      {request.plan_name} · {request.billing_interval}
                    </strong>
                  </div>
                  <div>
                    <span>Catalog price</span>
                    <strong>
                      {money(
                        request.catalog_price_inr,
                        request.billing_interval,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Founding offer</span>
                    <strong>
                      {request.founding_offer_requested
                        ? "Requested — verify eligibility"
                        : "Not requested"}
                    </strong>
                  </div>
                  {request.confirmed_amount_inr != null ? (
                    <div>
                      <span>Amount verified</span>
                      <strong>
                        {money(
                          request.confirmed_amount_inr,
                          request.billing_interval,
                        )}
                      </strong>
                    </div>
                  ) : null}
                </div>
                {request.request_note ? (
                  <div className="note-block">
                    <span>Owner note</span>
                    <p>{request.request_note}</p>
                  </div>
                ) : null}
                {request.payment_reference ? (
                  <div className="reference-block">
                    <span>Payment reference</span>
                    <strong>{request.payment_reference}</strong>
                  </div>
                ) : null}
                {request.admin_note ? (
                  <div className="note-block">
                    <span>Admin note</span>
                    <p>{request.admin_note}</p>
                  </div>
                ) : null}
                {request.request_status === "pending" ? (
                  <div className="renewal-actions">
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={Boolean(resolvingRequestId)}
                      onClick={() => onResolve(request, "activate")}
                    >
                      {resolvingRequestId === request.request_id ? (
                        <LoaderCircle size={15} className="spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}{" "}
                      Verify payment & activate
                    </button>
                    <button
                      className="button button-danger-outline"
                      type="button"
                      disabled={Boolean(resolvingRequestId)}
                      onClick={() => onResolve(request, "reject")}
                    >
                      <XCircle size={16} /> Reject request
                    </button>
                  </div>
                ) : (
                  <div className="resolved-meta">
                    <CheckCircle2 size={14} />{" "}
                    {request.request_status === "activated"
                      ? `Activated ${request.resolved_at ? `on ${dateTime(request.resolved_at)}` : ""}`
                      : `Rejected ${request.resolved_at ? `on ${dateTime(request.resolved_at)}` : ""}`}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={filter === "pending" ? CheckCircle2 : CreditCard}
            title={
              filter === "pending"
                ? "No pending requests"
                : "No requests in this view"
            }
            description={
              filter === "pending"
                ? "No one is waiting for renewal approval right now."
                : "Choose another status filter to see more requests."
            }
          />
        )}
      </section>
    </div>
  );
}

function AuditTrail({ logs, error, onRefresh }) {
  return (
    <div className="page-content">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">ACCOUNTABILITY</span>
          <h1>Audit trail</h1>
          <p>
            Recent plan assignments, who made them and when they took effect.
          </p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={onRefresh}
        >
          <RefreshCw size={15} /> Refresh log
        </button>
      </div>
      {error ? (
        <div className="callout callout-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Audit RPC needs installing</strong>
            <p>{error}</p>
            <small>
              Run <code>supabase/khaavio-superadmin-pwa-migration.sql</code> in
              the connected Supabase SQL Editor.
            </small>
          </div>
        </div>
      ) : null}
      <section className="panel audit-table-panel">
        {logs.length ? (
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Plan change</th>
                  <th>Status</th>
                  <th>Effective period</th>
                  <th>Performed at</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.restaurant_name || "Restaurant"}</strong>
                      <small>
                        {String(entry.restaurant_id || "").slice(0, 8)}…
                      </small>
                    </td>
                    <td>
                      <span className="plan-change">
                        <b>{entry.previous_plan_key || "None"}</b>
                        <ArrowUpRight size={14} />
                        <b>{entry.new_plan_key}</b>
                      </span>
                    </td>
                    <td>
                      <Badge status={entry.new_status} />
                    </td>
                    <td>
                      <span>{dateTime(entry.starts_at)}</span>
                      <small>
                        Until{" "}
                        {entry.ends_at ? dateTime(entry.ends_at) : "No expiry"}
                      </small>
                    </td>
                    <td>{dateTime(entry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={History}
            title={
              error
                ? "Audit trail is not connected yet"
                : "No recorded activity"
            }
            description={
              error
                ? "Install the small audit-list RPC migration to enable this view."
                : "Changes made through protected subscription operations will show here."
            }
          />
        )}
      </section>
      <div className="disclaimer-strip">
        <LockKeyhole size={16} />
        <p>
          Audit data is read through a security-definer RPC that checks the same
          database allowlist used by subscription administration.
        </p>
      </div>
    </div>
  );
}

function Security({ user, lastSynced, onSignOut }) {
  return (
    <div className="page-content">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">PRIVATE ACCESS</span>
          <h1>Security & access</h1>
          <p>
            Confirm the account and protections used by this standalone admin
            app.
          </p>
        </div>
        <span className="secure-pill">
          <ShieldCheck size={15} /> Allowlist verified
        </span>
      </div>
      <div className="security-grid">
        <section className="panel account-panel">
          <div className="security-panel-heading">
            <span className="security-large-icon">
              <KeyRound size={22} />
            </span>
            <div>
              <h2>Signed-in account</h2>
              <p>Authenticated by your existing Khaavio Supabase project.</p>
            </div>
          </div>
          <div className="security-detail">
            <span>Admin email</span>
            <strong>{user?.email || "Unavailable"}</strong>
          </div>
          <div className="security-detail">
            <span>Account ID</span>
            <code>{user?.id || "Unavailable"}</code>
          </div>
          <div className="security-detail">
            <span>Last data sync</span>
            <strong>
              {lastSynced ? dateTime(lastSynced) : "Not synced yet"}
            </strong>
          </div>
          <div className="security-detail">
            <span>Role check</span>
            <Badge status="active">Approved by backend</Badge>
          </div>
          <button
            className="button button-danger-outline button-full"
            type="button"
            onClick={onSignOut}
          >
            <LogOut size={16} /> Sign out of this admin PWA
          </button>
        </section>
        <section className="panel safeguards-panel">
          <div className="security-panel-heading">
            <span className="security-large-icon green">
              <ShieldCheck size={22} />
            </span>
            <div>
              <h2>Protection checklist</h2>
              <p>
                What this separate app does to keep admin actions constrained.
              </p>
            </div>
          </div>
          <div className="safeguard-row">
            <span className="safeguard-check">
              <Check size={14} />
            </span>
            <div>
              <strong>No public sign-up</strong>
              <p>Only existing Supabase identities can sign in.</p>
            </div>
          </div>
          <div className="safeguard-row">
            <span className="safeguard-check">
              <Check size={14} />
            </span>
            <div>
              <strong>Server-side allowlist</strong>
              <p>
                Dashboard data loads only after the protected admin RPC accepts
                the account.
              </p>
            </div>
          </div>
          <div className="safeguard-row">
            <span className="safeguard-check">
              <Check size={14} />
            </span>
            <div>
              <strong>No service-role key</strong>
              <p>The browser app uses only the public anon/publishable key.</p>
            </div>
          </div>
          <div className="safeguard-row">
            <span className="safeguard-check">
              <Check size={14} />
            </span>
            <div>
              <strong>Sensitive responses are not cached</strong>
              <p>
                The PWA worker only caches static app-shell assets; Supabase
                requests always go to the network.
              </p>
            </div>
          </div>
          <div className="safeguard-row">
            <span className="safeguard-check">
              <Check size={14} />
            </span>
            <div>
              <strong>Separate install identity</strong>
              <p>
                A dedicated origin gives this PWA its own icon, manifest,
                session storage namespace and service worker.
              </p>
            </div>
          </div>
        </section>
      </div>
      <div className="callout callout-warning">
        <AlertTriangle size={18} />
        <div>
          <strong>Use this PWA on a trusted device</strong>
          <p>
            Keep your device locked, never share admin credentials, and sign out
            when finished on a shared computer. The app name or hidden URL is
            not the security boundary; Supabase authorization is.
          </p>
        </div>
      </div>
    </div>
  );
}

function ResolutionModal({
  request,
  decision,
  busy,
  error,
  onClose,
  onSubmit,
}) {
  const [amount, setAmount] = useState(
    request?.founding_offer_requested
      ? ""
      : String(request?.catalog_price_inr ?? ""),
  );
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");

  if (!request) return null;

  function submit(event) {
    event.preventDefault();
    setLocalError("");
    if (decision === "activate") {
      const amountValue = Number(amount);
      if (
        !Number.isFinite(amountValue) ||
        amountValue <= 0 ||
        amountValue > Number(request.catalog_price_inr)
      ) {
        setLocalError(
          "Enter the amount actually received, greater than ₹0 and no higher than the catalog price.",
        );
        return;
      }
      if (reference.trim().length < 4) {
        setLocalError(
          "Enter a verified UPI/bank payment reference or UTR (at least 4 characters).",
        );
        return;
      }
    }
    onSubmit({
      amount: decision === "activate" ? Number(amount) : null,
      reference: decision === "activate" ? reference.trim() : null,
      note: note.trim() || null,
      setLocalError,
    });
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="resolution-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resolution-title"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          disabled={busy}
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>
        <span
          className={`modal-symbol ${decision === "activate" ? "modal-symbol-green" : "modal-symbol-red"}`}
        >
          {decision === "activate" ? (
            <CheckCircle2 size={22} />
          ) : (
            <XCircle size={22} />
          )}
        </span>
        <span className="eyebrow">
          {decision === "activate" ? "PAYMENT VERIFICATION" : "REQUEST REVIEW"}
        </span>
        <h2 id="resolution-title">
          {decision === "activate" ? "Verify & activate" : "Reject request"}
        </h2>
        <p className="modal-intro">
          {decision === "activate"
            ? `Activate ${request.plan_name} for ${request.restaurant_name} only after independently verifying payment.`
            : `Reject the plan request submitted by ${request.restaurant_name}.`}
        </p>
        <div className="modal-summary">
          <span>
            Requested plan
            <strong>
              {request.plan_name} · {request.billing_interval}
            </strong>
          </span>
          <span>
            Catalog price
            <strong>
              {money(request.catalog_price_inr, request.billing_interval)}
            </strong>
          </span>
          {request.founding_offer_requested ? (
            <p className="founding-note">
              <AlertTriangle size={15} /> Founding offer requested: confirm
              eligibility and agreed amount manually.
            </p>
          ) : null}
        </div>
        {decision === "activate" ? (
          <form onSubmit={submit} className="resolution-form">
            <label>
              Amount received (INR)
              <input
                type="number"
                min="1"
                max={Number(request.catalog_price_inr)}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                placeholder="Amount actually received"
              />
            </label>
            <label>
              Verified UPI / bank reference or UTR
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                minLength={4}
                maxLength={160}
                required
                placeholder="Enter payment reference"
              />
            </label>
            <label>
              Admin note (optional)
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Offer eligibility or payment context"
              />
            </label>
            <div className="inline-warning">
              <AlertTriangle size={15} />
              <span>
                Payment is not collected by Khaavio. Verify the credit in your
                payment app or bank statement.
              </span>
            </div>
            {(localError || error) && (
              <div className="inline-error">
                <AlertTriangle size={15} />
                {localError || error}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {busy ? "Saving decision…" : "Verify & activate"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submit} className="resolution-form">
            <label>
              Reason / admin note (optional)
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Add a brief reason for the restaurant owner"
              />
            </label>
            {(localError || error) && (
              <div className="inline-error">
                <AlertTriangle size={15} />
                {localError || error}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-danger"
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <XCircle size={16} />
                )}
                {busy ? "Saving decision…" : "Reject request"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

export default function App() {
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const initialTick = window.setTimeout(() => setNowMs(Date.now()), 0);
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(intervalId);
    };
  }, []);
  const [authStatus, setAuthStatus] = useState(
    hasConfig ? "booting" : "configMissing",
  );
  const [authError, setAuthError] = useState("");
  const [busyAuth, setBusyAuth] = useState(false);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [rows, setRows] = useState([]);
  const [plans, setPlans] = useState([]);
  const [renewalRequests, setRenewalRequests] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditError, setAuditError] = useState("");
  const [renewalError, setRenewalError] = useState("");
  const [dataError, setDataError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [draftPlanKeys, setDraftPlanKeys] = useState({});
  const [updatingRestaurantId, setUpdatingRestaurantId] = useState("");
  const [resolvingRequestId, setResolvingRequestId] = useState("");
  const [resolution, setResolution] = useState(null);
  const [resolutionError, setResolutionError] = useState("");
  const [toast, setToast] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const operationId = useRef(0);

  useEffect(() => {
    const handleBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const verifyAndLoad = useCallback(async ({ silent = false } = {}) => {
    if (!supabase) {
      setAuthStatus("configMissing");
      return false;
    }
    const thisOperation = ++operationId.current;
    setAuthError("");
    setDataError("");
    if (!silent) setAuthStatus("checking");
    else setRefreshing(true);
    try {
      const {
        data: { user: verifiedUser },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!verifiedUser) {
        setUser(null);
        setAuthStatus("signedOut");
        setRefreshing(false);
        return false;
      }

      // This protected RPC is the security gate. Client-side route hiding is not relied on.
      const { data: subscriptionData, error: subscriptionError } =
        await supabase.rpc("platform_admin_list_subscriptions");
      if (subscriptionError) {
        if (isAccessDenied(subscriptionError)) {
          await supabase.auth.signOut();
          setUser(null);
          setAuthStatus("denied");
          setAuthError(
            "This account is not in the platform_admins allowlist. Ask the database owner to verify the approved admin UUID.",
          );
          setRefreshing(false);
          return false;
        }
        throw subscriptionError;
      }
      if (thisOperation !== operationId.current) return false;

      const [planResult, renewalResult, auditResult] = await Promise.all([
        supabase
          .from("subscription_plans")
          .select(
            "plan_key, name, description, price_inr, billing_interval, duration_days, is_active, sort_order",
          )
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase.rpc("platform_admin_list_renewal_requests"),
        supabase.rpc("platform_admin_list_audit_logs"),
      ]);
      if (thisOperation !== operationId.current) return false;
      if (planResult.error) throw planResult.error;

      const nextRows = Array.isArray(subscriptionData) ? subscriptionData : [];
      const nextPlans = Array.isArray(planResult.data) ? planResult.data : [];
      setRows(nextRows);
      setPlans(nextPlans);
      setUser(verifiedUser);
      setDraftPlanKeys(
        Object.fromEntries(
          nextRows.map((row) => [
            row.restaurant_id,
            nextPlans.some((plan) => plan.plan_key === row.plan_key)
              ? row.plan_key
              : nextPlans.some((plan) => plan.plan_key === "pilot")
                ? "pilot"
                : nextPlans[0]?.plan_key || "",
          ]),
        ),
      );
      setRenewalRequests(
        Array.isArray(renewalResult.data) && !renewalResult.error
          ? renewalResult.data
          : [],
      );
      setRenewalError(
        renewalResult.error
          ? messageFor(renewalResult.error, "Could not load renewal requests.")
          : "",
      );
      setAuditLogs(
        Array.isArray(auditResult.data) && !auditResult.error
          ? auditResult.data
          : [],
      );
      setAuditError(
        auditResult.error
          ? messageFor(auditResult.error, "Could not load audit trail.")
          : "",
      );
      setLastSynced(new Date());
      setAuthStatus("ready");
      return true;
    } catch (error) {
      if (thisOperation === operationId.current) {
        if (isAccessDenied(error)) {
          await supabase.auth.signOut();
          setUser(null);
          setAuthStatus("denied");
          setAuthError(
            "This account is not allowlisted for Khaavio platform administration.",
          );
        } else {
          setDataError(
            messageFor(error, "Unable to load the admin workspace."),
          );
          // If the session could not be verified, fail closed and ask for sign-in again.
          if (
            /jwt|token|session|not authenticated/i.test(error?.message || "")
          ) {
            await supabase.auth.signOut();
            setUser(null);
            setAuthStatus("signedOut");
            setAuthError(
              "Your session needs to be renewed. Please sign in again.",
            );
          } else {
            setAuthStatus("error");
          }
        }
      }
      return false;
    } finally {
      if (thisOperation === operationId.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function boot() {
      if (!supabase) {
        setAuthStatus("configMissing");
        return;
      }
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (!active) return;
        if (error) throw error;
        if (!session) {
          setAuthStatus("signedOut");
          return;
        }
        await verifyAndLoad();
      } catch (error) {
        if (active) {
          setAuthStatus("signedOut");
          setAuthError(
            messageFor(
              error,
              "Could not restore your session. Please sign in.",
            ),
          );
        }
      }
    }
    boot();
    return () => {
      active = false;
      operationId.current += 1;
    };
  }, [verifyAndLoad]);

  const handleLogin = useCallback(
    async (email, password, setLocalError) => {
      if (!supabase) return;
      setBusyAuth(true);
      setAuthError("");
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        const ok = await verifyAndLoad();
        if (!ok && authStatus !== "denied")
          setLocalError(
            "Could not verify admin access. Check the allowlist and Supabase connection.",
          );
      } catch (error) {
        const friendly = /invalid login credentials/i.test(error?.message || "")
          ? "Email or password is incorrect."
          : messageFor(error, "Sign-in failed. Please try again.");
        setLocalError(friendly);
        setAuthError(friendly);
        await supabase.auth.signOut().catch(() => {});
        setAuthStatus("signedOut");
      } finally {
        setBusyAuth(false);
      }
    },
    [verifyAndLoad, authStatus],
  );

  const handleSignOut = useCallback(async () => {
    operationId.current += 1;
    setResolution(null);
    setUser(null);
    setRows([]);
    setPlans([]);
    setRenewalRequests([]);
    setAuditLogs([]);
    await supabase?.auth.signOut();
    setAuthError("");
    setDataError("");
    setAuthStatus("signedOut");
    setActiveTab("overview");
  }, []);

  const showToast = useCallback((kind, title, detail = "") => {
    setToast({ kind, title, detail });
    window.setTimeout(
      () => setToast((current) => (current?.title === title ? null : current)),
      4500,
    );
  }, []);

  const doRefresh = useCallback(async () => {
    const ok = await verifyAndLoad({ silent: true });
    if (ok)
      showToast(
        "success",
        "Workspace refreshed",
        `Updated ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
      );
  }, [verifyAndLoad, showToast]);

  const assignPlan = useCallback(
    async (row, selectedPlan) => {
      if (!supabase || !selectedPlan || updatingRestaurantId) return;
      const approved = window.confirm(
        `Assign ${selectedPlan.name} to ${row.restaurant_name}?\n\nThis replaces the current subscription period and starts the new period now. Khaavio does not collect or verify payment in this action. Confirm only after handling payment manually, unless assigning approved Pilot Access or a trial.`,
      );
      if (!approved) return;
      setDataError("");
      setUpdatingRestaurantId(row.restaurant_id);
      try {
        const { error } = await supabase.rpc("platform_admin_assign_plan", {
          p_restaurant_id: row.restaurant_id,
          p_plan_key: selectedPlan.plan_key,
        });
        if (error) throw error;
        showToast(
          "success",
          "Plan assigned",
          `${selectedPlan.name} → ${row.restaurant_name}`,
        );
        await verifyAndLoad({ silent: true });
      } catch (error) {
        setDataError(messageFor(error, "Could not assign this plan."));
      } finally {
        setUpdatingRestaurantId("");
      }
    },
    [updatingRestaurantId, showToast, verifyAndLoad],
  );

  const openResolution = useCallback((request, decision) => {
    setResolution({ request, decision });
    setResolutionError("");
  }, []);

  const submitResolution = useCallback(
    async ({ amount, reference, note, setLocalError }) => {
      if (!supabase || !resolution) return;
      const { request, decision } = resolution;
      const confirmed =
        decision === "activate"
          ? window.confirm(
              `You are recording a verified payment for ${request.restaurant_name}.\n\nOnly continue if the amount and reference match your bank/UPI statement. Activate ${request.plan_name} now?`,
            )
          : window.confirm(
              `Reject the plan request from ${request.restaurant_name}?`,
            );
      if (!confirmed) return;
      setResolutionError("");
      setResolvingRequestId(request.request_id);
      try {
        const { error } = await supabase.rpc(
          "platform_admin_resolve_renewal_request",
          {
            p_request_id: request.request_id,
            p_decision: decision,
            p_confirmed_amount_inr: amount,
            p_payment_reference: reference,
            p_admin_note: note,
          },
        );
        if (error) throw error;
        setResolution(null);
        showToast(
          "success",
          decision === "activate"
            ? "Payment recorded & plan activated"
            : "Request rejected",
          `${request.restaurant_name} · ${request.plan_name}`,
        );
        await verifyAndLoad({ silent: true });
      } catch (error) {
        const friendly = messageFor(
          error,
          "Could not resolve the renewal request.",
        );
        setResolutionError(friendly);
        setLocalError?.(friendly);
      } finally {
        setResolvingRequestId("");
      }
    },
    [resolution, showToast, verifyAndLoad],
  );

  const installApp = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  const pendingCount = useMemo(
    () =>
      renewalRequests.filter((request) => request.request_status === "pending")
        .length,
    [renewalRequests],
  );

  if (authStatus === "booting" || authStatus === "checking") {
    return (
      <main className="boot-screen">
        <div className="boot-orb">
          <Command size={27} />
        </div>
        <Brand />
        <div className="boot-spinner">
          <LoaderCircle size={18} className="spin" />
          {authStatus === "checking"
            ? "Verifying the platform allowlist…"
            : "Restoring secure session…"}
        </div>
        <p>Private Khaavio operations</p>
      </main>
    );
  }
  if (authStatus !== "ready") {
    return (
      <LoginScreen
        onLogin={handleLogin}
        busy={busyAuth}
        error={authError || dataError}
        configMissing={!hasConfig || authStatus === "configMissing"}
      />
    );
  }

  return (
    <div className="admin-app">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingCount={pendingCount}
        user={user}
      />
      <div className="main-column">
        <Header
          user={user}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onRefresh={doRefresh}
          refreshing={refreshing}
          onSignOut={handleSignOut}
          onInstall={installApp}
          canInstall={Boolean(installPrompt)}
          mobileMenu={mobileMenu}
          setMobileMenu={setMobileMenu}
        />
        <div className="app-scroll-area">
          <div className="content-shell">
            {dataError ? (
              <div className="callout callout-error top-error">
                <AlertTriangle size={17} />
                <div>
                  <strong>Workspace warning</strong>
                  <p>{dataError}</p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setDataError("")}
                  aria-label="Dismiss error"
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
            {activeTab === "overview" ? (
              <Overview
                rows={rows}
                renewalRequests={renewalRequests}
                auditLogs={auditLogs}
                onGo={setActiveTab}
                nowMs={nowMs}
              />
            ) : null}
            {activeTab === "restaurants" ? (
              <Restaurants
                rows={rows}
                plans={plans}
                draftPlanKeys={draftPlanKeys}
                setDraftPlanKeys={setDraftPlanKeys}
                updatingRestaurantId={updatingRestaurantId}
                onAssign={assignPlan}
                search={search}
                setSearch={setSearch}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
              />
            ) : null}
            {activeTab === "renewals" ? (
              <RenewalQueue
                requests={renewalRequests}
                loadingError={renewalError}
                resolvingRequestId={resolvingRequestId}
                onResolve={openResolution}
                onRefresh={doRefresh}
              />
            ) : null}
            {activeTab === "audit" ? (
              <AuditTrail
                logs={auditLogs}
                error={auditError}
                onRefresh={doRefresh}
              />
            ) : null}
            {activeTab === "security" ? (
              <Security
                user={user}
                lastSynced={lastSynced}
                onSignOut={handleSignOut}
              />
            ) : null}
            <footer className="main-footer">
              <span>© {new Date().getFullYear()} Khaavio Control</span>
              <span>
                <i /> Private operations environment
              </span>
              <span>
                Last sync:{" "}
                {lastSynced
                  ? new Date(lastSynced).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
            </footer>
          </div>
        </div>
      </div>
      {resolution ? (
        <ResolutionModal
          request={resolution.request}
          decision={resolution.decision}
          busy={Boolean(resolvingRequestId)}
          error={resolutionError}
          onClose={() => !resolvingRequestId && setResolution(null)}
          onSubmit={submitResolution}
        />
      ) : null}
      {toast ? (
        <div className={`toast toast-${toast.kind}`} role="status">
          <span>
            {toast.kind === "success" ? (
              <CheckCircle2 size={19} />
            ) : (
              <AlertTriangle size={19} />
            )}
          </span>
          <div>
            <strong>{toast.title}</strong>
            {toast.detail ? <small>{toast.detail}</small> : null}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
