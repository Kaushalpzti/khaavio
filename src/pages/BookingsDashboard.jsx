import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Mail,
  Phone,
  RefreshCw,
  Store,
  Users,
  XCircle,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import khaavioIcon from "../assets/icon.png";
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

export default function BookingsDashboard() {
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatingBookingId, setUpdatingBookingId] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Keep today's date current without creating Date during render.
  const [today, setToday] = useState(INITIAL_TODAY);

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

  const visibleBookings =
    filter === "all"
      ? bookings
      : bookings.filter((booking) => booking.status === filter);

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

        <Link to="/" className="bookings-brand">
          <img src={khaavioIcon} alt="" />
          Khaavio
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

                <span className="bookings-refresh-hint">
                  Refresh to check for new bookings
                </span>
              </div>

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
                              {booking.party_size === 1 ? "guest" : "guests"}
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
                                  updateBookingStatus(booking, action.status)
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
                    {bookings.length > 0
                      ? "No bookings in this category"
                      : "No reservations yet"}
                  </h3>

                  <p>
                    {bookings.length > 0
                      ? "Choose another status filter to view bookings."
                      : "Customer reservation requests will appear here."}
                  </p>
                </div>
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
