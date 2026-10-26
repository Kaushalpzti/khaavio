import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  Droplets,
  LoaderCircle,
  RefreshCw,
  ReceiptText,
  Utensils,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useKhaavioOperationalAlerts } from "../context/KhaavioOperationalAlertsContext";
import { cancelKhaavioVoice, isKhaavioVoiceSupported, queueKhaavioVoice } from "../lib/khaavioVoiceAlerts";
import "./ServiceRequestsDashboard.css";

const REQUEST_META = {
  waiter: { label: "Call waiter", Icon: BellRing },
  water: { label: "Water request", Icon: Droplets },
  bill: { label: "Request bill", Icon: ReceiptText },
  cutlery: { label: "Plates or cutlery", Icon: Utensils },
  other: { label: "Other request", Icon: UserRound },
};

const REQUEST_VOICE_META = {
  waiter: { en: "a waiter", hi: "वेटर" },
  water: { en: "water", hi: "पानी" },
  bill: { en: "the bill", hi: "बिल" },
  cutlery: { en: "plates or cutlery", hi: "प्लेट या कटलरी" },
  other: { en: "assistance", hi: "मदद" },
};

const STATUS_META = {
  pending: { label: "Needs attention", tone: "pending" },
  accepted: { label: "In progress", tone: "active" },
  served: { label: "Completed", tone: "done" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

const FILTERS = [
  { value: "active", label: "Active requests" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All requests" },
];

function formatDate(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function filterMatches(request, filter) {
  if (filter === "active") return request.status === "pending" || request.status === "accepted";
  if (filter === "completed") return request.status === "served" || request.status === "cancelled";
  return filter === "all" || request.status === filter;
}

export default function ServiceRequestsDashboard() {
  const { preferences, setPreference } = useKhaavioOperationalAlerts();
  const voiceEnabled = preferences.voiceEnabled;
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("active");
  const [initialLoading, setInitialLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedRestaurant = restaurants.find((item) => item.id === selectedRestaurantId) || null;

  useEffect(() => {
    let active = true;

    async function loadRestaurants() {
      setInitialLoading(true);
      setError("");
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData?.user) throw new Error("Please sign in to view service requests.");

        const { data, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name")
          .eq("owner_id", authData.user.id)
          .order("name", { ascending: true });
        if (restaurantError) throw restaurantError;
        if (!active) return;

        const owned = data || [];
        setRestaurants(owned);
        setSelectedRestaurantId((current) =>
          owned.some((item) => item.id === current) ? current : owned[0]?.id || "",
        );
        if (owned.length === 0) setNotice("Create your restaurant profile before receiving table service requests.");
      } catch (loadError) {
        if (active) setError(loadError?.message || "Could not load your restaurant account.");
      } finally {
        if (active) setInitialLoading(false);
      }
    }

    loadRestaurants();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedRestaurantId) {
      setRequests([]);
      return undefined;
    }

    let active = true;
    setRequestsLoading(true);
    setError("");

    async function loadRequests() {
      try {
        const [requestResult, tableResult] = await Promise.all([
          supabase
            .from("table_service_requests")
            .select("id, restaurant_id, table_id, request_type, note, status, created_at, updated_at, resolved_at")
            .eq("restaurant_id", selectedRestaurantId)
            .order("created_at", { ascending: false })
            .limit(150),
          supabase
            .from("restaurant_tables")
            .select("id, table_number")
            .eq("restaurant_id", selectedRestaurantId),
        ]);

        if (requestResult.error) throw requestResult.error;
        if (tableResult.error) throw tableResult.error;
        if (!active) return;

        const nextTableNumbers = Object.fromEntries(
          (tableResult.data || []).map((table) => [table.id, table.table_number]),
        );
        const nextRequests = (requestResult.data || []).map((request) => ({
          ...request,
          table_number: nextTableNumbers[request.table_id] || "Unknown table",
        }));
        // The app-level alert manager announces new requests across routes.
        setRequests(nextRequests);
      } catch (loadError) {
        if (active) setError(loadError?.message || "Unable to load service requests.");
      } finally {
        if (active) setRequestsLoading(false);
      }
    }

    loadRequests();
    return () => { active = false; };
  }, [selectedRestaurantId, refreshTick]);

  useEffect(() => {
    if (!selectedRestaurantId) return undefined;
    const channel = supabase
      .channel(`service-requests-${selectedRestaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "table_service_requests",
          filter: `restaurant_id=eq.${selectedRestaurantId}`,
        },
        () => setRefreshTick((value) => value + 1),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [selectedRestaurantId]);

  // Polling fallback catches new requests if Realtime disconnects or the browser reconnects late.
  useEffect(() => {
    if (!selectedRestaurantId) return undefined;
    const intervalId = window.setInterval(() => {
      setRefreshTick((value) => value + 1);
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [selectedRestaurantId]);

  const counts = useMemo(() => ({
    active: requests.filter((request) => request.status === "pending" || request.status === "accepted").length,
    pending: requests.filter((request) => request.status === "pending").length,
    accepted: requests.filter((request) => request.status === "accepted").length,
    completed: requests.filter((request) => request.status === "served" || request.status === "cancelled").length,
    all: requests.length,
  }), [requests]);

  const visibleRequests = useMemo(
    () => requests.filter((request) => filterMatches(request, filter)),
    [requests, filter],
  );

  async function updateRequest(request, nextStatus) {
    if (!selectedRestaurantId || updatingId) return;
    const previousStatus = request.status;
    setUpdatingId(request.id);
    setError("");
    setNotice("");
    try {
      const { data: updatedRow, error: updateError } = await supabase
        .from("table_service_requests")
        .update({ status: nextStatus })
        .eq("id", request.id)
        .eq("restaurant_id", selectedRestaurantId)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updatedRow?.id) throw new Error("This request may already have been updated. Refresh the queue and try again.");
      setNotice(nextStatus === "accepted" ? "Request accepted." : nextStatus === "served" ? "Request marked completed." : "Request cancelled.");
      setRefreshTick((value) => value + 1);
    } catch (updateError) {
      console.error("Could not update service request:", updateError);
      setError(updateError?.message || `Could not change request from ${previousStatus}.`);
    } finally {
      setUpdatingId("");
    }
  }

  function toggleVoiceAnnouncements() {
    if (voiceEnabled) {
      setPreference("voiceEnabled", false);
      cancelKhaavioVoice();
      setNotice("Voice alerts are off across the restaurant workspace.");
      return;
    }

    if (!isKhaavioVoiceSupported()) {
      setError("This browser does not support voice announcements. Try a current version of Chrome or Edge.");
      return;
    }

    cancelKhaavioVoice();
    const queued = queueKhaavioVoice((isHindi) => isHindi
      ? "टेबल सर्विस अलर्ट चालू हैं। नए अनुरोधों की आवाज़ में सूचना दी जाएगी।"
      : "Table service voice alerts are enabled. New guest requests will be announced.");
    if (!queued) {
      setError("Voice announcements could not be started in this browser.");
      return;
    }

    setPreference("voiceEnabled", true);
    setError("");
    setNotice("Voice alerts are on across the restaurant workspace.");
  }

  if (initialLoading) {
    return (
      <main className="service-requests-page">
        <section className="service-requests-state">
          <LoaderCircle className="service-requests-spinner" size={28} />
          <h1>Loading service requests…</h1>
          <p>Connecting to your restaurant workspace.</p>
        </section>
      </main>
    );
  }

  if (restaurants.length === 0) {
    return (
      <main className="service-requests-page">
        <section className="service-requests-state">
          <span className="service-requests-state-icon"><BellRing size={25} /></span>
          <h1>Service requests</h1>
          <p>{notice || "Your restaurant profile is needed before service requests can appear here."}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="service-requests-page">
      <header className="service-requests-header">
        <div>
          <span className="service-requests-eyebrow"><BellRing size={14} /> TABLE SERVICE</span>
          <h1>Service requests</h1>
          <p>See what guests need and keep every table moving smoothly.</p>
        </div>
        <div className="service-requests-header-actions">
          {restaurants.length > 1 && (
            <label className="service-requests-restaurant-select">
              <span>Restaurant</span>
              <select value={selectedRestaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
                {restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className={`service-requests-voice${voiceEnabled ? " is-active" : ""}`}
            onClick={toggleVoiceAnnouncements}
            aria-pressed={voiceEnabled}
            title={voiceEnabled ? "Disable spoken table service requests" : "Enable spoken table service requests"}
          >
            {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {voiceEnabled ? "Voice on" : "Enable voice"}
          </button>
          <button type="button" className="service-requests-refresh" onClick={() => setRefreshTick((value) => value + 1)} disabled={requestsLoading}>
            {requestsLoading ? <LoaderCircle className="service-requests-spinner" size={16} /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>
      </header>

      <section className="service-requests-summary" aria-label="Request summary">
        <div className="service-requests-summary-main">
          <span className="service-requests-summary-icon"><BellRing size={21} /></span>
          <div><small>Needs attention</small><strong>{counts.pending}</strong></div>
        </div>
        <div className="service-requests-summary-item"><small>In progress</small><strong>{counts.accepted}</strong></div>
        <div className="service-requests-summary-item"><small>Resolved</small><strong>{counts.completed}</strong></div>
      </section>

      <section className="service-requests-list-panel">
        <div className="service-requests-list-header">
          <div>
            <h2>{selectedRestaurant?.name || "Restaurant requests"}</h2>
            <p>New requests appear here automatically while this page is open.</p>
          </div>
          <span className={`service-requests-live${requestsLoading ? " is-loading" : ""}`}><span /> Live updates</span>
        </div>

        <div className="service-requests-filters" role="tablist" aria-label="Filter requests">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              className={filter === item.value ? "is-active" : ""}
              onClick={() => setFilter(item.value)}
            >
              {item.label}<span>{counts[item.value]}</span>
            </button>
          ))}
        </div>

        {error && <div className="service-requests-alert is-error" role="alert"><CircleAlert size={17} /><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={15} /></button></div>}
        {notice && <div className="service-requests-alert is-success" role="status"><CheckCircle2Fallback /><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15} /></button></div>}

        {requestsLoading && requests.length === 0 ? (
          <div className="service-requests-empty"><LoaderCircle className="service-requests-spinner" size={24} /><p>Loading requests…</p></div>
        ) : visibleRequests.length === 0 ? (
          <div className="service-requests-empty">
            <span><CheckCheck size={25} /></span>
            <h3>{filter === "active" || filter === "pending" ? "All caught up" : "No requests here yet"}</h3>
            <p>{filter === "active" ? "When a guest calls for help from their table QR, it will show up here." : "Try another filter or check again when a guest sends a request."}</p>
          </div>
        ) : (
          <div className="service-requests-cards">
            {visibleRequests.map((request) => {
              const meta = REQUEST_META[request.request_type] || REQUEST_META.other;
              const status = STATUS_META[request.status] || STATUS_META.pending;
              const Icon = meta.Icon;
              const isUpdating = updatingId === request.id;
              const isActive = request.status === "pending" || request.status === "accepted";
              return (
                <article className={`service-request-card status-${status.tone}`} key={request.id}>
                  <div className="service-request-card-top">
                    <span className={`service-request-type-icon type-${request.request_type}`}><Icon size={19} /></span>
                    <div className="service-request-title-copy">
                      <h3>{meta.label}</h3>
                      <p><strong>Table {request.table_number}</strong><span className="service-request-dot">·</span>{formatDate(request.created_at)}</p>
                    </div>
                    <span className={`service-request-status status-${status.tone}`}><span />{status.label}</span>
                  </div>
                  {request.note && <p className="service-request-note">{request.note}</p>}
                  {isActive && (
                    <div className="service-request-actions">
                      {request.status === "pending" && (
                        <button type="button" className="service-request-accept" disabled={Boolean(updatingId)} onClick={() => updateRequest(request, "accepted")}>
                          {isUpdating ? <LoaderCircle className="service-requests-spinner" size={15} /> : <Check size={15} />} Accept request
                        </button>
                      )}
                      <button type="button" className="service-request-complete" disabled={Boolean(updatingId)} onClick={() => updateRequest(request, "served")}>
                        {isUpdating ? <LoaderCircle className="service-requests-spinner" size={15} /> : <CheckCheck size={15} />} Mark completed
                      </button>
                      <button type="button" className="service-request-cancel" disabled={Boolean(updatingId)} onClick={() => updateRequest(request, "cancelled")} aria-label={`Cancel ${meta.label} for table ${request.table_number}`}>
                        <X size={15} />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function CheckCircle2Fallback() {
  return <CheckCheck size={17} aria-hidden="true" />;
}
