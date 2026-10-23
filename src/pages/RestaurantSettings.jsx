import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  Save,
  Store,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "./RestaurantSettings.css";
import "./RestaurantAvailability.css";

const RESTAURANT_FIELDS =
  "id, name, slug, restaurant_type, phone, contact_email, address, city, state, postal_code, description, is_published, is_accepting_orders, business_hours, timezone";

const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

const DEFAULT_BUSINESS_HOURS = Object.fromEntries(
  DAYS.map(({ key }) => [
    key,
    { closed: false, open: "00:00", close: "23:59" },
  ]),
);

const INITIAL_FORM = {
  name: "",
  restaurant_type: "cafe",
  phone: "",
  contact_email: "",
  address: "",
  city: "",
  state: "",
  postal_code: "",
  description: "",
  is_accepting_orders: true,
  business_hours: DEFAULT_BUSINESS_HOURS,
};

const BUSINESS_TYPES = [
  { value: "cafe", label: "Café / Coffee shop" },
  { value: "restaurant", label: "Restaurant / Dining" },
  { value: "bakery", label: "Bakery / Dessert shop" },
  { value: "cloud_kitchen", label: "Cloud kitchen" },
  { value: "other", label: "Other food business" },
];

function normalizeBusinessHours(value) {
  return Object.fromEntries(
    DAYS.map(({ key }) => {
      const day = value && typeof value === "object" ? value[key] : null;
      return [
        key,
        {
          closed: Boolean(day?.closed),
          open: /^\d{2}:\d{2}$/.test(day?.open || "")
            ? day.open
            : "00:00",
          close: /^\d{2}:\d{2}$/.test(day?.close || "")
            ? day.close
            : "23:59",
        },
      ];
    }),
  );
}

function formFromRestaurant(restaurant) {
  return {
    name: restaurant.name || "",
    restaurant_type: restaurant.restaurant_type || "cafe",
    phone: restaurant.phone || "",
    contact_email: restaurant.contact_email || "",
    address: restaurant.address || "",
    city: restaurant.city || "",
    state: restaurant.state || "",
    postal_code: restaurant.postal_code || "",
    description: restaurant.description || "",
    is_accepting_orders: restaurant.is_accepting_orders !== false,
    business_hours: normalizeBusinessHours(restaurant.business_hours),
  };
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  return hours * 60 + minutes;
}

export default function RestaurantSettings() {
  const [restaurant, setRestaurant] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingOrderMode, setSavingOrderMode] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setLoading(true);
      setError("");

      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) {
          throw new Error("Please sign in before opening restaurant settings.");
        }

        if (!active) return;
        setUserId(authData.user.id);

        const { data, error: restaurantError } = await supabase
          .from("restaurants")
          .select(RESTAURANT_FIELDS)
          .eq("owner_id", authData.user.id)
          .limit(1)
          .maybeSingle();

        if (restaurantError) throw restaurantError;
        if (!data) {
          throw new Error(
            "No restaurant profile was found. Please complete restaurant onboarding first.",
          );
        }

        if (!active) return;
        setRestaurant(data);
        setForm(formFromRestaurant(data));
      } catch (err) {
        console.error("Could not load restaurant settings:", err);
        if (active) {
          setError(
            err?.message ||
              "We couldn't load your restaurant settings. Please try again.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    setNotice("");
    setError("");
  }

  function updateDay(dayKey, field, value) {
    setForm((current) => ({
      ...current,
      business_hours: {
        ...current.business_hours,
        [dayKey]: {
          ...current.business_hours[dayKey],
          [field]: value,
        },
      },
    }));
    setNotice("");
    setError("");
  }

  async function toggleOrderAcceptance() {
    if (!restaurant || !userId || savingOrderMode || saving) return;

    const nextValue = restaurant.is_accepting_orders === false;
    setSavingOrderMode(true);
    setError("");
    setNotice("");

    try {
      const { data, error: updateError } = await supabase
        .from("restaurants")
        .update({ is_accepting_orders: nextValue })
        .eq("id", restaurant.id)
        .eq("owner_id", userId)
        .select("is_accepting_orders")
        .single();

      if (updateError) throw updateError;

      setRestaurant((current) => ({
        ...current,
        is_accepting_orders: data.is_accepting_orders,
      }));
      setForm((current) => ({
        ...current,
        is_accepting_orders: data.is_accepting_orders,
      }));
      setNotice(
        data.is_accepting_orders
          ? "Online ordering resumed. Opening hours still apply."
          : "Online ordering paused. Customers can still view your menu.",
      );
    } catch (err) {
      console.error("Could not update online-order setting:", err);
      setError(
        err?.message || "Could not update online-order availability.",
      );
    } finally {
      setSavingOrderMode(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!restaurant || !userId || saving) return;

    const name = form.name.trim();
    const email = form.contact_email.trim();

    if (name.length < 2) {
      setError("Restaurant name must contain at least 2 characters.");
      return;
    }
    if (!BUSINESS_TYPES.some((item) => item.value === form.restaurant_type)) {
      setError("Please choose a valid business type.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid business email address.");
      return;
    }

    for (const { key, label } of DAYS) {
      const hours = form.business_hours[key];
      if (hours.closed) continue;
      if (!/^\d{2}:\d{2}$/.test(hours.open) || !/^\d{2}:\d{2}$/.test(hours.close)) {
        setError(`Enter valid opening and closing times for ${label}.`);
        return;
      }
      if (timeToMinutes(hours.open) >= timeToMinutes(hours.close)) {
        setError(
          `${label}: closing time must be after opening time. Overnight hours are not supported yet; mark the day closed or choose a same-day range.`,
        );
        return;
      }
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const updates = {
        name,
        restaurant_type: form.restaurant_type,
        phone: form.phone.trim() || null,
        contact_email: email || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
        description: form.description.trim(),
        is_accepting_orders: form.is_accepting_orders,
        business_hours: form.business_hours,
      };

      const { data, error: updateError } = await supabase
        .from("restaurants")
        .update(updates)
        .eq("id", restaurant.id)
        .eq("owner_id", userId)
        .select(RESTAURANT_FIELDS)
        .single();

      if (updateError) throw updateError;
      setRestaurant(data);
      setForm(formFromRestaurant(data));
      setNotice("Restaurant details and opening hours saved successfully.");
    } catch (err) {
      console.error("Could not save restaurant settings:", err);
      setError(
        err?.message || "We couldn't save your changes. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyMenuLink() {
    if (!restaurant?.slug) return;
    const url = `${window.location.origin}/menu/${encodeURIComponent(restaurant.slug)}`;

    try {
      await navigator.clipboard.writeText(url);
      setNotice("Public menu link copied.");
      setError("");
    } catch {
      setNotice(`Copy this public menu link: ${url}`);
      setError("");
    }
  }

  if (loading) {
    return (
      <main className="restaurant-settings-loading">
        <LoaderCircle className="restaurant-settings-spinner" size={28} />
        <p>Loading restaurant settings...</p>
      </main>
    );
  }

  return (
    <main className="restaurant-settings-page">
      <header className="restaurant-settings-header">
        <Link to="/dashboard" className="restaurant-settings-back">
          <ArrowLeft size={17} />
          <span>Dashboard</span>
        </Link>
        <Link to="/" className="restaurant-settings-brand">
          Khaavio<span>.</span>
        </Link>
      </header>

      <section className="restaurant-settings-content">
        <div className="restaurant-settings-heading">
          <div className="restaurant-settings-eyebrow">
            <span />
            RESTAURANT MANAGEMENT
          </div>
          <h1>Restaurant settings</h1>
          <p>
            Update your business profile, opening hours and online-order availability.
          </p>
        </div>

        {restaurant && (
          <section className="restaurant-settings-public-card">
            <div className="restaurant-settings-public-icon"><Store size={23} /></div>
            <div className="restaurant-settings-public-info">
              <span className="restaurant-settings-muted-label">YOUR RESTAURANT</span>
              <h2>{restaurant.name}</h2>
              <p>{restaurant.city || "City not added"}{restaurant.state ? `, ${restaurant.state}` : ""}</p>
            </div>
            <span className={`restaurant-settings-status ${restaurant.is_published ? "is-published" : "is-draft"}`}>
              {restaurant.is_published ? "Published" : "Unpublished"}
            </span>
          </section>
        )}

        {restaurant && (
          <section className={`khaavio-order-mode-card ${restaurant.is_accepting_orders ? "is-accepting" : "is-paused"}`}>
            <div className="khaavio-order-mode-copy">
              <span className="khaavio-order-mode-eyebrow">ONLINE ORDERING</span>
              <h2>{restaurant.is_accepting_orders ? "Accepting online orders" : "Online orders are paused"}</h2>
              <p>
                {restaurant.is_accepting_orders
                  ? "Customers can place orders while the restaurant is within its opening hours."
                  : "Customers can still browse the menu, but new orders will be blocked."}
              </p>
            </div>
            <button
              type="button"
              className="khaavio-order-mode-button"
              onClick={toggleOrderAcceptance}
              disabled={savingOrderMode || saving}
            >
              {savingOrderMode ? <LoaderCircle size={17} className="restaurant-settings-spinner" /> : restaurant.is_accepting_orders ? <PauseCircle size={17} /> : <PlayCircle size={17} />}
              {savingOrderMode ? "Updating..." : restaurant.is_accepting_orders ? "Pause online orders" : "Resume online orders"}
            </button>
          </section>
        )}

        {error && <div className="restaurant-settings-message is-error" role="alert">{error}</div>}
        {notice && <div className="restaurant-settings-message is-success" role="status"><CheckCircle2 size={17} /><span>{notice}</span></div>}

        {restaurant && (
          <>
            <form className="restaurant-settings-form" onSubmit={handleSubmit}>
              <section className="restaurant-settings-section">
                <div className="restaurant-settings-section-heading">
                  <div><h2>Business information</h2><p>The basic details associated with your restaurant.</p></div>
                </div>
                <div className="restaurant-settings-grid">
                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-name">Restaurant name *</label>
                    <input id="settings-name" name="name" value={form.name} onChange={updateField} placeholder="e.g. The Green Table" maxLength={120} required />
                  </div>
                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-type">Business type *</label>
                    <select id="settings-type" name="restaurant_type" value={form.restaurant_type} onChange={updateField} required>
                      {BUSINESS_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  <div className="restaurant-settings-field">
                    <label htmlFor="settings-phone">Phone number</label>
                    <input id="settings-phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={updateField} placeholder="+91 98765 43210" maxLength={20} />
                  </div>
                  <div className="restaurant-settings-field">
                    <label htmlFor="settings-email">Business email</label>
                    <input id="settings-email" name="contact_email" type="email" autoComplete="email" value={form.contact_email} onChange={updateField} placeholder="cafe@example.com" maxLength={254} />
                  </div>
                </div>
              </section>

              <section className="restaurant-settings-section">
                <div className="restaurant-settings-section-heading">
                  <div><h2>Location</h2><p>Where customers can find your business.</p></div>
                </div>
                <div className="restaurant-settings-grid">
                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-address">Street address</label>
                    <input id="settings-address" name="address" autoComplete="street-address" value={form.address} onChange={updateField} placeholder="Street, building or locality" maxLength={250} />
                  </div>
                  <div className="restaurant-settings-field">
                    <label htmlFor="settings-city">City</label>
                    <input id="settings-city" name="city" autoComplete="address-level2" value={form.city} onChange={updateField} placeholder="e.g. Patna" maxLength={100} />
                  </div>
                  <div className="restaurant-settings-field">
                    <label htmlFor="settings-state">State</label>
                    <input id="settings-state" name="state" autoComplete="address-level1" value={form.state} onChange={updateField} placeholder="e.g. Bihar" maxLength={100} />
                  </div>
                  <div className="restaurant-settings-field">
                    <label htmlFor="settings-postal">PIN code</label>
                    <input id="settings-postal" name="postal_code" inputMode="numeric" autoComplete="postal-code" value={form.postal_code} onChange={updateField} placeholder="e.g. 800001" maxLength={12} />
                  </div>
                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-description">About your restaurant</label>
                    <textarea id="settings-description" name="description" value={form.description} onChange={updateField} placeholder="Tell customers what makes your restaurant special." rows={4} maxLength={1000} />
                    <span className="restaurant-settings-field-hint">{form.description.length}/1000 characters</span>
                  </div>
                </div>
              </section>

              <section className="restaurant-settings-section khaavio-hours-section">
                <div className="restaurant-settings-section-heading">
                  <div><h2>Opening hours</h2><p>Times are in India Standard Time (IST). Closing time must be later than opening time on the same day.</p></div>
                </div>
                <div className="khaavio-hours-list">
                  {DAYS.map(({ key, label }) => {
                    const hours = form.business_hours[key];
                    return (
                      <div className={`khaavio-hours-row ${hours.closed ? "is-day-closed" : ""}`} key={key}>
                        <div className="khaavio-hours-day">{label}</div>
                        <label className="khaavio-day-closed">
                          <input type="checkbox" checked={hours.closed} onChange={(event) => updateDay(key, "closed", event.target.checked)} disabled={saving} />
                          <span>Closed</span>
                        </label>
                        <label className="khaavio-time-field">
                          <span>Opens</span>
                          <input type="time" value={hours.open} onChange={(event) => updateDay(key, "open", event.target.value)} disabled={saving || hours.closed} required={!hours.closed} />
                        </label>
                        <label className="khaavio-time-field">
                          <span>Closes</span>
                          <input type="time" value={hours.close} onChange={(event) => updateDay(key, "close", event.target.value)} disabled={saving || hours.closed} required={!hours.closed} />
                        </label>
                      </div>
                    );
                  })}
                </div>
                <p className="khaavio-hours-note">All days default to 00:00–23:59 to preserve existing ordering behavior. Set your actual hours above. Overnight hours are not supported yet.</p>
              </section>

              <div className="restaurant-settings-actions">
                <Link to="/dashboard" className="restaurant-settings-cancel">Cancel</Link>
                <button type="submit" className="restaurant-settings-save" disabled={saving || savingOrderMode}>
                  {saving ? <LoaderCircle className="restaurant-settings-spinner" size={18} /> : <Save size={17} />}
                  {saving ? "Saving changes..." : "Save changes"}
                </button>
              </div>
            </form>

            <section className="restaurant-settings-public-section">
              <div><h2>Your public menu</h2><p>Share your restaurant menu link with customers.{restaurant.is_published ? "" : " Publish your restaurant before sharing this link."}</p></div>
              <button type="button" className="restaurant-settings-link-button" onClick={copyMenuLink}><ExternalLink size={16} />Copy menu link</button>
              <code className="restaurant-settings-url">{window.location.origin}/menu/{restaurant.slug}</code>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
