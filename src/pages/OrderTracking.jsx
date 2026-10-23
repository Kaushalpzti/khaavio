import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChefHat,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Store,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "./OrderTracking.css";

const STATUS_STEPS = [
  { value: "pending", label: "Order placed", description: "The restaurant has received your order." },
  { value: "accepted", label: "Order accepted", description: "The restaurant has accepted your order." },
  { value: "preparing", label: "Preparing your food", description: "The kitchen is preparing your items." },
  { value: "ready", label: "Ready to serve", description: "Your order is ready at the restaurant." },
  { value: "completed", label: "Completed", description: "Enjoy your meal!" },
];

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatStatus(value) {
  if (!value) return "Processing";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

export default function OrderTracking() {
  const { slug = "", orderId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let active = true;
    let firstLoad = true;
    let intervalId;

    async function loadOrder() {
      if (!slug || !orderId || !token) {
        if (active) {
          setError("This tracking link is incomplete. Please use the link from your order confirmation.");
          setLoading(false);
        }
        return;
      }

      if (active && firstLoad) setLoading(true);
      else if (active) setRefreshing(true);

      try {
        const { data, error: requestError } = await supabase.rpc(
          "get_public_order_tracking",
          {
            p_slug: slug,
            p_order_id: orderId,
            p_tracking_token: token,
          },
        );

        if (requestError) throw requestError;

        const result = Array.isArray(data) ? data[0] : data;

        if (!result?.order_id) {
          throw new Error("We couldn't find this order. Check the original tracking link or contact the restaurant.");
        }

        if (!active) return;

        let items = result.items;
        if (typeof items === "string") {
          try {
            items = JSON.parse(items);
          } catch {
            items = [];
          }
        }

        setOrder({ ...result, items: Array.isArray(items) ? items : [] });
        setLastUpdated(new Date().toISOString());
        setError("");
      } catch (requestError) {
        if (!active) return;
        console.error("Order tracking lookup failed:", requestError);
        setError(
          requestError?.message?.includes("couldn't find this order")
            ? requestError.message
            : "We couldn't refresh this order right now. Please try again in a moment.",
        );
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
          firstLoad = false;
        }
      }
    }

    loadOrder();
    intervalId = window.setInterval(loadOrder, 8000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [slug, orderId, token]);

  async function refreshNow() {
    setRefreshing(true);
    try {
      const { data, error: requestError } = await supabase.rpc(
        "get_public_order_tracking",
        {
          p_slug: slug,
          p_order_id: orderId,
          p_tracking_token: token,
        },
      );

      if (requestError) throw requestError;

      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.order_id) {
        throw new Error("We couldn't find this order. Check the original tracking link or contact the restaurant.");
      }

      let items = result.items;
      if (typeof items === "string") {
        try {
          items = JSON.parse(items);
        } catch {
          items = [];
        }
      }

      setOrder({ ...result, items: Array.isArray(items) ? items : [] });
      setLastUpdated(new Date().toISOString());
      setError("");
    } catch (requestError) {
      console.error("Order tracking refresh failed:", requestError);
      setError(
        requestError?.message?.includes("couldn't find this order")
          ? requestError.message
          : "We couldn't refresh this order right now. Please try again in a moment.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  const status = String(order?.order_status || "pending").toLowerCase();
  const currentStepIndex = STATUS_STEPS.findIndex((step) => step.value === status);
  const isCancelled = status === "cancelled";

  return (
    <main className="order-tracking-page">
      <header className="order-tracking-header">
        <Link to={`/menu/${encodeURIComponent(slug)}`} className="order-tracking-back">
          <ArrowLeft size={17} />
          <span>Back to menu</span>
        </Link>
        <Link to="/" className="order-tracking-brand" aria-label="Khaavio homepage">
          Khaavio<span>.</span>
        </Link>
      </header>

      <section className="order-tracking-content">
        <div className="order-tracking-intro">
          <div className="order-tracking-eyebrow">
            <span /> ORDER TRACKING
          </div>
          <h1>Follow your order.</h1>
          <p>We’ll keep this page updated as the restaurant moves your order along.</p>
        </div>

        {loading ? (
          <section className="order-tracking-state">
            <LoaderCircle size={30} className="order-tracking-spinner" />
            <h2>Finding your order...</h2>
            <p>Checking the latest status with the restaurant.</p>
          </section>
        ) : error && !order ? (
          <section className="order-tracking-state order-tracking-error">
            <XCircle size={30} />
            <h2>We couldn't open this order</h2>
            <p>{error}</p>
            <button type="button" className="order-tracking-primary" onClick={refreshNow}>
              <RefreshCw size={16} /> Try again
            </button>
          </section>
        ) : order ? (
          <>
            <section className="order-tracking-summary">
              <div className="order-tracking-summary-top">
                <div className="order-tracking-restaurant-icon">
                  <Store size={23} />
                </div>
                <div className="order-tracking-restaurant">
                  <span>YOUR ORDER FROM</span>
                  <h2>{order.restaurant_name || "Restaurant"}</h2>
                  <p>Order #{order.order_reference}</p>
                </div>
                <span className={`order-tracking-status status-${status}`}>
                  {formatStatus(status)}
                </span>
              </div>

              <div className="order-tracking-meta">
                <div>
                  <span>Placed on</span>
                  <strong>{formatDate(order.created_at)}</strong>
                </div>
                <div>
                  <span>Table</span>
                  <strong>{order.table_number ? `Table ${order.table_number}` : "—"}</strong>
                </div>
                <div>
                  <span>Order total</span>
                  <strong>{formatPrice(order.total_amount)}</strong>
                </div>
              </div>
            </section>

            <section className="order-tracking-progress-card">
              <div className="order-tracking-section-heading">
                <div>
                  <span className="order-tracking-small-label">LIVE PROGRESS</span>
                  <h2>{isCancelled ? "This order was cancelled" : formatStatus(status)}</h2>
                </div>
                <button
                  type="button"
                  className="order-tracking-refresh"
                  onClick={refreshNow}
                  disabled={refreshing}
                  aria-label="Refresh order status"
                >
                  {refreshing ? (
                    <LoaderCircle size={17} className="order-tracking-spinner" />
                  ) : (
                    <RefreshCw size={17} />
                  )}
                  <span>Refresh</span>
                </button>
              </div>

              {isCancelled ? (
                <div className="order-tracking-cancelled">
                  <XCircle size={24} />
                  <div>
                    <strong>Order cancelled</strong>
                    <p>Please contact the restaurant if you need more information.</p>
                  </div>
                </div>
              ) : (
                <ol className="order-tracking-timeline">
                  {STATUS_STEPS.map((step, index) => {
                    const isDone = currentStepIndex >= index;
                    const isCurrent = currentStepIndex === index;
                    const StepIcon = index === 2 ? ChefHat : index === 0 ? Clock3 : Check;

                    return (
                      <li
                        key={step.value}
                        className={`${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`.trim()}
                      >
                        <div className="order-tracking-step-marker">
                          {isDone ? <CheckCircle2 size={20} /> : <StepIcon size={18} />}
                        </div>
                        <div className="order-tracking-step-copy">
                          <strong>{step.label}</strong>
                          <p>{step.description}</p>
                        </div>
                        {isCurrent && <span className="order-tracking-current-pill">CURRENT</span>}
                      </li>
                    );
                  })}
                </ol>
              )}

              {error && (
                <p className="order-tracking-inline-error" role="status">{error}</p>
              )}

              <div className="order-tracking-auto-refresh">
                <span className="order-tracking-live-dot" />
                Auto-refreshes every 8 seconds
                {lastUpdated && <span>Last checked {new Intl.DateTimeFormat("en-IN", { timeStyle: "short" }).format(new Date(lastUpdated))}</span>}
              </div>
            </section>

            <section className="order-tracking-items-card">
              <div className="order-tracking-items-heading">
                <UtensilsCrossed size={19} />
                <h2>Your items</h2>
              </div>
              {order.items.length ? (
                <div className="order-tracking-items-list">
                  {order.items.map((item, index) => (
                    <div className="order-tracking-item" key={`${item.name}-${index}`}>
                      <div>
                        <strong>{item.name || "Menu item"}</strong>
                        <span>{formatPrice(item.unit_price)} × {Number(item.quantity) || 0}</span>
                      </div>
                      <strong>{formatPrice(item.line_total)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="order-tracking-empty-items">Item details are not available.</p>
              )}
              <div className="order-tracking-total">
                <span>Total</span>
                <strong>{formatPrice(order.total_amount)}</strong>
              </div>
            </section>
          </>
        ) : null}

        <footer className="order-tracking-footer">
          <span>Powered by Khaavio</span>
          <span>Every Table, Digitally Connected.</span>
        </footer>
      </section>
    </main>
  );
}
