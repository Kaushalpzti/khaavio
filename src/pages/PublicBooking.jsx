import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Users,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import khaavioIcon from "../assets/icon.png";
import "./PublicBooking.css";

function pad(value) {
  return String(value).padStart(2, "0");
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const DEFAULT_TIME_ZONE = "Asia/Kolkata";

function getZonedParts(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  const options = {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };

  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", {
      ...options,
      timeZone: DEFAULT_TIME_ZONE,
    }).formatToParts(date);
  }

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function restaurantDateString(timeZone = DEFAULT_TIME_ZONE, now = new Date()) {
  const parts = getZonedParts(now, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function restaurantTimeString(timeZone = DEFAULT_TIME_ZONE, now = new Date()) {
  const parts = getZonedParts(now, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

function dateAfterDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseTimeMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function minutesToTime(value) {
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
}

function getScheduleForDate(restaurant, dateString) {
  if (!restaurant || !dateString) return null;

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const dayKey = WEEKDAYS[date.getUTCDay()];
  const entry = restaurant.business_hours?.[dayKey];

  return {
    dayKey,
    label: dayKey
      ? `${dayKey[0].toUpperCase()}${dayKey.slice(1)}`
      : "selected day",
    closed: !entry || entry.closed === true,
    open: entry?.open || "",
    close: entry?.close || "",
  };
}

// Convert a restaurant-local date/time to an ISO timestamp. The iterative
// conversion avoids interpreting the selected time in the customer's browser
// time zone, which may differ from the restaurant's time zone.
function zonedWallTimeToIso(
  dateString,
  timeString,
  timeZone = DEFAULT_TIME_ZONE,
) {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = timeString.split(":").map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = targetWallTime;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const parts = getZonedParts(new Date(candidate), timeZone);
    const representedWallTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      0,
      0,
    );
    const difference = targetWallTime - representedWallTime;
    candidate += difference;
    if (difference === 0) break;
  }

  const result = new Date(candidate);
  const check = getZonedParts(result, timeZone);
  if (
    Number(check.year) !== year ||
    Number(check.month) !== month ||
    Number(check.day) !== day ||
    Number(check.hour) !== hour ||
    Number(check.minute) !== minute
  ) {
    // This also rejects local wall-clock times that do not exist during a
    // daylight-saving transition in time zones that observe DST.
    return "";
  }

  return result.toISOString();
}

function getBookingSlotValidation(
  restaurant,
  dateString,
  timeString,
  now = new Date(),
) {
  if (!dateString || !timeString) {
    return {
      valid: false,
      iso: "",
      message: "Choose a date and time to check availability.",
    };
  }

  const timeZone = restaurant?.timezone || DEFAULT_TIME_ZONE;
  const today = restaurantDateString(timeZone, now);
  const lastDate = dateAfterDays(today, 90);

  if (dateString < today || dateString > lastDate) {
    return {
      valid: false,
      iso: "",
      message: "Choose a date from today through the next 90 days.",
    };
  }

  const schedule = getScheduleForDate(restaurant, dateString);
  if (!schedule || schedule.closed) {
    return {
      valid: false,
      iso: "",
      message: `The restaurant is closed on ${schedule?.label || "this day"}. Please choose another date.`,
    };
  }

  const openMinutes = parseTimeMinutes(schedule.open);
  const closeMinutes = parseTimeMinutes(schedule.close);
  if (
    openMinutes === null ||
    closeMinutes === null ||
    openMinutes >= closeMinutes
  ) {
    return {
      valid: false,
      iso: "",
      message:
        "Reservation hours are not configured correctly for this day. Please contact the restaurant.",
    };
  }

  const selectedMinutes = parseTimeMinutes(timeString);
  if (selectedMinutes === null) {
    return {
      valid: false,
      iso: "",
      message: "Choose a valid reservation time.",
    };
  }

  const closesAtEndOfDay = schedule.close === "23:59";
  if (
    selectedMinutes < openMinutes ||
    (!closesAtEndOfDay && selectedMinutes >= closeMinutes)
  ) {
    return {
      valid: false,
      iso: "",
      message: `Reservations on ${schedule.label} are available from ${schedule.open} to ${schedule.close}. Choose a time within those hours.`,
    };
  }

  const iso = zonedWallTimeToIso(dateString, timeString, timeZone);
  if (!iso) {
    return {
      valid: false,
      iso: "",
      message: "That local time cannot be used. Please choose another time.",
    };
  }

  if (new Date(iso).getTime() <= now.getTime()) {
    return {
      valid: false,
      iso: "",
      message: "Choose a future time. Reservations cannot be made in the past.",
    };
  }

  return { valid: true, iso, message: "" };
}

function getTimeInputBounds(restaurant, dateString, today, currentTime) {
  const schedule = getScheduleForDate(restaurant, dateString);
  if (!schedule || schedule.closed) return { min: undefined, max: undefined };

  const openMinutes = parseTimeMinutes(schedule.open);
  const closeMinutes = parseTimeMinutes(schedule.close);
  if (
    openMinutes === null ||
    closeMinutes === null ||
    openMinutes >= closeMinutes
  ) {
    return { min: undefined, max: undefined };
  }

  let min = openMinutes;
  if (dateString === today) {
    const nowMinutes = parseTimeMinutes(currentTime);
    if (nowMinutes !== null) min = Math.max(min, nowMinutes);
  }

  const max = schedule.close === "23:59" ? closeMinutes : closeMinutes - 1;
  return { min: minutesToTime(min), max: minutesToTime(max) };
}

function formatBookingDate(value, timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone,
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: DEFAULT_TIME_ZONE,
    });
  }
  return formatter.format(date);
}

function getErrorMessage(error, fallback) {
  const message =
    typeof error?.message === "string" ? error.message.trim() : "";
  if (message.includes("KHAAVIO_PLAN_ACCESS_REQUIRED")) {
    return "Online booking is temporarily unavailable at this restaurant. Please contact the restaurant team.";
  }
  return message || fallback;
}

export default function PublicBooking({ slugOverride, embedded = false, onReturnToMenu }) {
  const routeParams = useParams();
  const slug = slugOverride || routeParams.slug;

  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [partySize, setPartySize] = useState("2");

  const [availableTables, setAvailableTables] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [availabilityStatus, setAvailabilityStatus] = useState("idle");
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingResult, setBookingResult] = useState(null);
  const [subscriptionAllowsTransactions, setSubscriptionAllowsTransactions] =
    useState(null);

  const timeZone = restaurant?.timezone || DEFAULT_TIME_ZONE;
  const today = restaurantDateString(timeZone);
  const maxDate = dateAfterDays(today, 90);
  const currentTime = restaurantTimeString(timeZone);
  const timeBounds = getTimeInputBounds(
    restaurant,
    bookingDate,
    today,
    currentTime,
  );
  const bookingSlot = getBookingSlotValidation(
    restaurant,
    bookingDate,
    bookingTime,
  );

  // Load the published restaurant.
  useEffect(() => {
    let active = true;

    async function loadRestaurant() {
      setLoading(true);
      setPageError("");
      setSubscriptionAllowsTransactions(null);

      try {
        // Use the same public, allowlisted snapshot as the menu. Directly
        // selecting public.restaurant is owner/RLS dependent and makes a valid
        // booking page appear unavailable in incognito or on another device.
        const { data: publicSnapshot, error: restaurantError } =
          await supabase.rpc("khaavio_public_restaurant_menu", {
            p_slug: slug,
          });

        if (restaurantError) throw restaurantError;

        const data = publicSnapshot?.restaurant;
        if (!data || data.is_published !== true) {
          throw new Error(
            "This restaurant has not published its menu, or the link is incorrect.",
          );
        }

        // The public RPC reveals only whether bookings/ordering are available; the create RPC checks again on submit.
        let transactionAccess = null;
        const { data: accessData, error: accessError } = await supabase.rpc(
          "khaavio_public_restaurant_can_transact",
          { p_slug: slug },
        );
        if (!accessError) transactionAccess = accessData === true;

        if (active) {
          setRestaurant(data);
          setSubscriptionAllowsTransactions(transactionAccess);
        }
      } catch (err) {
        if (active) {
          setPageError(getErrorMessage(err, "Unable to load this restaurant."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRestaurant();

    return () => {
      active = false;
    };
  }, [slug]);

  // Find tables whenever the selected date, time or party size changes.
  useEffect(() => {
    // Input handlers clear the previous availability whenever date, time, or
    // party size changes. This effect only synchronizes valid selections with
    // the availability RPC, avoiding synchronous state updates in an effect.
    if (
      !restaurant ||
      subscriptionAllowsTransactions !== true ||
      !bookingDate ||
      !bookingTime ||
      !bookingSlot.valid
    ) {
      return undefined;
    }

    const seats = Number(partySize);
    if (!Number.isInteger(seats) || seats < 1 || seats > 50) {
      return undefined;
    }

    let active = true;

    const timer = window.setTimeout(() => {
      async function checkAvailability() {
        setAvailabilityStatus("loading");
        setAvailabilityError("");
        setAvailableTables([]);
        setSelectedTableId("");

        try {
          const { data, error: rpcError } = await supabase.rpc(
            "get_public_booking_tables",
            {
              p_slug: restaurant.slug,
              p_party_size: seats,
              p_booking_time: bookingSlot.iso,
            },
          );

          if (rpcError) throw rpcError;
          if (!active) return;

          const tables = Array.isArray(data) ? data : [];

          setAvailableTables(tables);
          setAvailabilityStatus(tables.length > 0 ? "loaded" : "empty");
        } catch (err) {
          if (!active) return;

          setAvailabilityStatus("error");
          setAvailabilityError(
            getErrorMessage(err, "Could not check table availability."),
          );
        }
      }

      checkAvailability();
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    restaurant,
    bookingDate,
    bookingTime,
    partySize,
    availabilityRefresh,
    bookingSlot.valid,
    bookingSlot.iso,
    subscriptionAllowsTransactions,
  ]);

  function clearPreviousResult() {
    setBookingResult(null);
    setBookingError("");
  }

  function handleDateChange(event) {
    setBookingDate(event.target.value);
    setAvailableTables([]);
    setSelectedTableId("");
    setAvailabilityStatus("idle");
    setAvailabilityError("");
    clearPreviousResult();
  }

  function handleTimeChange(event) {
    setBookingTime(event.target.value);
    setAvailableTables([]);
    setSelectedTableId("");
    setAvailabilityStatus("idle");
    setAvailabilityError("");
    clearPreviousResult();
  }

  function handlePartySizeChange(event) {
    setPartySize(event.target.value);
    setAvailableTables([]);
    setSelectedTableId("");
    setAvailabilityStatus("idle");
    setAvailabilityError("");
    clearPreviousResult();
  }

  async function submitBooking(event) {
    event.preventDefault();
    setBookingError("");
    setBookingResult(null);

    if (submitting) return;
    if (subscriptionAllowsTransactions !== true) {
      setBookingError(
        "Online bookings are temporarily unavailable at this restaurant. Please contact the restaurant team.",
      );
      return;
    }

    const name = guestName.trim();
    const phone = guestPhone.trim();
    const email = guestEmail.trim();
    const requests = specialRequests.trim();
    const seats = Number(partySize);

    if (name.length < 2 || name.length > 120) {
      setBookingError("Name must contain between 2 and 120 characters.");
      return;
    }

    if (phone.length < 7 || phone.length > 25) {
      setBookingError("Enter a valid contact phone number.");
      return;
    }

    if (email && email.length > 254) {
      setBookingError("Email address is too long.");
      return;
    }

    if (requests.length > 500) {
      setBookingError("Special requests must be 500 characters or fewer.");
      return;
    }

    if (!bookingDate || !bookingTime) {
      setBookingError("Choose a date and time for your reservation.");
      return;
    }

    const slotAtSubmit = getBookingSlotValidation(
      restaurant,
      bookingDate,
      bookingTime,
      new Date(),
    );
    if (!slotAtSubmit.valid) {
      setBookingError(
        slotAtSubmit.message || "Choose a valid reservation time.",
      );
      return;
    }

    if (!Number.isInteger(seats) || seats < 1 || seats > 50) {
      setBookingError("Party size must be between 1 and 50 guests.");
      return;
    }

    if (!selectedTableId || availabilityStatus !== "loaded") {
      setBookingError(
        "Check availability and select an available table first.",
      );
      return;
    }

    const chosenTable = availableTables.find(
      (table) => table.available_table_id === selectedTableId,
    );

    if (!chosenTable) {
      setBookingError(
        "That table is no longer in the available list. Check availability again.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const { data, error: submitError } = await supabase.rpc(
        "create_public_booking",
        {
          p_slug: restaurant.slug,
          p_table_id: chosenTable.available_table_id,
          p_guest_name: name,
          p_guest_email: email || null,
          p_guest_phone: phone,
          p_party_size: seats,
          p_booking_time: slotAtSubmit.iso,
          p_special_requests: requests,
        },
      );

      if (submitError) throw submitError;

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.booking_id) {
        throw new Error(
          "The reservation reference could not be confirmed. Please contact the restaurant before submitting again.",
        );
      }

      setBookingResult({
        id: result.booking_id,
        reference: result.booking_reference,
        status: result.booking_status,
        reservedTime: result.reserved_time,
        tableLabel: chosenTable.table_label,
      });
    } catch (err) {
      setBookingError(
        getErrorMessage(
          err,
          "Unable to submit the reservation. Please check availability and try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function startNewBooking() {
    setBookingResult(null);
    setBookingError("");
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setSpecialRequests("");
    setSelectedTableId("");
    setBookingDate("");
    setBookingTime("");
    setPartySize("2");
    setAvailableTables([]);
    setAvailabilityStatus("idle");
    setAvailabilityError("");
  }

  const StateWrapper = embedded ? "section" : "main";
  const PageWrapper = embedded ? "section" : "main";

  if (loading) {
    return (
      <StateWrapper className={`booking-state${embedded ? " booking-state-embedded" : ""}`}>
        <LoaderCircle className="booking-spinner" size={30} />
        <p>Loading restaurant...</p>
      </StateWrapper>
    );
  }

  if (pageError || !restaurant) {
    return (
      <StateWrapper className={`booking-state${embedded ? " booking-state-embedded" : ""}`}>
        <CalendarDays size={34} />
        <h1>Booking unavailable</h1>
        <p>{pageError || "This restaurant could not be found."}</p>
        {embedded ? (
          <button className="booking-button" type="button" onClick={onReturnToMenu}>
            <ArrowLeft size={16} />
            Back to menu
          </button>
        ) : (
          <Link className="booking-button" to="/">
            <ArrowLeft size={16} />
            Back to Khaavio
          </Link>
        )}
      </StateWrapper>
    );
  }

  return (
    <PageWrapper className={`booking-page${embedded ? " booking-page-embedded" : ""}`}>
      {!embedded && (
      <header className="booking-header">
        <Link to={`/menu/${encodeURIComponent(restaurant.slug)}`}>
          <ArrowLeft size={16} />
          View menu
        </Link>

        <Link to="/" className="booking-brand">
          <img src={khaavioIcon} alt="" />
          Khaavio
        </Link>
      </header>
      )}

      <section className="booking-hero">
        <span className="booking-eyebrow">PLAN YOUR VISIT</span>
        <h1>Reserve a table.</h1>
        <p>
          Book your next visit at <strong>{restaurant.name}</strong>. Choose
          your preferred time and we’ll check available tables.
        </p>

        {restaurant.address && (
          <span className="booking-address">{restaurant.address}</span>
        )}
      </section>

      <div className="booking-container">
        {subscriptionAllowsTransactions !== true && (
          <div className="booking-subscription-unavailable" role="status">
            <strong>Online bookings are temporarily unavailable.</strong>
            <span>
              Please contact {restaurant.name} directly for reservations. The
              restaurant’s menu remains available.
            </span>
          </div>
        )}
        {bookingResult ? (
          <section className="booking-success" role="status">
            <div className="booking-success-icon">
              <CheckCircle2 size={32} />
            </div>

            <span className="booking-eyebrow">REQUEST SUBMITTED</span>
            <h2>Thank you, {guestName.trim()}!</h2>
            <p>
              Your reservation request has been sent to{" "}
              <strong>{restaurant.name}</strong>.
            </p>

            <div className="booking-reference">
              <span>Booking reference</span>
              <strong>{bookingResult.reference}</strong>
            </div>

            <div className="booking-summary">
              <div>
                <span>Date & time</span>
                <strong>
                  {formatBookingDate(bookingResult.reservedTime, timeZone)}
                </strong>
              </div>

              <div>
                <span>Table</span>
                <strong>{bookingResult.tableLabel}</strong>
              </div>

              <div>
                <span>Status</span>
                <strong className="booking-pending">
                  {bookingResult.status}
                </strong>
              </div>
            </div>

            <p className="booking-pending-note">
              This is a pending request, not a confirmed reservation. Please
              wait for the restaurant to confirm your booking.
            </p>

            <button
              type="button"
              className="booking-button"
              onClick={startNewBooking}
            >
              Make another reservation
            </button>

            {embedded ? (
              <button
                type="button"
                className="booking-menu-link booking-menu-link-button"
                onClick={onReturnToMenu}
              >
                Return to menu
              </button>
            ) : (
              <Link
                to={`/menu/${encodeURIComponent(restaurant.slug)}`}
                className="booking-menu-link"
              >
                Return to menu
              </Link>
            )}
          </section>
        ) : (
          <form className="booking-form" onSubmit={submitBooking}>
            {" "}
            <div className="booking-section-title">
              <span className="booking-eyebrow">YOUR RESERVATION</span>
              <h2>Find your table</h2>
              <p>
                Select your date, time and group size to check availability.
              </p>
            </div>
            <div className="booking-field-grid">
              <label className="booking-field">
                <span>
                  <CalendarDays size={15} />
                  Booking date
                </span>
                <input
                  type="date"
                  value={bookingDate}
                  min={today}
                  max={maxDate}
                  onChange={handleDateChange}
                  required
                />
              </label>

              <label className="booking-field">
                <span>
                  <Clock3 size={15} />
                  Preferred time
                </span>
                <input
                  type="time"
                  value={bookingTime}
                  min={timeBounds.min}
                  max={timeBounds.max}
                  onChange={handleTimeChange}
                  required
                />
              </label>

              <label className="booking-field booking-party-field">
                <span>
                  <Users size={15} />
                  Number of guests
                </span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={partySize}
                  onChange={handlePartySizeChange}
                  required
                />
              </label>
            </div>
            <section className="booking-availability">
              <div className="booking-availability-heading">
                <div>
                  <h3>Available tables</h3>
                  <p>
                    Times follow the restaurant’s opening hours. Tables are
                    checked against existing pending and confirmed reservations.
                  </p>
                </div>

                {bookingDate && bookingTime && (
                  <button
                    type="button"
                    className="booking-check-button"
                    disabled={availabilityStatus === "loading"}
                    onClick={() =>
                      setAvailabilityRefresh((current) => current + 1)
                    }
                  >
                    {availabilityStatus === "loading"
                      ? "Checking..."
                      : "Check again"}
                  </button>
                )}
              </div>

              {!bookingDate || !bookingTime ? (
                <div className="booking-availability-empty">
                  Select a date and time to see available tables.
                </div>
              ) : subscriptionAllowsTransactions !== true ? (
                <div className="booking-availability-empty" role="status">
                  Online bookings are not available right now. Please contact
                  the restaurant directly.
                </div>
              ) : !bookingSlot.valid ? (
                <div className="booking-availability-empty" role="status">
                  {bookingSlot.message}
                </div>
              ) : availabilityStatus === "loading" ? (
                <div className="booking-availability-empty">
                  <LoaderCircle className="booking-spinner" size={23} />
                  Checking availability...
                </div>
              ) : availabilityStatus === "error" ? (
                <div className="booking-inline-error" role="alert">
                  {availabilityError}
                </div>
              ) : availabilityStatus === "empty" ? (
                <div className="booking-availability-empty">
                  No suitable tables are available at this time. Try another
                  time or reduce the number of guests.
                </div>
              ) : availabilityStatus === "loaded" ? (
                <div className="booking-table-options">
                  {availableTables.map((table) => (
                    <label
                      key={table.available_table_id}
                      className={`booking-table-option ${
                        selectedTableId === table.available_table_id
                          ? "selected"
                          : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="booking-table"
                        value={table.available_table_id}
                        checked={selectedTableId === table.available_table_id}
                        onChange={(event) =>
                          setSelectedTableId(event.target.value)
                        }
                        required
                      />

                      <span className="booking-table-option-info">
                        {" "}
                        <strong>{table.table_label}</strong>
                        <small>Capacity: {table.seating_capacity} guests</small>
                      </span>

                      {selectedTableId === table.available_table_id && (
                        <CheckCircle2 size={18} />
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="booking-availability-empty">
                  Availability will appear here.
                </div>
              )}
            </section>
            <div className="booking-section-title booking-details-title">
              <span className="booking-eyebrow">CONTACT DETAILS</span>
              <h2>Who’s coming?</h2>
            </div>
            <div className="booking-field-grid">
              <label className="booking-field booking-field-full">
                {" "}
                <span>Full name</span>
                <input
                  type="text"
                  value={guestName}
                  onChange={(event) => {
                    setGuestName(event.target.value);
                    setBookingError("");
                  }}
                  maxLength={120}
                  autoComplete="name"
                  placeholder="Enter your name"
                  required
                />
              </label>

              <label className="booking-field">
                <span>Phone number</span>
                <input
                  type="tel"
                  value={guestPhone}
                  onChange={(event) => {
                    setGuestPhone(event.target.value);
                    setBookingError("");
                  }}
                  maxLength={25}
                  autoComplete="tel"
                  placeholder="Contact number"
                  required
                />
              </label>

              <label className="booking-field">
                <span>Email (optional)</span>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(event) => {
                    setGuestEmail(event.target.value);
                    setBookingError("");
                  }}
                  maxLength={254}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </label>

              <label className="booking-field booking-field-full">
                {" "}
                <span>Special requests (optional)</span>
                <textarea
                  value={specialRequests}
                  onChange={(event) => {
                    setSpecialRequests(event.target.value);
                    setBookingError("");
                  }}
                  maxLength={500}
                  rows={3}
                  placeholder="Birthday setup, accessibility requirements, etc."
                />
              </label>
            </div>
            {bookingError && (
              <div className="booking-inline-error" role="alert">
                {bookingError}
              </div>
            )}
            <button
              type="submit"
              className="booking-submit"
              disabled={
                submitting ||
                subscriptionAllowsTransactions !== true ||
                !bookingSlot.valid ||
                availabilityStatus !== "loaded" ||
                !selectedTableId
              }
            >
              {submitting ? (
                <LoaderCircle size={17} className="booking-spinner" />
              ) : (
                <CalendarDays size={17} />
              )}

              {submitting ? "Submitting request..." : "Request a reservation"}
            </button>
            <p className="booking-disclaimer">
              Your reservation remains pending until the restaurant confirms it.
              Checking availability does not guarantee a reservation;
              availability is checked again when submitted.
            </p>
          </form>
        )}

        <footer className="booking-footer">
          <img src={khaavioIcon} alt="" />
          <span>
            Powered by <strong>Khaavio</strong>
          </span>
        </footer>
      </div>
    </PageWrapper>
  );
}
