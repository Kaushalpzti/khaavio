import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Download,
  LoaderCircle,
  LayoutGrid,
  List,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Store,
  Users,
  XCircle,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { usePlanAccess } from "../context/PlanAccessContext";
import PlanUpgradeNotice from "../components/PlanUpgradeNotice";
import "./BookingsDashboard.css";

const INITIAL_TODAY = new Date();

const STATUSES = [
  "all",
  "pending",
  "confirmed",
  "rejected",
  "cancelled",
  "completed",
];

const LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
};

const ACTIONS = {
  pending: [
    {
      status: "confirmed",
      label: "Confirm booking",
      type: "primary",
    },
    {
      status: "rejected",
      label: "Reject",
      type: "danger",
    },
  ],
  confirmed: [
    {
      status: "completed",
      label: "Mark completed",
      type: "primary",
    },
    {
      status: "cancelled",
      label: "Cancel booking",
      type: "danger",
    },
  ],
  rejected: [],
  cancelled: [],
  completed: [],
};

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getReference(id) {
  if (!id) return "UNKNOWN";

  return String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
}

function getErrorMessage(error, fallback) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : fallback;
}

function getLocalDateKey(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCalendarDays(monthDate) {
  const firstOfMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth(),
    1,
  );
  const firstVisibleDay = new Date(
    firstOfMonth.getFullYear(),
    firstOfMonth.getMonth(),
    1 - firstOfMonth.getDay(),
  );

  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(
        firstVisibleDay.getFullYear(),
        firstVisibleDay.getMonth(),
        firstVisibleDay.getDate() + index,
      ),
  );
}

function formatCalendarTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function csvEscape(value) {
  let text = String(value ?? "");

  // Prevent spreadsheet applications from evaluating untrusted text as formulas.
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

// WhatsApp expects a phone number with country code and digits only.
// Khaavio's primary market is India, so a 10-digit local number is treated
// as an Indian mobile number. Numbers already containing a country code are
// kept as entered after punctuation is removed.
function getWhatsAppPhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.length === 10) {
    digits = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = `91${digits.slice(1)}`;
  }

  return digits.length >= 10 && digits.length <= 15 ? digits : "";
}

function getBookingWhatsAppUrl(booking, restaurantName) {
  const phone = getWhatsAppPhone(booking.guest_phone);
  if (!phone || !restaurantName) return "";

  const reference = getReference(booking.id);
  const dateTime = formatDate(booking.booking_time);
  const guestName = booking.guest_name || "there";
  const table = booking.table_number || "Assigned table";
  const guestCount = `${booking.party_size} ${booking.party_size === 1 ? "guest" : "guests"}`;

  const messages = {
    confirmed: `Hi ${guestName}, your table reservation at ${restaurantName} is confirmed!\n\nBooking reference: #${reference}\nDate & time: ${dateTime}\nTable: ${table}\nGuests: ${guestCount}\n\nWe look forward to welcoming you.`,
    rejected: `Hi ${guestName}, thank you for considering ${restaurantName}. Unfortunately, we couldn't accept your table reservation request.\n\nBooking reference: #${reference}\nRequested date & time: ${dateTime}\n\nPlease contact the restaurant if you'd like help checking another time.`,
    cancelled: `Hi ${guestName}, your table reservation at ${restaurantName} has been cancelled.\n\nBooking reference: #${reference}\nDate & time: ${dateTime}\nTable: ${table}\n\nPlease contact the restaurant if you have any questions.`,
  };

  const message = messages[booking.status];
  if (!message) return "";

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function BookingsDashboard() {
  const navigate = useNavigate();
  const { hasFeature } = usePlanAccess();
  const canUseAdvancedBooking = hasFeature("booking_advanced");
  const canExportBookings = hasFeature("booking_export");

  const [restaurant, setRestaurant] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("all");
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingDateFrom, setBookingDateFrom] = useState("");
  const [bookingDateTo, setBookingDateTo] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() =>
    getLocalDateKey(new Date()),
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatingBookingId, setUpdatingBookingId] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState("CONNECTING");
  const knownBookingIdsRef = useRef(null);

  // Keep today's date current without creating Date during render.
  const [today, setToday] = useState(INITIAL_TODAY);
  const displayViewMode = canUseAdvancedBooking ? viewMode : "list";

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setToday(new Date());
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // Fetch this owner's restaurant and its bookings.
  useEffect(() => {
    let active = true;

    async function loadBookings() {
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
          setBookings([]);
          return;
        }

        setRestaurant(restaurantData);

        const { data: bookingData, error: bookingError } = await supabase
          .from("bookings")
          .select(
            "id, restaurant_id, table_id, guest_name, guest_email, guest_phone, party_size, booking_time, special_requests, status, created_at, updated_at",
          )
          .eq("restaurant_id", restaurantData.id)
          .order("booking_time", { ascending: true });

        if (bookingError) throw bookingError;

        const { data: tableData, error: tableError } = await supabase
          .from("restaurant_tables")
          .select("id, table_number")
          .eq("restaurant_id", restaurantData.id);

        if (tableError) throw tableError;
        if (!active) return;

        const tableNames = new Map(
          (tableData || []).map((table) => [table.id, table.table_number]),
        );

        const enrichedBookings = (bookingData || []).map((booking) => ({
          ...booking,
          table_number: booking.table_id
            ? tableNames.get(booking.table_id) || "Assigned table"
            : "No table assigned",
        }));

        // Identify bookings that appeared after the first successful load.
        // This works for both realtime events and the polling fallback.
        const currentBookingIds = new Set(
          enrichedBookings.map((booking) => booking.id),
        );
        const previousBookingIds = knownBookingIdsRef.current;

        if (previousBookingIds) {
          const newBookingCount = enrichedBookings.filter(
            (booking) => !previousBookingIds.has(booking.id),
          ).length;

          if (newBookingCount === 1) {
            setNotice("A new booking request has arrived.");
          } else if (newBookingCount > 1) {
            setNotice(`${newBookingCount} new booking requests have arrived.`);
          }
        }

        knownBookingIdsRef.current = currentBookingIds;
        setBookings(enrichedBookings);
      } catch (err) {
        if (active) {
          setError(getErrorMessage(err, "Unable to load restaurant bookings."));
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadBookings();

    return () => {
      active = false;
    };
  }, [navigate, refreshKey]);

  // Subscribe to new booking inserts. If Supabase Realtime is not enabled for
  // the bookings table, a 30-second polling fallback below still refreshes it.
  useEffect(() => {
    const restaurantId = restaurant?.id;
    if (!restaurantId) return undefined;

    const channel = supabase
      .channel(`booking-alerts-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          setNotice("A new booking request has arrived.");
          setRefreshKey((current) => current + 1);
        },
      )
      .subscribe((status) => {
        setRealtimeStatus(status);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurant?.id]);

  // Poll every 30 seconds as a reliable fallback and to pick up status changes
  // made elsewhere, even if database realtime events are unavailable.
  useEffect(() => {
    if (!restaurant?.id) return undefined;

    const intervalId = window.setInterval(() => {
      setRefreshKey((current) => current + 1);
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [restaurant?.id]);

  async function updateBookingStatus(booking, nextStatus) {
    const allowedActions = ACTIONS[booking.status] || [];

    const isAllowed = allowedActions.some(
      (action) => action.status === nextStatus,
    );

    if (!isAllowed || updatingBookingId || !restaurant) {
      return;
    }

    if (
      ["rejected", "cancelled"].includes(nextStatus) &&
      !window.confirm(
        `${LABELS[nextStatus]} booking #${getReference(booking.id)}?`,
      )
    ) {
      return;
    }

    setError("");
    setNotice("");
    setUpdatingBookingId(booking.id);

    try {
      const { data, error: updateError } = await supabase.rpc(
        "update_booking_status",
        {
          p_booking_id: booking.id,
          p_status: nextStatus,
        },
      );

      if (updateError) throw updateError;

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.booking_id) {
        throw new Error("The booking status update could not be confirmed.");
      }

      setBookings((current) =>
        current.map((entry) =>
          entry.id === result.booking_id
            ? {
                ...entry,
                status: result.booking_status,
                updated_at: result.updated_at,
              }
            : entry,
        ),
      );

      setNotice(
        `Booking #${getReference(booking.id)} updated to ${
          LABELS[result.booking_status] || result.booking_status
        }.`,
      );
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "Could not update this booking. Refresh and try again.",
        ),
      );
    } finally {
      setUpdatingBookingId("");
    }
  }

  function refreshBookings() {
    if (loading || refreshing) return;

    setError("");
    setNotice("");
    setRefreshing(true);
    setRefreshKey((current) => current + 1);
  }

  function shiftCalendarMonth(offset) {
    const nextMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + offset,
      1,
    );
    setCalendarMonth(nextMonth);
    setSelectedCalendarDate(getLocalDateKey(nextMonth));
  }

  const searchTerm = (canUseAdvancedBooking ? bookingSearch : "").trim().toLocaleLowerCase();
  const effectiveBookingDateFrom = canUseAdvancedBooking ? bookingDateFrom : "";
  const effectiveBookingDateTo = canUseAdvancedBooking ? bookingDateTo : "";
  const hasSearchOrDateFilters = canUseAdvancedBooking && Boolean(
    searchTerm || effectiveBookingDateFrom || effectiveBookingDateTo,
  );

  const visibleBookings = bookings.filter((booking) => {
    if (filter !== "all" && booking.status !== filter) return false;

    const bookingDay = getLocalDateKey(booking.booking_time);
    if (effectiveBookingDateFrom && (!bookingDay || bookingDay < effectiveBookingDateFrom)) {
      return false;
    }
    if (effectiveBookingDateTo && (!bookingDay || bookingDay > effectiveBookingDateTo)) {
      return false;
    }

    if (!searchTerm) return true;

    const searchableText = [
      booking.guest_name,
      booking.guest_phone,
      booking.guest_email,
      booking.special_requests,
      booking.table_number,
      getReference(booking.id),
      booking.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();

    return searchableText.includes(searchTerm);
  });

  function clearBookingFilters() {
    setBookingSearch("");
    setBookingDateFrom("");
    setBookingDateTo("");
    setFilter("all");
  }

  function exportBookingsCsv() {
    if (!canExportBookings || visibleBookings.length === 0) return;

    const rows = [
      [
        "Booking reference",
        "Guest name",
        "Phone",
        "Email",
        "Booking date and time",
        "Guests",
        "Table",
        "Status",
        "Special requests",
        "Requested at",
      ],
      ...visibleBookings.map((booking) => [
        getReference(booking.id),
        booking.guest_name,
        booking.guest_phone,
        booking.guest_email,
        formatDate(booking.booking_time),
        booking.party_size,
        booking.table_number,
        LABELS[booking.status] || booking.status,
        booking.special_requests,
        formatDate(booking.created_at),
      ]),
    ];

    const csv = `\uFEFF${rows
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `khaavio-bookings-${getLocalDateKey(today)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      `Exported ${visibleBookings.length} booking${visibleBookings.length === 1 ? "" : "s"} to CSV.`,
    );
  }

  const pendingCount = bookings.filter(
    (booking) => booking.status === "pending",
  ).length;

  const confirmedCount = bookings.filter(
    (booking) => booking.status === "confirmed",
  ).length;

  const todayCount = bookings.filter((booking) => {
    const date = new Date(booking.booking_time);

    return (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate() &&
      ["pending", "confirmed"].includes(booking.status)
    );
  }).length;

  const calendarDays = getCalendarDays(calendarMonth);
  const calendarMonthLabel = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(calendarMonth);
  const selectedCalendarDateLabel = selectedCalendarDate
    ? new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(`${selectedCalendarDate}T12:00:00`))
    : "Selected date";
  const calendarBookingsByDate = new Map();

  for (const booking of visibleBookings) {
    const dateKey = getLocalDateKey(booking.booking_time);
    if (!dateKey) continue;
    const dayBookings = calendarBookingsByDate.get(dateKey) || [];
    dayBookings.push(booking);
    calendarBookingsByDate.set(dateKey, dayBookings);
  }

  const selectedDateBookings =
    calendarBookingsByDate.get(selectedCalendarDate) || [];
  const calendarMonthBookingCount = visibleBookings.filter((booking) => {
    const date = new Date(booking.booking_time);
    return (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === calendarMonth.getFullYear() &&
      date.getMonth() === calendarMonth.getMonth()
    );
  }).length;

  if (loading) {
    return (
      <main className="bookings-state">
        <LoaderCircle className="bookings-spinner" size={30} />
        <p>Loading reservations...</p>
      </main>
    );
  }

  return (
    <main className="bookings-page">
      <header className="bookings-header">
        <Link to="/dashboard" className="bookings-back">
          <ArrowLeft size={17} />
          Dashboard
        </Link>

        <button
          type="button"
          className="bookings-refresh"
          onClick={refreshBookings}
          disabled={refreshing}
        >
          {refreshing ? (
            <LoaderCircle size={16} className="bookings-spinner" />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh
        </button>
      </header>

      <div className="bookings-container">
        <div className="bookings-heading">
          <span className="bookings-eyebrow">RESTAURANT WORKSPACE</span>

          <h1>Table bookings</h1>

          <p>
            Manage reservation requests
            {restaurant ? ` at ${restaurant.name}.` : "."}
          </p>
        </div>

        {error && (
          <div className="bookings-alert bookings-alert-error" role="alert">
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
          <div className="bookings-alert bookings-alert-success" role="status">
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
          <section className="bookings-empty">
            <Store size={34} />
            <h2>Restaurant not found</h2>
            <p>Complete restaurant setup before managing bookings.</p>

            <Link to="/onboarding" className="bookings-primary-button">
              Complete setup
            </Link>
          </section>
        ) : (
          <>
            <section className="bookings-stats">
              <article className="bookings-stat">
                <div className="bookings-stat-icon pending-stat">
                  <Clock3 size={20} />
                </div>
                <span>Pending requests</span>
                <strong>{pendingCount}</strong>
              </article>

              <article className="bookings-stat">
                <div className="bookings-stat-icon confirmed-stat">
                  <CheckCircle2 size={20} />
                </div>
                <span>Confirmed</span>
                <strong>{confirmedCount}</strong>
              </article>

              <article className="bookings-stat">
                <div className="bookings-stat-icon today-stat">
                  <CalendarDays size={20} />
                </div>
                <span>Today’s bookings</span>
                <strong>{todayCount}</strong>
              </article>

              <article className="bookings-stat">
                <div className="bookings-stat-icon total-stat">
                  <Users size={20} />
                </div>
                <span>All requests</span>
                <strong>{bookings.length}</strong>
              </article>
            </section>

            <section className="bookings-list-section">
              <div className="bookings-list-heading">
                <div>
                  <span className="bookings-eyebrow">
                    RESERVATION MANAGEMENT
                  </span>
                  <h2>Booking requests</h2>
                </div>

                <span
                  className="bookings-live-status"
                  role="status"
                  title={
                    realtimeStatus === "SUBSCRIBED"
                      ? "New booking inserts are sent through Supabase Realtime. The list also refreshes every 30 seconds."
                      : "Realtime is unavailable or connecting. The list refreshes every 30 seconds as a fallback."
                  }
                >
                  <span
                    className={`bookings-live-dot ${
                      realtimeStatus === "SUBSCRIBED" ? "is-connected" : ""
                    }`}
                    aria-hidden="true"
                  />
                  {realtimeStatus === "SUBSCRIBED"
                    ? "Live booking alerts · sync every 30 sec"
                    : "Auto-refresh every 30 sec"}
                </span>
              </div>

              <div
                className="bookings-view-switch"
                role="group"
                aria-label="Booking view"
              >
                <button
                  type="button"
                  className={displayViewMode === "list" ? "active" : ""}
                  aria-pressed={displayViewMode === "list"}
                  onClick={() => setViewMode("list")}
                >
                  <List size={16} />
                  List
                </button>
                <button
                  type="button"
                  className={displayViewMode === "calendar" ? "active" : ""}
                  aria-pressed={displayViewMode === "calendar"}
                  onClick={() => setViewMode("calendar")}
                  disabled={!canUseAdvancedBooking}
                  title={canUseAdvancedBooking ? "Show calendar view" : "Available on the Growth plan"}
                >
                  <LayoutGrid size={16} />
                  {canUseAdvancedBooking ? "Calendar" : "Calendar · Growth"}
                </button>
              </div>

              <div
                className="bookings-tools"
                aria-label="Search and filter bookings"
              >
                <label className="bookings-search-field">
                  <Search size={17} aria-hidden="true" />
                  <span className="sr-only">Search bookings</span>
                  <input
                    type="search"
                    value={bookingSearch}
                    disabled={!canUseAdvancedBooking}
                    onChange={(event) => setBookingSearch(event.target.value)}
                    placeholder="Search name, phone, email, table or reference"
                  />
                </label>

                <label className="bookings-date-filter">
                  <span>From</span>
                  <input
                    type="date"
                    value={bookingDateFrom}
                    disabled={!canUseAdvancedBooking}
                    max={bookingDateTo || undefined}
                    onChange={(event) => setBookingDateFrom(event.target.value)}
                    aria-label="Booking date from"
                  />
                </label>

                <label className="bookings-date-filter">
                  <span>To</span>
                  <input
                    type="date"
                    value={bookingDateTo}
                    disabled={!canUseAdvancedBooking}
                    min={bookingDateFrom || undefined}
                    onChange={(event) => setBookingDateTo(event.target.value)}
                    aria-label="Booking date to"
                  />
                </label>

                <button
                  type="button"
                  className="bookings-export-button"
                  onClick={exportBookingsCsv}
                  disabled={!canExportBookings || visibleBookings.length === 0}
                  title={canExportBookings ? "Export visible bookings" : "CSV export is available on Growth"}
                >
                  <Download size={16} />
                  {canExportBookings ? `Export CSV (${visibleBookings.length})` : "Export CSV · Growth"}
                </button>
              </div>

              {!canUseAdvancedBooking && (
                <PlanUpgradeNotice compact title="Unlock advanced booking tools" description="Growth adds calendar view, advanced search, date filters and CSV export." />
              )}

              {(hasSearchOrDateFilters || filter !== "all") && (
                <button
                  type="button"
                  className="bookings-clear-filters"
                  onClick={clearBookingFilters}
                >
                  Clear search and filters
                </button>
              )}

              <div className="bookings-filters">
                {STATUSES.map((status) => {
                  const count =
                    status === "all"
                      ? bookings.length
                      : bookings.filter((booking) => booking.status === status)
                          .length;

                  return (
                    <button
                      type="button"
                      key={status}
                      className={filter === status ? "active" : ""}
                      onClick={() => setFilter(status)}
                    >
                      {status === "all" ? "All" : LABELS[status]}

                      <span>{count}</span>
                    </button>
                  );
                })}
              </div>

              {displayViewMode === "list" ? (
                <>
                  {visibleBookings.length > 0 ? (
                    <div className="bookings-grid">
                      {visibleBookings.map((booking) => {
                        const actions = ACTIONS[booking.status] || [];
                        return (
                          <article className="booking-card" key={booking.id}>
                            <div className="booking-card-header">
                              <div className="booking-reference">
                                <span>BOOKING</span>
                                <strong>#{getReference(booking.id)}</strong>
                              </div>

                              <span
                                className={`booking-status status-${booking.status}`}
                              >
                                {LABELS[booking.status] || booking.status}
                              </span>
                            </div>

                            <div className="booking-guest">
                              <h3>{booking.guest_name}</h3>

                              <div className="booking-meta">
                                <span>
                                  <CalendarDays size={14} />
                                  {formatDate(booking.booking_time)}
                                </span>

                                <span>
                                  <Users size={14} />
                                  {booking.party_size}{" "}
                                  {booking.party_size === 1
                                    ? "guest"
                                    : "guests"}
                                </span>
                              </div>

                              <div className="booking-table-label">
                                <Store size={14} />
                                {booking.table_number}
                              </div>

                              {booking.guest_phone && (
                                <a
                                  className="booking-contact"
                                  href={`tel:${booking.guest_phone}`}
                                >
                                  <Phone size={14} />
                                  {booking.guest_phone}
                                </a>
                              )}

                              {booking.guest_email && (
                                <a
                                  className="booking-contact"
                                  href={`mailto:${booking.guest_email}`}
                                >
                                  <Mail size={14} />
                                  {booking.guest_email}
                                </a>
                              )}
                            </div>

                            {booking.special_requests && (
                              <div className="booking-special-requests">
                                <strong>Special requests</strong>
                                <p>{booking.special_requests}</p>
                              </div>
                            )}

                            <div className="booking-created">
                              Requested {formatDate(booking.created_at)}
                            </div>

                            {actions.length > 0 ? (
                              <div className="booking-actions">
                                {actions.map((action) => (
                                  <button
                                    key={action.status}
                                    type="button"
                                    className={`booking-action-button ${action.type}`}
                                    onClick={() =>
                                      updateBookingStatus(
                                        booking,
                                        action.status,
                                      )
                                    }
                                    disabled={updatingBookingId === booking.id}
                                  >
                                    {updatingBookingId === booking.id ? (
                                      <LoaderCircle
                                        size={15}
                                        className="bookings-spinner"
                                      />
                                    ) : action.type === "danger" ? (
                                      <XCircle size={15} />
                                    ) : (
                                      <CheckCircle2 size={15} />
                                    )}

                                    {updatingBookingId === booking.id
                                      ? "Updating..."
                                      : action.label}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="booking-final-status">
                                {["confirmed", "completed"].includes(
                                  booking.status,
                                ) ? (
                                  <CheckCircle2 size={15} />
                                ) : (
                                  <XCircle size={15} />
                                )}

                                {LABELS[booking.status] || booking.status}
                              </div>
                            )}

                            {["confirmed", "rejected", "cancelled"].includes(
                              booking.status,
                            ) &&
                              booking.guest_phone &&
                              getBookingWhatsAppUrl(
                                booking,
                                restaurant.name,
                              ) && (
                                <div className="booking-whatsapp-row">
                                  <a
                                    className="booking-whatsapp-link"
                                    href={getBookingWhatsAppUrl(
                                      booking,
                                      restaurant.name,
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Open WhatsApp message for ${booking.guest_name}`}
                                  >
                                    <MessageCircle size={16} />
                                    Message guest on WhatsApp
                                  </a>
                                </div>
                              )}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bookings-empty">
                      <div className="bookings-empty-icon">
                        <CalendarDays size={28} />
                      </div>

                      <h3>
                        {bookings.length === 0
                          ? "No reservations yet"
                          : hasSearchOrDateFilters
                            ? "No matching bookings"
                            : "No bookings in this category"}
                      </h3>

                      <p>
                        {bookings.length === 0
                          ? "Customer reservation requests will appear here."
                          : hasSearchOrDateFilters
                            ? "Try changing the search term or date range."
                            : "Choose another status filter to view bookings."}
                      </p>
                      {bookings.length > 0 &&
                        (hasSearchOrDateFilters || filter !== "all") && (
                          <button
                            type="button"
                            className="bookings-primary-button"
                            onClick={clearBookingFilters}
                          >
                            Clear filters
                          </button>
                        )}
                    </div>
                  )}
                </>
              ) : (
                <section
                  className="bookings-calendar"
                  aria-label="Booking calendar"
                >
                  <div className="bookings-calendar-toolbar">
                    <div className="bookings-calendar-month">
                      <h3>{calendarMonthLabel}</h3>
                      <p>
                        {calendarMonthBookingCount} matching booking
                        {calendarMonthBookingCount === 1 ? "" : "s"} this month
                      </p>
                    </div>
                    <div className="bookings-calendar-navigation">
                      <button
                        type="button"
                        className="bookings-calendar-nav-button"
                        onClick={() => shiftCalendarMonth(-1)}
                        aria-label="Previous month"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        className="bookings-calendar-today-button"
                        onClick={() => {
                          const now = new Date();
                          setCalendarMonth(
                            new Date(now.getFullYear(), now.getMonth(), 1),
                          );
                          setSelectedCalendarDate(getLocalDateKey(now));
                        }}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        className="bookings-calendar-nav-button"
                        onClick={() => shiftCalendarMonth(1)}
                        aria-label="Next month"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>

                  <div
                    className="bookings-calendar-weekdays"
                    aria-hidden="true"
                  >
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (day) => (
                        <span key={day}>{day}</span>
                      ),
                    )}
                  </div>

                  <div className="bookings-calendar-grid">
                    {calendarDays.map((day) => {
                      const dateKey = getLocalDateKey(day);
                      const dayBookings =
                        calendarBookingsByDate.get(dateKey) || [];
                      const isOutsideMonth =
                        day.getMonth() !== calendarMonth.getMonth() ||
                        day.getFullYear() !== calendarMonth.getFullYear();
                      const isToday = dateKey === getLocalDateKey(today);
                      const isSelected = dateKey === selectedCalendarDate;
                      const dayStatuses = [
                        ...new Set(
                          dayBookings.map((booking) => booking.status),
                        ),
                      ].slice(0, 3);

                      return (
                        <button
                          type="button"
                          key={dateKey}
                          className={`bookings-calendar-day${isOutsideMonth ? " is-outside-month" : ""}${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}${dayBookings.length ? " has-bookings" : ""}`}
                          aria-pressed={isSelected}
                          aria-label={`${day.toLocaleDateString("en-IN", { dateStyle: "full" })}, ${dayBookings.length} matching booking${dayBookings.length === 1 ? "" : "s"}`}
                          onClick={() => {
                            setSelectedCalendarDate(dateKey);
                            if (isOutsideMonth) {
                              setCalendarMonth(
                                new Date(day.getFullYear(), day.getMonth(), 1),
                              );
                            }
                          }}
                        >
                          <span className="bookings-calendar-day-number">
                            {day.getDate()}
                          </span>
                          {dayBookings.length > 0 && (
                            <span className="bookings-calendar-day-count">
                              {dayBookings.length}
                            </span>
                          )}
                          <span
                            className="bookings-calendar-day-dots"
                            aria-hidden="true"
                          >
                            {dayStatuses.map((status) => (
                              <i
                                key={status}
                                className={`bookings-calendar-status-dot dot-${status}`}
                              />
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className="bookings-calendar-legend"
                    aria-label="Booking status legend"
                  >
                    <span>
                      <i className="bookings-calendar-status-dot dot-pending" />{" "}
                      Pending
                    </span>
                    <span>
                      <i className="bookings-calendar-status-dot dot-confirmed" />{" "}
                      Confirmed
                    </span>
                    <span>
                      <i className="bookings-calendar-status-dot dot-completed" />{" "}
                      Completed
                    </span>
                    <span>
                      <i className="bookings-calendar-status-dot dot-cancelled" />{" "}
                      Cancelled / rejected
                    </span>
                  </div>

                  <div className="bookings-calendar-agenda">
                    <div className="bookings-calendar-agenda-heading">
                      <div>
                        <span className="bookings-eyebrow">DAILY AGENDA</span>
                        <h3>{selectedCalendarDateLabel}</h3>
                      </div>
                      <span className="bookings-calendar-agenda-count">
                        {selectedDateBookings.length} booking
                        {selectedDateBookings.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    {selectedDateBookings.length ? (
                      <div className="bookings-calendar-agenda-list">
                        {[...selectedDateBookings]
                          .sort(
                            (a, b) =>
                              new Date(a.booking_time) -
                              new Date(b.booking_time),
                          )
                          .map((booking) => {
                            const actions = ACTIONS[booking.status] || [];
                            return (
                              <article
                                className="bookings-calendar-event"
                                key={booking.id}
                              >
                                <div className="bookings-calendar-event-time">
                                  <strong>
                                    {formatCalendarTime(booking.booking_time)}
                                  </strong>
                                  <span>#{getReference(booking.id)}</span>
                                </div>
                                <div className="bookings-calendar-event-main">
                                  <div className="bookings-calendar-event-title-row">
                                    <h4>{booking.guest_name}</h4>
                                    <span
                                      className={`booking-status status-${booking.status}`}
                                    >
                                      {LABELS[booking.status] || booking.status}
                                    </span>
                                  </div>
                                  <p>
                                    {booking.table_number} ·{" "}
                                    {booking.party_size}{" "}
                                    {booking.party_size === 1
                                      ? "guest"
                                      : "guests"}
                                    {booking.guest_phone
                                      ? ` · ${booking.guest_phone}`
                                      : ""}
                                  </p>
                                  {booking.special_requests && (
                                    <p className="bookings-calendar-event-requests">
                                      {booking.special_requests}
                                    </p>
                                  )}
                                  {actions.length > 0 && (
                                    <div className="booking-actions bookings-calendar-event-actions">
                                      {actions.map((action) => (
                                        <button
                                          key={action.status}
                                          type="button"
                                          className={`booking-action-button ${action.type}`}
                                          onClick={() =>
                                            updateBookingStatus(
                                              booking,
                                              action.status,
                                            )
                                          }
                                          disabled={
                                            updatingBookingId === booking.id
                                          }
                                        >
                                          {updatingBookingId === booking.id ? (
                                            <LoaderCircle
                                              size={15}
                                              className="bookings-spinner"
                                            />
                                          ) : action.type === "danger" ? (
                                            <XCircle size={15} />
                                          ) : (
                                            <CheckCircle2 size={15} />
                                          )}
                                          {updatingBookingId === booking.id
                                            ? "Updating..."
                                            : action.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {[
                                    "confirmed",
                                    "rejected",
                                    "cancelled",
                                  ].includes(booking.status) &&
                                    booking.guest_phone &&
                                    getBookingWhatsAppUrl(
                                      booking,
                                      restaurant.name,
                                    ) && (
                                      <div className="booking-whatsapp-row">
                                        <a
                                          className="booking-whatsapp-link"
                                          href={getBookingWhatsAppUrl(
                                            booking,
                                            restaurant.name,
                                          )}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <MessageCircle size={15} /> Message
                                          guest on WhatsApp
                                        </a>
                                      </div>
                                    )}
                                </div>
                              </article>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="bookings-calendar-agenda-empty">
                        <CalendarDays size={22} />
                        <strong>No matching bookings on this date</strong>
                        <span>
                          Try another day or adjust the current status, search
                          or date filters.
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </section>

            <footer className="bookings-footer">
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
