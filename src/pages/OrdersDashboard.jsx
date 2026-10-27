import { confirmKhaavio } from "../components/KhaavioDialogSystem.jsx";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Clock3,
  LoaderCircle,
  MessageCircle,
  Phone,
  RefreshCw,
  Store,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { useKhaavioOperationalAlerts } from "../context/KhaavioOperationalAlertsContext";
import { cancelKhaavioVoice } from "../lib/khaavioVoiceAlerts";
import { normalizeTableNumber } from "../lib/tableNumber";
import khaavioIcon from "../assets/icon.png";
import "./OrdersDashboard.css";

const STATUS_OPTIONS = [
  "all",
  "pending",
  "accepted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];

const STATUS_LABELS = {
  pending: "Pending",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_ACTIONS = {
  pending: [
    { status: "accepted", label: "Accept order", kind: "primary" },
    { status: "cancelled", label: "Cancel", kind: "danger" },
  ],
  accepted: [
    { status: "preparing", label: "Start preparing", kind: "primary" },
    { status: "cancelled", label: "Cancel", kind: "danger" },
  ],
  preparing: [
    { status: "ready", label: "Mark ready", kind: "primary" },
    { status: "cancelled", label: "Cancel", kind: "danger" },
  ],
  ready: [{ status: "completed", label: "Complete order", kind: "primary" }],
  completed: [],
  cancelled: [],
};

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "Time unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getReference(orderId) {
  if (!orderId) return "UNKNOWN";

  return String(orderId).replace(/-/g, "").slice(0, 8).toUpperCase();
}

function getErrorMessage(error, fallback) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : fallback;
}

function normalizeWhatsAppPhone(value) {
  let phone = String(value || "").replace(/\D/g, "");

  if (phone.startsWith("00")) {
    phone = phone.slice(2);
  }

  if (phone.length === 11 && phone.startsWith("0")) {
    phone = phone.slice(1);
  }

  // Treat 10-digit local Indian numbers as +91 numbers.
  if (phone.length === 10) {
    phone = `91${phone}`;
  }

  return phone.length >= 10 && phone.length <= 15 ? phone : "";
}

function formatTableLabel(value) {
  const table = normalizeTableNumber(value);

  if (!table || /^restaurant(?:\s|$)/i.test(table)) {
    return "Restaurant order";
  }

  return `Table ${table}`;
}

function getWhatsAppUrl(order, restaurant) {
  const phone = normalizeWhatsAppPhone(order.customer_phone);
  if (!phone) return "";

  const status = STATUS_LABELS[order.status] || order.status || "Updated";
  const statusMessage =
    {
      pending:
        "We have received your order and it is awaiting restaurant confirmation.",
      accepted: "Your order has been accepted by the restaurant.",
      preparing: "Your order is now being prepared.",
      ready: "Your order is ready.",
      completed:
        "Your order has been marked completed. Thank you for ordering with us!",
      cancelled:
        "Your order has been cancelled. Please contact the restaurant if you need help.",
    }[order.status] || "Your order status has been updated.";

  const message = [
    `Hello ${order.customer_name || "there"},`,
    "",
    `Order update from ${restaurant?.name || "the restaurant"}.`,
    `Order reference: #${getReference(order.id)}`,
    formatTableLabel(order.table_number),
    `Status: ${status}`,
    statusMessage,
    `Order total: ${formatPrice(order.total_amount)}`,
    "",
    "Thank you!",
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}


function queueOrdersVoice(messageFactory) {
  if (
    typeof window === "undefined" ||
    !window.speechSynthesis ||
    typeof window.SpeechSynthesisUtterance !== "function"
  ) {
    return false;
  }

  try {
    const synthesis = window.speechSynthesis;
    const voices = synthesis.getVoices();
    const voice =
      voices.find((item) => item.lang?.toLowerCase().startsWith("hi")) ||
      voices.find((item) => item.lang?.toLowerCase() === "en-in") ||
      voices[0] ||
      null;
    const isHindi = Boolean(voice?.lang?.toLowerCase().startsWith("hi"));
    const message = messageFactory(isHindi);
    if (!message) return false;

    const utterance = new window.SpeechSynthesisUtterance(message);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || (isHindi ? "hi-IN" : "en-IN");
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.volume = 1;
    synthesis.speak(utterance);
    return true;
  } catch (error) {
    console.warn("Orders voice announcement could not be queued:", error);
    return false;
  }
}

function speakOrdersVoiceTest(restaurantName) {
  return queueOrdersVoice((isHindi) =>
    isHindi
      ? `ऑर्डर की आवाज़ में घोषणा चालू है। ${restaurantName || "आपके रेस्टोरेंट"} के नए ऑर्डर की जानकारी सुनाई जाएगी।`
      : `Order voice announcements are enabled for ${restaurantName || "your restaurant"}. New incoming orders will be announced.`,
  );
}

export default function OrdersDashboard() {
  const navigate = useNavigate();
  const { preferences, setPreference } = useKhaavioOperationalAlerts();
  const voiceEnabled = preferences.voiceEnabled;

  const [restaurant, setRestaurant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState("connecting");

  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Load the restaurant's orders from Supabase.
  useEffect(() => {
    let active = true;

    async function loadOrders() {
      setError("");

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

        if (!restaurantData) {
          setRestaurant(null);
          setOrders([]);
          return;
        }

        setRestaurant(restaurantData);

        const { data: orderData, error: ordersError } = await supabase
          .from("orders")
          .select(
            "id, restaurant_id, table_id, guest_tab_id, customer_name, customer_phone, notes, status, total_amount, created_at",
          )
          .eq("restaurant_id", restaurantData.id)
          .order("created_at", { ascending: false });

        if (ordersError) throw ordersError;

        const orderList = orderData || [];
        const orderIds = orderList.map((order) => order.id);
        const guestTabIds = [...new Set(orderList.map((order) => order.guest_tab_id).filter(Boolean))];

        const [itemsResult, tablesResult, guestTabsResult] = await Promise.all([
          orderIds.length > 0
            ? supabase
                .from("order_items")
                .select(
                  "id, order_id, menu_item_id, item_name, unit_price, quantity, line_total",
                )
                .in("order_id", orderIds)
            : Promise.resolve({ data: [], error: null }),

          supabase
            .from("restaurant_tables")
            .select("id, table_number")
            .eq("restaurant_id", restaurantData.id),
          guestTabIds.length > 0
            ? supabase
                .from("table_session_tabs")
                .select("id, display_name")
                .eq("restaurant_id", restaurantData.id)
                .in("id", guestTabIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (itemsResult.error) throw itemsResult.error;
        if (tablesResult.error) throw tablesResult.error;
        if (guestTabsResult.error) throw guestTabsResult.error;

        if (!active) return;

        const itemGroups = new Map();

        for (const item of itemsResult.data || []) {
          const existing = itemGroups.get(item.order_id) || [];
          existing.push(item);
          itemGroups.set(item.order_id, existing);
        }

        const tableNames = new Map(
          (tablesResult.data || []).map((table) => [
            table.id,
            table.table_number,
          ]),
        );
        const guestTabNames = new Map(
          (guestTabsResult.data || []).map((tab) => [tab.id, tab.display_name || "Guest"]),
        );

        const enrichedOrders = orderList.map((order) => ({
          ...order,
          table_number: tableNames.get(order.table_id) || "Restaurant table",
          guest_tab_name: guestTabNames.get(order.guest_tab_id) || null,
          items: itemGroups.get(order.id) || [],
        }));

        setOrders(enrichedOrders);
      } catch (err) {
        if (active) {
          setError(getErrorMessage(err, "Unable to load restaurant orders."));
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadOrders();

    return () => {
      active = false;
    };
  }, [navigate, refreshKey]);

  // Subscribe to database changes for this restaurant only.
  useEffect(() => {
    const restaurantId = restaurant?.id;

    if (!restaurantId) {
      return undefined;
    }

    let active = true;
    let liveConnected = false;

    const channel = supabase
      .channel(`restaurant-orders-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (!active) return;

          const insertedOrder = payload.new || {};
          const orderId = insertedOrder.id;
          const reference = getReference(orderId);
          let alertMessage = `New order received · #${reference}. Order list is refreshing.`;

          // The global operational alert manager handles speech across route changes.
          setNotice(alertMessage);
          setRefreshing(true);
          setRefreshKey((current) => current + 1);

          // Only notify if the owner already granted permission.
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            try {
              new Notification("New Khaavio order", {
                body: `Order #${reference} has arrived.`,
                icon: khaavioIcon,
              });
            } catch {
              // The in-app alert remains available.
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          if (!active) return;

          setRefreshing(true);
          setRefreshKey((current) => current + 1);
        },
      )
      .subscribe((status) => {
        if (!active) return;

        if (status === "SUBSCRIBED") {
          liveConnected = true;
          setRealtimeStatus("connected");
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          liveConnected = false;
          setRealtimeStatus("disconnected");
        }
      });

    // Poll periodically if the realtime channel is unavailable.
    const fallbackInterval = window.setInterval(() => {
      if (!active || liveConnected) return;

      setRefreshing(true);
      setRefreshKey((current) => current + 1);
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(fallbackInterval);
      supabase.removeChannel(channel);
    };
  }, [restaurant?.id, restaurant?.name]);

  async function updateOrderStatus(order, nextStatus) {
    const permittedActions = STATUS_ACTIONS[order.status] || [];

    const isPermitted = permittedActions.some(
      (action) => action.status === nextStatus,
    );

    if (!isPermitted || !restaurant || updatingOrderId) {
      return;
    }

    if (
      nextStatus === "cancelled" &&
      !await confirmKhaavio(`Cancel order ${getReference(order.id)}?`)
    ) {
      return;
    }

    setError("");
    setNotice("");
    setUpdatingOrderId(order.id);

    try {
      // Restrict the update to the current restaurant and expected
      // status to reduce accidental conflicting updates.
      const { data, error: updateError } = await supabase
        .from("orders")
        .update({ status: nextStatus })
        .eq("id", order.id)
        .eq("restaurant_id", restaurant.id)
        .eq("status", order.status)
        .select("id, status")
        .single();

      if (updateError) throw updateError;

      setOrders((current) =>
        current.map((entry) =>
          entry.id === data.id ? { ...entry, status: data.status } : entry,
        ),
      );

      setNotice(
        `Order #${getReference(order.id)} updated to ${STATUS_LABELS[data.status]}.`,
      );
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "Could not update this order. Refresh and try again.",
        ),
      );
    } finally {
      setUpdatingOrderId("");
    }
  }

  function refreshOrders() {
    if (loading || refreshing) return;

    setError("");
    setNotice("");
    setRefreshing(true);
    setRefreshKey((current) => current + 1);
  }


  function toggleVoiceAnnouncements() {
    if (voiceEnabled) {
      setPreference("voiceEnabled", false);
      cancelKhaavioVoice();
      setNotice("Voice alerts are off across the restaurant workspace.");
      setError("");
      return;
    }

    if (
      typeof window === "undefined" ||
      !window.speechSynthesis ||
      typeof window.SpeechSynthesisUtterance !== "function"
    ) {
      setError("This browser does not support spoken announcements. Try a current version of Chrome or Edge.");
      return;
    }

    window.speechSynthesis.cancel();
    if (!speakOrdersVoiceTest(restaurant?.name)) {
      setError("Voice announcements could not be started in this browser.");
      return;
    }

    setPreference("voiceEnabled", true);
    setError("");
    setNotice("Voice alerts are on across the restaurant workspace.");
  }

  async function enableBrowserNotifications() {
    setError("");
    setNotice("");

    if (typeof Notification === "undefined") {
      setError("This browser does not support desktop notifications.");
      return;
    }

    if (Notification.permission === "granted") {
      setNotice("Desktop notifications are already enabled.");
      return;
    }

    if (Notification.permission === "denied") {
      setError(
        "Notifications are blocked by your browser. Enable them in this site's browser settings.",
      );
      return;
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission === "granted") {
        setNotice("Desktop notifications enabled for incoming orders.");
      } else {
        setNotice(
          "Desktop notifications were not enabled. In-app alerts will still work.",
        );
      }
    } catch {
      setError("Could not enable desktop notifications in this browser.");
    }
  }

  const visibleOrders =
    filter === "all"
      ? orders
      : orders.filter((order) => order.status === filter);

  const pendingCount = orders.filter(
    (order) => order.status === "pending",
  ).length;

  const activeCount = orders.filter((order) =>
    ["accepted", "preparing", "ready"].includes(order.status),
  ).length;

  const completedCount = orders.filter(
    (order) => order.status === "completed",
  ).length;

  if (loading) {
    return (
      <main className="orders-state">
        <LoaderCircle className="orders-spinner" size={30} />
        <p>Loading restaurant orders...</p>
      </main>
    );
  }

  return (
    <main className="orders-page">
      <header className="orders-header">
        <Link to="/dashboard" className="orders-back">
          <ArrowLeft size={17} />
          Dashboard
        </Link>

        <button
          type="button"
          className="orders-refresh"
          onClick={refreshOrders}
          disabled={refreshing}
        >
          {refreshing ? (
            <LoaderCircle size={16} className="orders-spinner" />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh
        </button>
      </header>

      <div className="orders-container">
        <div className="orders-heading">
          <span className="orders-eyebrow">RESTAURANT WORKSPACE</span>
          <h1>Orders</h1>

          <p>
            Manage customer orders and update their progress
            {restaurant ? ` at ${restaurant.name}.` : "."}
          </p>
        </div>

        {error && (
          <div className="orders-alert orders-alert-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {notice && (
          <div className="orders-alert orders-alert-success" role="status">
            <CheckCircle2 size={17} />
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        {!restaurant ? (
          <section className="orders-empty">
            <Store size={34} />
            <h2>Restaurant not found</h2>
            <p>Set up your restaurant before managing orders.</p>

            <Link to="/onboarding" className="orders-primary-button">
              Complete setup
            </Link>
          </section>
        ) : (
          <>
            <section className="orders-stats">
              <article className="orders-stat">
                <div className="orders-stat-icon pending-stat">
                  <Clock3 size={20} />
                </div>
                <span>Pending orders</span>
                <strong>{pendingCount}</strong>
              </article>

              <article className="orders-stat">
                <div className="orders-stat-icon active-stat">
                  <ChefHat size={20} />
                </div>
                <span>In progress</span>
                <strong>{activeCount}</strong>
              </article>

              <article className="orders-stat">
                <div className="orders-stat-icon completed-stat">
                  <CheckCircle2 size={20} />
                </div>
                <span>Completed</span>
                <strong>{completedCount}</strong>
              </article>

              <article className="orders-stat">
                <div className="orders-stat-icon all-stat">
                  <ClipboardList size={20} />
                </div>
                <span>All orders</span>
                <strong>{orders.length}</strong>
              </article>
            </section>

            <section className="orders-list-section">
              <div className="orders-list-heading">
                <div>
                  <span className="orders-eyebrow">LIVE WORKSPACE</span>
                  <h2>Order queue</h2>
                </div>

                <div className="orders-header-tools">
                  <span
                    className={`orders-realtime-badge ${
                      realtimeStatus === "connected"
                        ? "is-connected"
                        : realtimeStatus === "disconnected"
                          ? "is-disconnected"
                          : ""
                    }`}
                  >
                    <span />

                    {realtimeStatus === "connected"
                      ? "Live updates connected"
                      : realtimeStatus === "disconnected"
                        ? "Auto-refresh fallback active"
                        : "Connecting to live updates..."}
                  </span>

                  <button
                    type="button"
                    className={`orders-voice-button${voiceEnabled ? " is-active" : ""}`}
                    onClick={toggleVoiceAnnouncements}
                    aria-pressed={voiceEnabled}
                    title={voiceEnabled ? "Disable spoken new-order announcements" : "Enable spoken new-order announcements"}
                  >
                    {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    {voiceEnabled ? "Voice on" : "Enable voice"}
                  </button>

                  <button
                    type="button"
                    className="orders-notification-button"
                    onClick={enableBrowserNotifications}
                  >
                    <Bell size={14} />

                    {typeof Notification !== "undefined" &&
                    Notification.permission === "granted"
                      ? "Alerts enabled"
                      : "Enable desktop alerts"}
                  </button>
                </div>
              </div>

              <div className="orders-filters">
                {STATUS_OPTIONS.map((status) => {
                  const count =
                    status === "all"
                      ? orders.length
                      : orders.filter((order) => order.status === status)
                          .length;

                  return (
                    <button
                      type="button"
                      key={status}
                      className={filter === status ? "active" : ""}
                      onClick={() => setFilter(status)}
                    >
                      {status === "all" ? "All" : STATUS_LABELS[status]}

                      <span>{count}</span>
                    </button>
                  );
                })}
              </div>

              {visibleOrders.length > 0 ? (
                <div className="orders-grid">
                  {visibleOrders.map((order) => {
                    const actions = STATUS_ACTIONS[order.status] || [];
                    const whatsappUrl = getWhatsAppUrl(order, restaurant);

                    return (
                      <article className="order-card" key={order.id}>
                        <div className="order-card-header">
                          <div className="order-reference">
                            <span>ORDER</span>
                            <strong>#{getReference(order.id)}</strong>{" "}
                          </div>

                          <span
                            className={`order-status status-${order.status}`}
                          >
                            {STATUS_LABELS[order.status] || order.status}
                          </span>
                        </div>

                        <div className="order-customer">
                          <h3>{order.customer_name}</h3>

                          <div className="order-meta">
                            <span>
                              <Store size={14} />
                              {formatTableLabel(order.table_number)}{order.guest_tab_name ? " · " + order.guest_tab_name : ""}
                            </span>

                            <span>
                              <CalendarDays size={14} />
                              {formatDate(order.created_at)}
                            </span>
                          </div>

                          {order.customer_phone && (
                            <a
                              className="order-phone"
                              href={`tel:${order.customer_phone}`}
                            >
                              <Phone size={14} />
                              {order.customer_phone}
                            </a>
                          )}

                          {whatsappUrl && (
                            <a
                              className="order-phone order-whatsapp-link"
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Prepare WhatsApp status update for order ${getReference(order.id)}`}
                            >
                              <MessageCircle size={14} />
                              WhatsApp status update
                            </a>
                          )}
                        </div>

                        <div className="order-items">
                          <h4>
                            <UtensilsCrossed size={15} />
                            Items ordered
                          </h4>

                          {order.items.length > 0 ? (
                            order.items.map((item) => (
                              <div className="order-item-line" key={item.id}>
                                <div>
                                  <strong>{item.item_name}</strong>
                                  <span>
                                    {formatPrice(item.unit_price)} ×{" "}
                                    {item.quantity}
                                  </span>
                                </div>

                                <strong>{formatPrice(item.line_total)}</strong>
                              </div>
                            ))
                          ) : (
                            <p className="order-no-items">
                              No item details found.
                            </p>
                          )}
                        </div>

                        {order.notes && (
                          <div className="order-notes">
                            <strong>Special instructions</strong>
                            <p>{order.notes}</p>
                          </div>
                        )}

                        <div className="order-total">
                          <span>Order total</span>
                          <strong>{formatPrice(order.total_amount)}</strong>
                        </div>

                        {actions.length > 0 ? (
                          <div className="order-actions">
                            {actions.map((action) => (
                              <button
                                key={action.status}
                                type="button"
                                className={`order-action-button ${action.kind}`}
                                onClick={() =>
                                  updateOrderStatus(order, action.status)
                                }
                                disabled={updatingOrderId === order.id}
                              >
                                {updatingOrderId === order.id ? (
                                  <LoaderCircle
                                    size={15}
                                    className="orders-spinner"
                                  />
                                ) : action.status === "cancelled" ? (
                                  <XCircle size={15} />
                                ) : action.status === "preparing" ? (
                                  <ChefHat size={15} />
                                ) : (
                                  <CheckCircle2 size={15} />
                                )}

                                {updatingOrderId === order.id
                                  ? "Updating..."
                                  : action.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="order-final-state">
                            {order.status === "completed" ? (
                              <CheckCircle2 size={16} />
                            ) : (
                              <XCircle size={16} />
                            )}

                            {order.status === "completed"
                              ? "Order completed"
                              : "Order cancelled"}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="orders-empty">
                  <div className="orders-empty-icon">
                    <ClipboardList size={28} />
                  </div>

                  <h3>
                    {orders.length > 0
                      ? "No orders in this category"
                      : "No customer orders yet"}
                  </h3>

                  <p>
                    {orders.length > 0
                      ? "Choose another status filter to view orders."
                      : "Orders submitted through a valid table QR will appear here."}
                  </p>
                </div>
              )}
            </section>

            <footer className="orders-footer">
              <Link to="/dashboard">
                <ArrowLeft size={15} />
                Back to workspace
              </Link>

              <span>Every Table, Digitally Connected.</span>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
