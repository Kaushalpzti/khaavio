
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

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTimeString(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateAfterDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function formatBookingDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

function getErrorMessage(error, fallback) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : fallback;
}

export default function PublicBooking() {
  const { slug } = useParams();

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

  const today = localDateString();
  const maxDate = dateAfterDays(90);
  const minimumTime = bookingDate === today ? localTimeString() : undefined;

  // Load the published restaurant.
  useEffect(() => {
    let active = true;

    async function loadRestaurant() {
      setLoading(true);
      setPageError("");

      try {
        const {
          data,
          error: restaurantError,
        } = await supabase
          .from("restaurants")
          .select("id, name, slug, restaurant_type, address, is_published")
          .eq("slug", slug)
          .eq("is_published", true)
          .maybeSingle();

        if (restaurantError) throw restaurantError;

        if (!data) {
          throw new Error(
            "This restaurant has not published its menu, or the link is incorrect."
          );
        }

        if (active) setRestaurant(data);
      } catch (err) {
        if (active) {
          setPageError(
            getErrorMessage(err, "Unable to load this restaurant.")
          );
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
    if (!restaurant || !bookingDate || !bookingTime) {
      return undefined;
    }

    const seats = Number(partySize);
    const localDateTime = new Date(`${bookingDate}T${bookingTime}`);

    if (
      !Number.isInteger(seats) ||
      seats < 1 ||
      seats > 50 ||
      Number.isNaN(localDateTime.getTime())
    ) {
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
              p_booking_time: localDateTime.toISOString(),
            }
          );

          if (rpcError) throw rpcError;
          if (!active) return;

          const tables = Array.isArray(data) ? data : [];

          setAvailableTables(tables);
          setAvailabilityStatus(
            tables.length > 0 ? "loaded" : "empty"
          );
        } catch (err) {
          if (!active) return;

          setAvailabilityStatus("error");
          setAvailabilityError(
            getErrorMessage(
              err,
              "Could not check table availability."
            )
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
      setBookingError(
        "Special requests must be 500 characters or fewer."
      );
      return;
    }

    if (!bookingDate || !bookingTime) {
      setBookingError("Choose a date and time for your reservation.");
      return;
    }

    if (!Number.isInteger(seats) || seats < 1 || seats > 50) {
      setBookingError("Party size must be between 1 and 50 guests.");
      return;
    }

    const localDateTime = new Date(`${bookingDate}T${bookingTime}`);

    if (
      Number.isNaN(localDateTime.getTime()) ||
      localDateTime.getTime() <= Date.now() ||
      localDateTime.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000
    ) {
      setBookingError(
        "Choose a future date and time within the next 90 days."
      );
      return;
    }

    if (!selectedTableId || availabilityStatus !== "loaded") {
      setBookingError(
        "Check availability and select an available table first."
      );
      return;
    }

    const chosenTable = availableTables.find(
      (table) => table.available_table_id === selectedTableId
    );

    if (!chosenTable) {
      setBookingError(
        "That table is no longer in the available list. Check availability again."
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
          p_booking_time: localDateTime.toISOString(),
          p_special_requests: requests,
        }
      );

      if (submitError) throw submitError;

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.booking_id) {
        throw new Error(
          "The reservation reference could not be confirmed. Please contact the restaurant before submitting again."
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
          "Unable to submit the reservation. Please check availability and try again."
        )
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

  if (loading) {
    return (
      <main className="booking-state">
        <LoaderCircle className="booking-spinner" size={30} />
        <p>Loading restaurant...</p>
      </main>
    );
  }

  if (pageError || !restaurant) {
    return (
      <main className="booking-state">
        <CalendarDays size={34} />
        <h1>Booking unavailable</h1>
        <p>{pageError || "This restaurant could not be found."}</p>
        <Link className="booking-button" to="/">
          <ArrowLeft size={16} />
          Back to Khaavio
        </Link>
      </main>
    );
  }

  return (
    <main className="booking-page">
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

      <section className="booking-hero">
        <span className="booking-eyebrow">PLAN YOUR VISIT</span>
        <h1>Reserve a table.</h1>
        <p>
          Book your next visit at <strong>{restaurant.name}</strong>.
          Choose your preferred time and we’ll check available tables.
        </p>

        {restaurant.address && (
          <span className="booking-address">{restaurant.address}</span>
        )}
      </section>

      <div className="booking-container">
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
                  {formatBookingDate(bookingResult.reservedTime)}
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
              This is a pending request, not a confirmed reservation.
              Please wait for the restaurant to confirm your booking.
            </p>

            <button
              type="button"
              className="booking-button"
              onClick={startNewBooking}
            >
              Make another reservation
            </button>

            <Link
              to={`/menu/${encodeURIComponent(restaurant.slug)}`}
              className="booking-menu-link"
            >
              Return to menu
            </Link>
          </section>
        ) : (
          <form className="booking-form" onSubmit={submitBooking}>
            <div className="booking-section-title">
              <span className="booking-eyebrow">YOUR RESERVATION</span>
              <h2>Find your table</h2>
              <p>Select your date, time and group size to check availability.</p>
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
                  min={minimumTime}
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
                    Tables are checked against existing pending and
                    confirmed reservations.
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
              ) : availabilityStatus === "loading" ? (
                <div className="booking-availability-empty">
                  <LoaderCircle
                    className="booking-spinner"
                    size={23}
                  />
                  Checking availability...
                </div>
              ) : availabilityStatus === "error" ? (
                <div
                  className="booking-inline-error"
                  role="alert"
                >
                  {availabilityError}
                </div>
              ) : availabilityStatus === "empty" ? (
                <div className="booking-availability-empty">
                  No suitable tables are available at this time. Try
                  another time or reduce the number of guests.
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
                        checked={
                          selectedTableId === table.available_table_id
                        }
                        onChange={(event) =>
                          setSelectedTableId(event.target.value)
                        }
                        required
                      />

                      <span className="booking-table-option-info">
                        <strong>{table.table_label}</strong>
                        <small>
                          Capacity: {table.seating_capacity} guests
                        </small>
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
                availabilityStatus !== "loaded" ||
                !selectedTableId
              }
            >
              {submitting ? (
                <LoaderCircle
                  size={17}
                  className="booking-spinner"
                />
              ) : (
                <CalendarDays size={17} />
              )}

              {submitting
                ? "Submitting request..."
                : "Request a reservation"}
            </button>

            <p className="booking-disclaimer">
              Your reservation remains pending until the restaurant
              confirms it. Checking availability does not guarantee a
              reservation; availability is checked again when submitted.
            </p>
          </form>
        )}

        <footer className="booking-footer">
          <img src={khaavioIcon} alt="" />
          <span>Powered by <strong>Khaavio</strong></span>
        </footer>
      </div>
    </main>
  );
}
