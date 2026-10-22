import khaavioIcon from "../assets/icon.png";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, UtensilsCrossed } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "./Onboarding.css";

function makeSlug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export default function Onboarding() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantType, setRestaurantType] = useState("cafe");

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      const { data, error: authError } = await supabase.auth.getUser();

      if (!active) return;

      if (authError || !data.user) {
        navigate("/login", { replace: true });
        return;
      }

      setUser(data.user);
      setRestaurantName(data.user.user_metadata?.restaurant_name || "");

      const { data: existing, error: lookupError } = await supabase
        .from("restaurants")
        .select("id")
        .eq("owner_id", data.user.id)
        .limit(1)
        .maybeSingle();

      if (!active) return;

      if (lookupError) {
        setError(
          "We couldn't check your restaurant profile. Please refresh and try again.",
        );
        setChecking(false);
        return;
      }

      if (existing) {
        navigate("/dashboard", { replace: true });
        return;
      }

      setChecking(false);
    }

    loadAccount();

    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!user || saving) return;

    setSaving(true);
    setError("");

    const form = new FormData(event.currentTarget);

    const name = String(form.get("name") || "").trim();
    const type = String(form.get("restaurant_type") || "cafe");
    const phone = String(form.get("phone") || "").trim();
    const email = String(form.get("contact_email") || "").trim();
    const address = String(form.get("address") || "").trim();
    const city = String(form.get("city") || "").trim();
    const state = String(form.get("state") || "").trim();
    const postalCode = String(form.get("postal_code") || "").trim();
    const description = String(form.get("description") || "").trim();

    if (name.length < 2) {
      setError("Please enter a restaurant name with at least 2 characters.");
      setSaving(false);
      return;
    }

    const validTypes = [
      "cafe",
      "restaurant",
      "bakery",
      "cloud_kitchen",
      "other",
    ];

    if (!validTypes.includes(type)) {
      setError("Please choose a valid business type.");
      setSaving(false);
      return;
    }

    const baseSlug = makeSlug(name) || "my-restaurant";

    try {
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          full_name: String(user.user_metadata?.full_name || "").trim(),
        },
        { onConflict: "id" },
      );

      if (profileError) throw profileError;

      const restaurantData = {
        owner_id: user.id,
        name,
        restaurant_type: type,
        phone: phone || null,
        contact_email: email || user.email || null,
        address: address || null,
        city: city || null,
        state: state || null,
        postal_code: postalCode || null,
        description,
        is_published: false,
      };

      let createdRestaurant = null;
      let insertError = null;

      // Retry with a suffix if the public slug is already taken.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const suffix =
          attempt === 0 ? "" : `-${crypto.randomUUID().slice(0, 6)}`;

        const result = await supabase
          .from("restaurants")
          .insert({
            ...restaurantData,
            slug: `${baseSlug}${suffix}`,
          })
          .select("id, slug")
          .single();

        if (!result.error) {
          createdRestaurant = result.data;
          insertError = null;
          break;
        }

        insertError = result.error;

        if (insertError.code !== "23505") {
          break;
        }
      }

      if (insertError) throw insertError;

      if (!createdRestaurant) {
        throw new Error(
          "We couldn't create your restaurant. Please try again.",
        );
      }

      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Restaurant onboarding failed:", err);

      if (err.code === "23505") {
        setError(
          "This restaurant URL is already in use. Please try another name.",
        );
      } else if (err.code === "42501" || err.code === "PGRST301") {
        setError(
          "Your session or database permissions need attention. Please sign in again.",
        );
      } else {
        setError(
          err.message || "Something went wrong while saving your restaurant.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <main className="onboarding-loading">
        <UtensilsCrossed size={27} />
        <p>Preparing your restaurant workspace...</p>
      </main>
    );
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <Link to="/" className="onboarding-brand">
          <img src={khaavioIcon} alt="" />
          <span>Khaavio</span>
        </Link>
        <span className="onboarding-step-label">SETUP · 01 OF 01</span>
      </header>

      <section className="onboarding-content">
        <div className="onboarding-intro">
          <div className="onboarding-eyebrow">
            <span className="onboarding-eyebrow-dot" />
            LET'S GET YOU STARTED
          </div>
          <h1>
            First, tell us about
            <span> your restaurant.</span>
          </h1>
          <p>
            Give your restaurant a name and a few essential details. You can
            customize your digital storefront and menu next.
          </p>
        </div>

        <form className="onboarding-form" onSubmit={handleSubmit}>
          <div className="onboarding-form-heading">
            <div className="onboarding-form-icon">
              <UtensilsCrossed size={21} />
            </div>
            <div>
              <h2>Your business details</h2>
              <p>These details can be updated later.</p>
            </div>
          </div>

          <div className="onboarding-field">
            <label htmlFor="restaurant-name">Restaurant name *</label>
            <input
              id="restaurant-name"
              name="name"
              value={restaurantName}
              onChange={(event) => setRestaurantName(event.target.value)}
              placeholder="e.g. The Green Table"
              maxLength={120}
              required
            />
          </div>

          <div className="onboarding-field">
            <label htmlFor="restaurant-type">Business type *</label>
            <select
              id="restaurant-type"
              name="restaurant_type"
              value={restaurantType}
              onChange={(event) => setRestaurantType(event.target.value)}
              required
            >
              <option value="cafe">Café / Coffee shop</option>
              <option value="restaurant">Restaurant / Dining</option>
              <option value="bakery">Bakery / Dessert shop</option>
              <option value="cloud_kitchen">Cloud kitchen</option>
              <option value="other">Other food business</option>
            </select>
          </div>

          <div className="onboarding-field-row">
            <div className="onboarding-field">
              <label htmlFor="restaurant-phone">Phone number</label>
              <input
                id="restaurant-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                maxLength={20}
              />
            </div>

            <div className="onboarding-field">
              <label htmlFor="restaurant-email">Business email</label>
              <input
                id="restaurant-email"
                name="contact_email"
                type="email"
                autoComplete="email"
                defaultValue={user?.email || ""}
                placeholder="cafe@example.com"
                maxLength={254}
              />
            </div>
          </div>

          <div className="onboarding-field">
            <label htmlFor="restaurant-address">Address</label>
            <input
              id="restaurant-address"
              name="address"
              autoComplete="street-address"
              placeholder="Street, building or locality"
              maxLength={250}
            />
          </div>

          <div className="onboarding-field-row">
            <div className="onboarding-field">
              <label htmlFor="restaurant-city">City</label>
              <input
                id="restaurant-city"
                name="city"
                autoComplete="address-level2"
                placeholder="e.g. Patna"
                maxLength={100}
              />
            </div>
            <div className="onboarding-field">
              <label htmlFor="restaurant-state">State</label>
              <input
                id="restaurant-state"
                name="state"
                autoComplete="address-level1"
                placeholder="e.g. Bihar"
                maxLength={100}
              />
            </div>
          </div>

          <div className="onboarding-field">
            <label htmlFor="restaurant-postal">PIN code</label>
            <input
              id="restaurant-postal"
              name="postal_code"
              autoComplete="postal-code"
              inputMode="numeric"
              placeholder="e.g. 800001"
              maxLength={12}
            />
          </div>

          <div className="onboarding-field">
            <label htmlFor="restaurant-description">
              A little about your business
            </label>
            <textarea
              id="restaurant-description"
              name="description"
              placeholder="What makes your restaurant special?"
              rows={3}
              maxLength={1000}
            />
          </div>

          {error && (
            <div className="onboarding-error" role="alert">
              {error}
            </div>
          )}

          <button
            className="onboarding-submit"
            type="submit"
            disabled={saving || !user}
          >
            {saving ? "Saving restaurant..." : "Create restaurant workspace"}
            {!saving && <ArrowRight size={17} />}
          </button>

          <div className="onboarding-security-note">
            <CheckCircle2 size={15} />
            Your restaurant profile is saved to your account.
          </div>
        </form>

        <p className="onboarding-footer-note">
          Signed in as {user?.email || "your account"} ·{" "}
          <Link to="/">Back to Khaavio</Link>
        </p>
      </section>
    </main>
  );
}
