import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  LoaderCircle,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { usePlanAccess } from "../context/PlanAccessContext";
import PlanUpgradeNotice from "../components/PlanUpgradeNotice";
import "./Analytics.css";

const INITIAL_REFERENCE_DATE = new Date();

const ANALYTICS_RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

const ORDER_STATUSES = [
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value, options = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...options,
  }).format(date);
}

function formatStatus(status) {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function getDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeLastSevenDays(referenceDate) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(referenceDate);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return {
      key: getDateKey(date),
      label: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(
        date,
      ),
      dateLabel: new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
      }).format(date),
      value: 0,
      orders: 0,
    };
  });
}

export default function Analytics() {
  const navigate = useNavigate();
  const { hasFeature } = usePlanAccess();
  const canUseEnhancedAnalytics = hasFeature("analytics_advanced");
  const [restaurant, setRestaurant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [referenceDate, setReferenceDate] = useState(INITIAL_REFERENCE_DATE);
  const [rangeDays, setRangeDays] = useState(30);
  const effectiveRangeDays = canUseEnhancedAnalytics ? rangeDays : 7;

  useEffect(() => {
    let active = true;

    async function loadAnalytics() {
      setLoading(true);
      setError("");

      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) {
          navigate("/login", { replace: true });
          return;
        }

        const { data: restaurantData, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name, slug")
          .eq("owner_id", authData.user.id)
          .maybeSingle();

        if (restaurantError) throw restaurantError;
        if (!restaurantData) {
          throw new Error(
            "No restaurant profile was found. Complete onboarding first.",
          );
        }

        const now = new Date();
        const start = new Date(now);
        start.setDate(start.getDate() - (canUseEnhancedAnalytics ? 89 : 6));
        start.setHours(0, 0, 0, 0);
        const future = new Date(now);
        future.setDate(future.getDate() + 90);

        const [ordersResult, bookingsResult] = await Promise.all([
          supabase
            .from("orders")
            .select(
              "id, restaurant_id, customer_name, status, total_amount, created_at",
            )
            .eq("restaurant_id", restaurantData.id)
            .gte("created_at", start.toISOString())
            .order("created_at", { ascending: false }),
          supabase
            .from("bookings")
            .select(
              "id, guest_name, party_size, booking_time, status, created_at",
            )
            .eq("restaurant_id", restaurantData.id)
            .in("status", ["pending", "confirmed"])
            .gte("booking_time", now.toISOString())
            .lte("booking_time", future.toISOString())
            .order("booking_time", { ascending: true }),
        ]);

        if (ordersResult.error) throw ordersResult.error;
        if (bookingsResult.error) throw bookingsResult.error;

        const orderData = ordersResult.data || [];
        const bookingData = bookingsResult.data || [];
        const orderIds = orderData.map((order) => order.id);

        let itemsData = [];
        if (canUseEnhancedAnalytics && orderIds.length > 0) {
          const { data, error: itemsError } = await supabase
            .from("order_items")
            .select("order_id, item_name, unit_price, quantity, line_total")
            .in("order_id", orderIds);
          if (itemsError) throw itemsError;
          itemsData = data || [];
        }

        if (!active) return;
        setRestaurant(restaurantData);
        setOrders(orderData);
        setBookings(bookingData);
        setOrderItems(itemsData);
      } catch (err) {
        console.error("Could not load analytics:", err);
        if (active) {
          setError(
            err?.message ||
              "We couldn't load your analytics. Please try again.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadAnalytics();

    return () => {
      active = false;
    };
  }, [navigate, refreshKey, canUseEnhancedAnalytics]);

  const rangeStart = new Date(referenceDate);
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - (effectiveRangeDays - 1));
  const rangeEnd = new Date(referenceDate);
  rangeEnd.setHours(23, 59, 59, 999);
  const rangeStartTime = rangeStart.getTime();
  const rangeEndTime = rangeEnd.getTime();
  const rangeOrders = orders.filter((order) => {
    const createdAt = new Date(order.created_at).getTime();
    return createdAt >= rangeStartTime && createdAt <= rangeEndTime;
  });
  const completedOrders = rangeOrders.filter(
    (order) => order.status === "completed",
  );
  const pendingOrders = rangeOrders.filter(
    (order) => order.status === "pending",
  );
  const completedOrderValue = completedOrders.reduce(
    (sum, order) => sum + (Number(order.total_amount) || 0),
    0,
  );
  const averageOrderValue = completedOrders.length
    ? completedOrderValue / completedOrders.length
    : 0;
  const todayKey = getDateKey(referenceDate);
  const todayBookings = bookings.filter(
    (booking) =>
      getDateKey(booking.booking_time) === todayKey &&
      ["pending", "confirmed"].includes(booking.status),
  ).length;
  const activeBookings = bookings.filter((booking) =>
    ["pending", "confirmed"].includes(booking.status),
  );

  const salesDays = makeLastSevenDays(referenceDate);
  const salesByDay = new Map(salesDays.map((day) => [day.key, day]));
  completedOrders.forEach((order) => {
    const day = salesByDay.get(getDateKey(order.created_at));
    if (day) {
      day.value += Number(order.total_amount) || 0;
      day.orders += 1;
    }
  });
  const maxSales = Math.max(...salesDays.map((day) => day.value), 1);

  const selectedCompletedOrderIds = new Set(
    completedOrders.map((order) => order.id),
  );
  const bestSellersMap = new Map();
  orderItems.forEach((item) => {
    if (!selectedCompletedOrderIds.has(item.order_id)) return;
    const key = item.item_name || "Unnamed item";
    const current = bestSellersMap.get(key) || {
      name: key,
      quantity: 0,
      value: 0,
    };
    current.quantity += Number(item.quantity) || 0;
    current.value += Number(item.line_total) || 0;
    bestSellersMap.set(key, current);
  });
  const bestSellers = [...bestSellersMap.values()]
    .sort((a, b) => b.quantity - a.quantity || b.value - a.value)
    .slice(0, 5);
  const maxItemQuantity = Math.max(
    ...bestSellers.map((item) => item.quantity),
    1,
  );

  function exportOrdersCsv() {
    if (!canUseEnhancedAnalytics) return;
    const escapeCsv = (value) => {
      let text = value == null ? "" : String(value);
      if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };

    const rows = [
      [
        "order_id",
        "created_at",
        "customer_name",
        "status",
        "order_total_inr",
        "item_name",
        "unit_price_inr",
        "quantity",
        "line_total_inr",
      ],
    ];

    rangeOrders.forEach((order) => {
      const items = orderItems.filter((item) => item.order_id === order.id);
      const base = [
        order.id,
        order.created_at,
        order.customer_name || "",
        order.status || "",
      ];

      if (items.length === 0) {
        rows.push([...base, Number(order.total_amount) || 0, "", "", "", ""]);
      } else {
        items.forEach((item, index) => {
          rows.push([
            ...base,
            index === 0 ? Number(order.total_amount) || 0 : "",
            item.item_name || "",
            Number(item.unit_price) || 0,
            Number(item.quantity) || 0,
            Number(item.line_total) || 0,
          ]);
        });
      }
    });

    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `khaavio-orders-${effectiveRangeDays}-days-${getDateKey(referenceDate)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const refresh = () => {
    setRefreshing(true);
    setReferenceDate(new Date());
    setRefreshKey((current) => current + 1);
  };

  return (
    <main className="analytics-page">
      <header className="analytics-header">
        <Link to="/dashboard" className="analytics-back-link">
          <ArrowLeft size={17} /> Dashboard
        </Link>
        <Link to="/" className="analytics-brand">
          Khaavio<span>.</span>
        </Link>
        <button
          type="button"
          className="analytics-refresh-button"
          onClick={refresh}
          disabled={loading || refreshing}
        >
          {refreshing ? (
            <LoaderCircle className="analytics-spin" size={16} />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh
        </button>
      </header>

      <div className="analytics-content">
        <section className="analytics-heading">
          <div>
            <div className="analytics-eyebrow">
              <span /> BUSINESS OVERVIEW
            </div>
            <h1>Analytics</h1>
            <p>
              {restaurant?.name
                ? `A snapshot of ${restaurant.name}'s recent restaurant activity.`
                : "A snapshot of your restaurant's recent activity."}
            </p>
          </div>
          <div className="analytics-heading-actions">
            {canUseEnhancedAnalytics ? (
              <>
            <label className="analytics-range-control">
              <span>Reporting period</span>
              <select
                value={effectiveRangeDays}
                onChange={(event) => setRangeDays(Number(event.target.value))}
                aria-label="Analytics reporting period"
              >
                {ANALYTICS_RANGES.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="analytics-export-button"
              onClick={exportOrdersCsv}
              disabled={loading || refreshing || rangeOrders.length === 0}
              title={
                rangeOrders.length
                  ? "Export orders for the selected period"
                  : "No orders available for this period"
              }
            >
              <Download size={16} /> Export CSV
            </button>
              </>
            ) : (
              <PlanUpgradeNotice compact title="Unlock enhanced analytics" description="Growth adds 30/90-day reporting, CSV exports and menu performance insights." />
            )}
          </div>
        </section>

        {error && (
          <section className="analytics-error" role="alert">
            <div>
              <strong>Analytics couldn't load</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={refresh}>
              Try again
            </button>
          </section>
        )}

        {loading ? (
          <section className="analytics-loading">
            <LoaderCircle className="analytics-spin" size={30} />
            <h2>Gathering your numbers...</h2>
            <p>Fetching recent orders, completed order values and bookings.</p>
          </section>
        ) : (
          !error && (
            <>
              <section
                className="analytics-stat-grid"
                aria-label="Restaurant metrics"
              >
                <article className="analytics-stat-card">
                  <div className="analytics-stat-top">
                    <span>Orders</span>
                    <span className="analytics-stat-icon green">
                      <ShoppingBag size={19} />
                    </span>
                  </div>
                  <strong>{rangeOrders.length.toLocaleString("en-IN")}</strong>
                  <p>Orders created in the last {effectiveRangeDays} days</p>
                </article>

                <article className="analytics-stat-card">
                  <div className="analytics-stat-top">
                    <span>Completed order value</span>
                    <span className="analytics-stat-icon sage">
                      <Wallet size={19} />
                    </span>
                  </div>
                  <strong>{formatPrice(completedOrderValue)}</strong>
                  <p>
                    {completedOrders.length} completed orders · average{" "}
                    {formatPrice(averageOrderValue)}
                  </p>
                </article>

                <article className="analytics-stat-card">
                  <div className="analytics-stat-top">
                    <span>Pending orders</span>
                    <span className="analytics-stat-icon amber">
                      <Clock3 size={19} />
                    </span>
                  </div>
                  <strong>
                    {pendingOrders.length.toLocaleString("en-IN")}
                  </strong>
                  <p>Waiting for the restaurant to accept</p>
                </article>

                <article className="analytics-stat-card">
                  <div className="analytics-stat-top">
                    <span>Upcoming bookings</span>
                    <span className="analytics-stat-icon blue">
                      <CalendarDays size={19} />
                    </span>
                  </div>
                  <strong>
                    {activeBookings.length.toLocaleString("en-IN")}
                  </strong>
                  <p>{todayBookings} pending or confirmed today</p>
                </article>
              </section>

              <section className="analytics-main-grid">
                <article className="analytics-panel analytics-sales-panel">
                  <div className="analytics-panel-heading">
                    <div>
                      <span className="analytics-section-eyebrow">
                        COMPLETED ORDERS
                      </span>
                      <h2>Order value trend</h2>
                      <p>Completed order value by day, over the last 7 days.</p>
                    </div>
                    <span className="analytics-panel-icon">
                      <TrendingUp size={19} />
                    </span>
                  </div>

                  <div
                    className="analytics-chart"
                    role="img"
                    aria-label="Completed order value for each of the last seven days"
                  >
                    {salesDays.map((day) => (
                      <div
                        className="analytics-chart-column"
                        key={day.key}
                        title={`${day.dateLabel}: ${formatPrice(day.value)} from ${day.orders} completed orders`}
                      >
                        <span className="analytics-chart-value">
                          {day.value > 0 ? formatPrice(day.value) : "—"}
                        </span>
                        <div className="analytics-chart-track">
                          <div
                            className={`analytics-chart-bar ${day.value > 0 ? "has-value" : ""}`}
                            style={{
                              height:
                                day.value > 0
                                  ? `${Math.max((day.value / maxSales) * 100, 6)}%`
                                  : "3px",
                            }}
                          />
                        </div>
                        <span className="analytics-chart-day">{day.label}</span>
                        <span className="analytics-chart-date">
                          {day.dateLabel}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="analytics-chart-note">
                    <ArrowDownRight size={15} />
                    <span>
                      Only orders marked completed are included; this is not
                      payment-settlement data.
                    </span>
                  </div>
                </article>

                <article className="analytics-panel analytics-status-panel">
                  <div className="analytics-panel-heading">
                    <div>
                      <span className="analytics-section-eyebrow">
                        WORKFLOW
                      </span>
                      <h2>Order status</h2>
                      <p>Recent orders by their current status.</p>
                    </div>
                    <span className="analytics-panel-icon">
                      <ClipboardList size={19} />
                    </span>
                  </div>

                  <div className="analytics-status-list">
                    {ORDER_STATUSES.map((status) => {
                      const count = rangeOrders.filter(
                        (order) => order.status === status.key,
                      ).length;
                      const percentage = rangeOrders.length
                        ? (count / rangeOrders.length) * 100
                        : 0;
                      return (
                        <div className="analytics-status-row" key={status.key}>
                          <div className="analytics-status-label">
                            <span
                              className={`analytics-status-dot status-${status.key}`}
                            />
                            <span>{status.label}</span>
                            <strong>{count}</strong>
                          </div>
                          <div className="analytics-status-track">
                            <div
                              className={`analytics-status-fill status-${status.key}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Link to="/dashboard/orders" className="analytics-panel-link">
                    Manage orders <ArrowUpRight size={15} />
                  </Link>
                </article>
              </section>

              {canUseEnhancedAnalytics ? (
<section className="analytics-bottom-grid">
                <article className="analytics-panel analytics-best-sellers-panel">
                  <div className="analytics-panel-heading">
                    <div>
                      <span className="analytics-section-eyebrow">
                        MENU PERFORMANCE
                      </span>
                      <h2>Popular dishes</h2>
                      <p>
                        Top items from completed orders in the last {effectiveRangeDays}{" "}
                        days.
                      </p>
                    </div>
                    <span className="analytics-panel-icon">
                      <UtensilsCrossed size={19} />
                    </span>
                  </div>

                  {bestSellers.length ? (
                    <div className="analytics-popular-list">
                      {bestSellers.map((item, index) => (
                        <div className="analytics-popular-row" key={item.name}>
                          <span className="analytics-popular-rank">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div className="analytics-popular-info">
                            <div className="analytics-popular-name-row">
                              <strong>{item.name}</strong>
                              <span>{item.quantity} sold</span>
                            </div>
                            <div className="analytics-popular-track">
                              <div
                                style={{
                                  width: `${Math.max((item.quantity / maxItemQuantity) * 100, 4)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <strong className="analytics-popular-value">
                            {formatPrice(item.value)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="analytics-empty-inline">
                      <UtensilsCrossed size={24} />
                      <strong>No completed dish sales yet</strong>
                      <p>
                        Once customer orders are completed, popular dishes will
                        appear here.
                      </p>
                    </div>
                  )}
                  <Link to="/dashboard/menu" className="analytics-panel-link">
                    Manage menu <ArrowUpRight size={15} />
                  </Link>
                </article>

                <article className="analytics-panel analytics-bookings-panel">
                  <div className="analytics-panel-heading">
                    <div>
                      <span className="analytics-section-eyebrow">
                        RESERVATIONS
                      </span>
                      <h2>Upcoming bookings</h2>
                      <p>
                        Pending and confirmed reservations coming up in 90 days.
                      </p>
                    </div>
                    <span className="analytics-panel-icon">
                      <CalendarDays size={19} />
                    </span>
                  </div>

                  {bookings.length ? (
                    <div className="analytics-booking-list">
                      {bookings.slice(0, 5).map((booking) => (
                        <div className="analytics-booking-row" key={booking.id}>
                          <div className="analytics-booking-date">
                            <strong>
                              {formatDate(booking.booking_time, {
                                day: "2-digit",
                              })}
                            </strong>
                            <span>
                              {formatDate(booking.booking_time, {
                                month: "short",
                              })}
                            </span>
                          </div>
                          <div className="analytics-booking-info">
                            <strong>{booking.guest_name || "Guest"}</strong>
                            <span>
                              {booking.party_size}{" "}
                              {Number(booking.party_size) === 1
                                ? "guest"
                                : "guests"}{" "}
                              ·{" "}
                              {formatDate(booking.booking_time, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <span
                            className={`analytics-booking-status booking-${booking.status}`}
                          >
                            {formatStatus(booking.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="analytics-empty-inline">
                      <CalendarDays size={24} />
                      <strong>No upcoming bookings</strong>
                      <p>Future customer reservations will appear here.</p>
                    </div>
                  )}
                  <Link
                    to="/dashboard/bookings"
                    className="analytics-panel-link"
                  >
                    Manage bookings <ArrowUpRight size={15} />
                  </Link>
                </article>
              </section>
) : (
  <PlanUpgradeNotice title="Explore more insights with Growth" description="Unlock popular-dish performance and upcoming booking insights with your Growth plan." />
)}

              <div className="analytics-footnote">
                <CheckCircle2 size={15} />
                <span>
                  Figures are calculated from Khaavio order and booking records.
                  Payment processing and settlement tracking are not included.
                </span>
              </div>
            </>
          )
        )}
      </div>
    </main>
  );
}
