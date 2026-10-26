import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BellOff,
  BellRing,
  CheckCircle2,
  ChefHat,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
  Utensils,
  Volume2,
  VolumeX,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useKhaavioOperationalAlerts } from "../context/KhaavioOperationalAlertsContext";
import { activateKhaavioAlertSound, cancelKhaavioVoice } from "../lib/khaavioVoiceAlerts";
import "./KitchenDisplay.css";

const ACTIVE_STATUSES = ["pending", "accepted", "preparing", "ready"];
const REFRESH_INTERVAL_MS = 15000;

const STATUS_LABELS = {
  pending: "New order",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready to serve",
};

const NEXT_ACTION = {
  pending: { next: "accepted", label: "Accept order" },
  accepted: { next: "preparing", label: "Start preparing" },
  preparing: { next: "ready", label: "Mark ready" },
  ready: { next: "completed", label: "Complete order" },
};

const FILTERS = [
  { id: "all", label: "All active" },
  { id: "pending", label: "New" },
  { id: "accepted", label: "Accepted" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
];

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatOrderTime(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Calculate elapsed time using the last successful refresh timestamp so render
// remains deterministic and the age labels update with the kitchen refresh.
function getOrderAgeSeconds(createdAt, referenceDate) {
  if (!createdAt || !referenceDate) return null;
  const createdAtMs = Date.parse(createdAt);
  const referenceMs = referenceDate.getTime();
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(referenceMs)) return null;
  return Math.max(0, Math.floor((referenceMs - createdAtMs) / 1000));
}

function formatElapsedAge(ageSeconds) {
  if (ageSeconds == null) return "Age unavailable";
  if (ageSeconds < 60) return "Just now";
  const totalMinutes = Math.floor(ageSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min elapsed`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m elapsed` : `${hours}h elapsed`;
}

function getOrderAgeLevel(ageSeconds) {
  if (ageSeconds == null) return "unknown";
  if (ageSeconds >= 10 * 60) return "overdue";
  if (ageSeconds >= 5 * 60) return "warning";
  return "normal";
}

function getReference(id) {
  return String(id || "")
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase();
}

function queueKitchenSpeech(messageFactory) {
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
    const messages = messageFactory(isHindi).filter(Boolean);

    for (const message of messages) {
      const utterance = new window.SpeechSynthesisUtterance(message);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || (isHindi ? "hi-IN" : "en-IN");
      utterance.rate = 0.94;
      utterance.pitch = 1;
      utterance.volume = 1;
      synthesis.speak(utterance);
    }

    return messages.length > 0;
  } catch (error) {
    console.warn("Kitchen voice announcement could not be queued:", error);
    return false;
  }
}

function speakKitchenTest(restaurantName) {
  return queueKitchenSpeech((isHindi) => [
    isHindi
      ? `आवाज़ में ऑर्डर की घोषणा चालू है। ${restaurantName || "आपके रेस्टोरेंट"} के नए ऑर्डर की जानकारी सुनाई जाएगी।`
      : `Voice announcements are enabled for ${restaurantName || "your restaurant"}. New order details will be spoken.`,
  ]);
}

export default function KitchenDisplay() {
  const navigate = useNavigate();
  const displayRef = useRef(null);
  const { preferences, setPreference } = useKhaavioOperationalAlerts();
  const soundEnabled = preferences.soundEnabled;
  const voiceEnabled = preferences.voiceEnabled;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [restaurant, setRestaurant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let running = false;
    let restaurantId = "";

    async function loadKitchen({ initial = false } = {}) {
      if (running) return;
      running = true;
      if (initial && active) setLoading(true);
      else if (active) setRefreshing(true);
      if (active) setError("");

      try {
        if (!restaurantId) {
          const { data: authData, error: authError } =
            await supabase.auth.getUser();
          if (authError) throw authError;

          if (!authData.user) {
            navigate("/login", { replace: true });
            return;
          }

          const { data: restaurantData, error: restaurantError } =
            await supabase
              .from("restaurants")
              .select("id, name, slug")
              .eq("owner_id", authData.user.id)
              .maybeSingle();

          if (restaurantError) throw restaurantError;
          if (!restaurantData) {
            throw new Error("No restaurant workspace was found for this account.");
          }

          restaurantId = restaurantData.id;
          if (active) setRestaurant(restaurantData);
        }

        const { data: orderData, error: ordersError } = await supabase
          .from("orders")
          .select(
            "id, restaurant_id, table_id, customer_name, customer_phone, notes, status, total_amount, created_at",
          )
          .eq("restaurant_id", restaurantId)
          .in("status", ACTIVE_STATUSES)
          .order("created_at", { ascending: true });

        if (ordersError) throw ordersError;

        const currentOrders = orderData || [];
        const orderIds = currentOrders.map((order) => order.id);
        const tableIds = [
          ...new Set(currentOrders.map((order) => order.table_id).filter(Boolean)),
        ];

        const [itemsResult, tablesResult] = await Promise.all([
          orderIds.length
            ? supabase
                .from("order_items")
                .select("id, order_id, item_name, unit_price, quantity, line_total")
                .in("order_id", orderIds)
            : Promise.resolve({ data: [], error: null }),
          tableIds.length
            ? supabase
                .from("restaurant_tables")
                .select("id, table_number")
                .eq("restaurant_id", restaurantId)
                .in("id", tableIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (itemsResult.error) throw itemsResult.error;
        if (tablesResult.error) throw tablesResult.error;

        const itemsByOrder = new Map();
        for (const item of itemsResult.data || []) {
          const current = itemsByOrder.get(item.order_id) || [];
          current.push(item);
          itemsByOrder.set(item.order_id, current);
        }

        const tableById = new Map(
          (tablesResult.data || []).map((table) => [table.id, table.table_number]),
        );

        const enrichedOrders = currentOrders.map((order) => ({
          ...order,
          items: itemsByOrder.get(order.id) || [],
          tableNumber: tableById.get(order.table_id) || null,
        }));

        // The shared operational alert manager announces new orders across routes.

        if (!active) return;
        setOrders(enrichedOrders);
        setLastUpdated(new Date());
      } catch (loadError) {
        if (active) {
          setError(
            loadError?.message || "Could not load the kitchen order queue.",
          );
        }
      } finally {
        running = false;
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadKitchen({ initial: true });
    const intervalId = window.setInterval(() => loadKitchen(), REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [navigate, refreshKey]);

  async function toggleSoundAlerts() {
    if (soundEnabled) {
      setPreference("soundEnabled", false);
      setNotice("New-order sound alerts are off across the restaurant workspace.");
      return;
    }

    const activated = await activateKhaavioAlertSound();
    if (!activated) {
      setError("Sound alerts need browser audio support and one user interaction. Check this site's sound settings and try again.");
      return;
    }

    setPreference("soundEnabled", true);
    setError("");
    setNotice("Louder, longer sound alerts are on across the restaurant workspace.");
  }

  function toggleVoiceAnnouncements() {
    if (voiceEnabled) {
      setPreference("voiceEnabled", false);
      cancelKhaavioVoice();
      setNotice("Voice alerts are off across the restaurant workspace.");
      return;
    }

    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
      setError("This browser does not support spoken announcements. Try a current version of Chrome or Edge.");
      return;
    }

    window.speechSynthesis.cancel();
    if (!speakKitchenTest(restaurant?.name)) {
      setError("Voice announcements could not be started in this browser.");
      return;
    }

    setPreference("voiceEnabled", true);
    setError("");
    setNotice("Voice alerts are on across the restaurant workspace.");
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (displayRef.current?.requestFullscreen) {
        await displayRef.current.requestFullscreen();
      } else {
        setError("Fullscreen mode is not supported by this browser.");
      }
    } catch (fullscreenError) {
      setError(fullscreenError?.message || "Could not change fullscreen mode.");
    }
  }

  async function updateStatus(order, nextStatus) {
    if (!restaurant || updatingOrderId) return;
    const action = NEXT_ACTION[order.status];
    if (!action || action.next !== nextStatus) return;

    setUpdatingOrderId(order.id);
    setError("");
    setNotice("");

    try {
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
        current.filter((entry) => entry.id !== data.id),
      );
      setNotice(`Order #${getReference(order.id)} marked ${data.status}.`);
      setRefreshKey((value) => value + 1);
    } catch (updateError) {
      setError(
        updateError?.message ||
          "The order status could not be updated. Refresh and try again.",
      );
    } finally {
      setUpdatingOrderId("");
    }
  }

  const visibleOrders =
    filter === "all"
      ? orders
      : orders.filter((order) => order.status === filter);

  const counts = Object.fromEntries(
    FILTERS.map(({ id }) => [
      id,
      id === "all"
        ? orders.length
        : orders.filter((order) => order.status === id).length,
    ]),
  );

  const overdueCount = orders.filter(
    (order) => getOrderAgeLevel(getOrderAgeSeconds(order.created_at, lastUpdated)) === "overdue",
  ).length;

  return (
    <main className="kitchen-page" ref={displayRef}>
      <header className="kitchen-header">
        <Link to="/dashboard" className="kitchen-back-link">
          <ArrowLeft size={17} /> Dashboard
        </Link>
        <div className="kitchen-header-actions">
          <button
            type="button"
            className={`kitchen-tool-button ${soundEnabled ? "is-active" : ""}`}
            onClick={toggleSoundAlerts}
            aria-pressed={soundEnabled}
            title={soundEnabled ? "Disable new order sound alerts" : "Enable new order sound alerts"}
          >
            {soundEnabled ? <BellRing size={16} /> : <BellOff size={16} />}
            <span>{soundEnabled ? "Sound on" : "Enable sound"}</span>
          </button>
          <button
            type="button"
            className={`kitchen-tool-button ${voiceEnabled ? "is-active" : ""}`}
            onClick={toggleVoiceAnnouncements}
            aria-pressed={voiceEnabled}
            title={
              voiceEnabled
                ? "Disable spoken new-order announcements"
                : "Enable spoken new-order announcements"
            }
          >
            {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{voiceEnabled ? "Voice on" : "Enable voice"}</span>
          </button>
          <button
            type="button"
            className="kitchen-tool-button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span>{isFullscreen ? "Exit full screen" : "Full screen"}</span>
          </button>
          <button
            type="button"
            className="kitchen-refresh-button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={refreshing}
          >
            {refreshing ? (
              <LoaderCircle className="kitchen-spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            <span>Refresh</span>
          </button>
        </div>
      </header>

      <section className="kitchen-main">
        <div className="kitchen-title-row">
          <div>
            <span className="kitchen-eyebrow">SERVICE IN PROGRESS</span>
            <h1>Kitchen display</h1>
            <p>
              {restaurant?.name || "Your restaurant"} · Active orders stay here until completed.
            </p>
          </div>
          <div className="kitchen-live-indicator">
            <span /> Auto-refresh every 15 sec
          </div>
        </div>

        <div className="kitchen-summary-strip">
          <div><span>Active orders</span><strong>{orders.length}</strong></div>
          <div><span>New</span><strong>{counts.pending || 0}</strong></div>
          <div><span>Preparing</span><strong>{counts.preparing || 0}</strong></div>
          <div><span>Ready</span><strong>{counts.ready || 0}</strong></div>
          <div className={`kitchen-summary-overdue ${overdueCount ? "has-orders" : ""}`}>
            <span>10+ min old</span><strong>{overdueCount}</strong>
          </div>
        </div>

        {error && (
          <div className="kitchen-message kitchen-message-error" role="alert">
            <CircleAlert size={18} /> <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="kitchen-message kitchen-message-success" role="status">
            <CheckCircle2 size={18} /> <span>{notice}</span>
          </div>
        )}

        <div className="kitchen-filter-row" aria-label="Filter kitchen orders">
          {FILTERS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={filter === item.id ? "active" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.label}<span>{counts[item.id] || 0}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="kitchen-empty-state">
            <LoaderCircle className="kitchen-spin" size={28} />
            <h2>Loading kitchen queue…</h2>
            <p>Fetching active orders from your restaurant workspace.</p>
          </div>
        ) : visibleOrders.length ? (
          <div className="kitchen-order-grid">
            {visibleOrders.map((order) => {
              const action = NEXT_ACTION[order.status];
              const tableNumber = normalizeTableNumber(order.tableNumber);
              const ageSeconds = getOrderAgeSeconds(order.created_at, lastUpdated);
              const ageLevel = getOrderAgeLevel(ageSeconds);
              const ageCardClass =
                ageLevel === "overdue"
                  ? "is-overdue"
                  : ageLevel === "warning"
                    ? "is-age-warning"
                    : "";
              return (
                <article className={`kitchen-order-card status-${order.status} ${ageCardClass}`} key={order.id}>
                  <div className="kitchen-order-card-top">
                    <div>
                      <span className="kitchen-order-reference">ORDER #{getReference(order.id)}</span>
                      <h2>{tableNumber ? `Table ${tableNumber}` : "Restaurant order"}</h2>
                    </div>
                    <span className={`kitchen-status-pill status-${order.status}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </div>

                  <div className="kitchen-order-meta">
                    <span><Clock3 size={14} /> {formatOrderTime(order.created_at)}</span>
                    <span><Utensils size={14} /> {order.items.length} {order.items.length === 1 ? "item line" : "item lines"}</span>
                    <span className={`kitchen-order-age age-${ageLevel}`} title="Elapsed time since this order was placed">
                      <Clock3 size={13} /> {formatElapsedAge(ageSeconds)}
                    </span>
                  </div>

                  <div className="kitchen-customer">
                    <span>Customer</span>
                    <strong>{order.customer_name || "Guest"}</strong>
                    {order.customer_phone && <small>{order.customer_phone}</small>}
                  </div>

                  <div className="kitchen-items">
                    {(order.items || []).map((item) => (
                      <div className="kitchen-item-row" key={item.id}>
                        <span className="kitchen-quantity">{item.quantity}×</span>
                        <span className="kitchen-item-name">{item.item_name}</span>
                        <strong>{formatPrice(item.line_total)}</strong>
                      </div>
                    ))}
                    {!order.items.length && (
                      <p className="kitchen-no-items">No item details were returned for this order.</p>
                    )}
                  </div>

                  {order.notes && (
                    <div className="kitchen-order-notes">
                      <b>Special instructions</b>
                      <p>{order.notes}</p>
                    </div>
                  )}

                  <div className="kitchen-order-total">
                    <span>Order total</span>
                    <strong>{formatPrice(order.total_amount)}</strong>
                  </div>

                  {action ? (
                    <button
                      type="button"
                      className="kitchen-next-action"
                      onClick={() => updateStatus(order, action.next)}
                      disabled={Boolean(updatingOrderId)}
                    >
                      {updatingOrderId === order.id ? (
                        <LoaderCircle className="kitchen-spin" size={16} />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      {updatingOrderId === order.id ? "Updating…" : action.label}
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="kitchen-empty-state">
            <div className="kitchen-empty-icon"><ChefHat size={27} /></div>
            <h2>{filter === "all" ? "Kitchen is clear" : `No ${FILTERS.find((item) => item.id === filter)?.label.toLowerCase()} orders`}</h2>
            <p>
              {filter === "all"
                ? "New table orders will appear here automatically."
                : "Choose another status filter to see more active orders."}
            </p>
            <button type="button" className="kitchen-empty-refresh" onClick={() => setRefreshKey((value) => value + 1)}>
              <RefreshCw size={15} /> Refresh queue
            </button>
          </div>
        )}

        <footer className="kitchen-footer">
          <span>Queue refreshes every 15 seconds. Enable voice announcements to hear new order details.</span>
          <span>{lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Waiting for first refresh"}</span>
        </footer>
      </section>
    </main>
  );
}
