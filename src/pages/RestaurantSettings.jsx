import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileImage,
  ImagePlus,
  LoaderCircle,
  Save,
  Store,
  Upload,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "./RestaurantSettings.css";
import "./RestaurantSettingsLogo.css";

const RESTAURANT_FIELDS =
  "id, name, slug, restaurant_type, logo_url, phone, contact_email, address, city, state, postal_code, description, is_published";

const LOGO_BUCKET = "restaurant-logos";
const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024;

function getOwnedLogoObjectPath(publicUrl, restaurantId) {
  if (!publicUrl || !restaurantId) return null;
  try {
    const parsed = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${LOGO_BUCKET}/`;
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const objectPath = decodeURIComponent(
      parsed.pathname.slice(markerIndex + marker.length),
    );
    return objectPath.startsWith(`${restaurantId}/`) ? objectPath : null;
  } catch {
    return null;
  }
}
const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

async function optimizeLogoImage(file) {
  if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
    throw new Error("Choose a PNG, JPG or WebP image.");
  }
  if (file.size > MAX_LOGO_FILE_BYTES) {
    throw new Error("Logo must be 5 MB or smaller.");
  }
  if (typeof createImageBitmap !== "function") {
    throw new Error(
      "This browser cannot optimise the image. Please use a recent Chrome, Edge or Safari version.",
    );
  }

  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000) {
      throw new Error(
        "This image is too large to process safely. Please choose a smaller logo file.",
      );
    }
    const maxSide = 800;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context)
      throw new Error(
        "Could not prepare this logo image. Please try another file.",
      );
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Could not optimise this image.")),
        "image/webp",
        0.84,
      );
    });
    const contentType = blob.type || "image/png";
    return {
      blob,
      contentType,
      extension: contentType === "image/webp" ? "webp" : "png",
    };
  } finally {
    bitmap.close?.();
  }
}

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
};

const BUSINESS_TYPES = [
  { value: "cafe", label: "Café / Coffee shop" },
  { value: "restaurant", label: "Restaurant / Dining" },
  { value: "bakery", label: "Bakery / Dessert shop" },
  { value: "cloud_kitchen", label: "Cloud kitchen" },
  { value: "other", label: "Other food business" },
];

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
  };
}

export default function RestaurantSettings() {
  const [restaurant, setRestaurant] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoImageFailed, setLogoImageFailed] = useState(false);

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

  useEffect(() => {
    return () => {
      if (logoPreviewUrl.startsWith("blob:"))
        URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  function handleLogoFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (logoPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(logoPreviewUrl);
    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
    setLogoImageFailed(false);
    setError("");
    setNotice("");
  }

  async function uploadRestaurantLogo() {
    if (!restaurant || !userId || !logoFile || logoUploading) return;

    setLogoUploading(true);
    setError("");
    setNotice("");

    let uploadedPath = "";
    try {
      const optimized = await optimizeLogoImage(logoFile);
      uploadedPath = `${restaurant.id}/logo-${Date.now()}.${optimized.extension}`;
      const { error: uploadError } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(uploadedPath, optimized.blob, {
          cacheControl: "60",
          contentType: optimized.contentType,
          // Use a unique object key so this is INSERT-only. Supabase upsert
          // requires INSERT + SELECT + UPDATE policies; new keys only need INSERT.
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from(LOGO_BUCKET)
        .getPublicUrl(uploadedPath);
      const logoUrl = `${publicData.publicUrl}?v=${Date.now()}`;

      const { data, error: updateError } = await supabase
        .from("restaurants")
        .update({ logo_url: logoUrl })
        .eq("id", restaurant.id)
        .eq("owner_id", userId)
        .select(RESTAURANT_FIELDS)
        .single();
      if (updateError) throw updateError;

      // Best-effort cleanup: don't fail a successful logo save if an older
      // object cannot be removed for any reason.
      const previousLogoPath = getOwnedLogoObjectPath(
        restaurant.logo_url,
        restaurant.id,
      );
      if (previousLogoPath && previousLogoPath !== uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from(LOGO_BUCKET)
          .remove([previousLogoPath]);
        if (cleanupError)
          console.warn(
            "Could not remove previous restaurant logo:",
            cleanupError,
          );
      }

      setRestaurant(data);
      setForm(formFromRestaurant(data));
      setLogoFile(null);
      if (logoPreviewUrl.startsWith("blob:"))
        URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl("");
      setLogoImageFailed(false);
      setNotice("Restaurant logo uploaded and optimised successfully.");
    } catch (err) {
      console.error("Restaurant logo upload failed:", err);
      const message =
        err?.message || "We couldn't upload this logo. Please try again.";
      if (/bucket/i.test(message) && /not found|exist/i.test(message)) {
        setError(
          "Logo storage is not set up yet. Apply supabase/restaurant-logo-storage-migration.sql in the Supabase SQL Editor, then retry.",
        );
      } else if (
        /row-level security|permission|not allowed|unauthori[sz]ed/i.test(
          message,
        )
      ) {
        setError(
          "Supabase Storage denied this upload. Run the restaurant-logo storage migration in the same Supabase project used by this app. If it is already applied, verify that this restaurant's owner_id matches the signed-in user's ID.",
        );
      } else {
        setError(message);
      }
    } finally {
      setLogoUploading(false);
    }
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setNotice("");
    setError("");
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
      setNotice("Restaurant details saved successfully.");
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
            Keep your restaurant profile and contact information up to date.
            These details help customers identify your business.
          </p>
        </div>

        {restaurant && (
          <section className="restaurant-settings-public-card">
            <div className="restaurant-settings-public-icon">
              <Store size={23} />
            </div>
            <div className="restaurant-settings-public-info">
              <span className="restaurant-settings-muted-label">
                YOUR RESTAURANT
              </span>
              <h2>{restaurant.name}</h2>
              <p>
                {restaurant.city || "City not added"}
                {restaurant.state ? `, ${restaurant.state}` : ""}
              </p>
            </div>
            <span
              className={`restaurant-settings-status ${
                restaurant.is_published ? "is-published" : "is-draft"
              }`}
            >
              {restaurant.is_published ? "Published" : "Unpublished"}
            </span>
          </section>
        )}

        {restaurant && (
          <section
            className="restaurant-logo-section"
            aria-labelledby="restaurant-logo-heading"
          >
            <div className="restaurant-logo-copy">
              <span className="restaurant-logo-eyebrow">BRAND IDENTITY</span>
              <h2 id="restaurant-logo-heading">Your restaurant logo</h2>
              <p>
                Upload a logo to personalise your public menu and branded table
                QR cards. The image is resized and compressed before upload.
              </p>
              <div className="restaurant-logo-specs">
                <FileImage size={15} /> PNG, JPG or WebP · up to 5 MB
              </div>
            </div>
            <div className="restaurant-logo-actions">
              <div
                className="restaurant-logo-preview"
                aria-label="Restaurant logo preview"
              >
                {(logoPreviewUrl || restaurant.logo_url) && !logoImageFailed ? (
                  <img
                    src={logoPreviewUrl || restaurant.logo_url}
                    alt={`${restaurant.name} logo preview`}
                    onError={() => setLogoImageFailed(true)}
                    onLoad={() => setLogoImageFailed(false)}
                  />
                ) : (
                  <span>
                    {String(restaurant.name || "R")
                      .trim()
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                )}
              </div>
              <div className="restaurant-logo-controls">
                <label
                  className="restaurant-logo-choose"
                  htmlFor="restaurant-logo-file"
                >
                  <ImagePlus size={16} />{" "}
                  {restaurant.logo_url ? "Choose new logo" : "Choose logo"}
                </label>
                <input
                  id="restaurant-logo-file"
                  className="restaurant-logo-file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoFileChange}
                  aria-label="Choose restaurant logo image"
                />
                <button
                  type="button"
                  className="restaurant-logo-upload"
                  onClick={uploadRestaurantLogo}
                  disabled={!logoFile || logoUploading}
                >
                  {logoUploading ? (
                    <LoaderCircle
                      className="restaurant-settings-spinner"
                      size={16}
                    />
                  ) : (
                    <Upload size={16} />
                  )}
                  {logoUploading ? "Optimising & uploading…" : "Upload logo"}
                </button>
                {logoFile && (
                  <span className="restaurant-logo-picked">
                    Selected: {logoFile.name}
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="restaurant-settings-message is-error" role="alert">
            {error}
          </div>
        )}

        {notice && (
          <div className="restaurant-settings-message is-success" role="status">
            <CheckCircle2 size={17} />
            <span>{notice}</span>
          </div>
        )}

        {restaurant && (
          <>
            <form className="restaurant-settings-form" onSubmit={handleSubmit}>
              <section className="restaurant-settings-section">
                <div className="restaurant-settings-section-heading">
                  <div>
                    <h2>Business information</h2>
                    <p>The basic details associated with your restaurant.</p>
                  </div>
                </div>

                <div className="restaurant-settings-grid">
                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-name">Restaurant name *</label>
                    <input
                      id="settings-name"
                      name="name"
                      value={form.name}
                      onChange={updateField}
                      placeholder="e.g. The Green Table"
                      maxLength={120}
                      required
                    />
                  </div>

                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-type">Business type *</label>
                    <select
                      id="settings-type"
                      name="restaurant_type"
                      value={form.restaurant_type}
                      onChange={updateField}
                      required
                    >
                      {BUSINESS_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="restaurant-settings-field">
                    <label htmlFor="settings-phone">Phone number</label>
                    <input
                      id="settings-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={updateField}
                      placeholder="+91 98765 43210"
                      maxLength={20}
                    />
                  </div>

                  <div className="restaurant-settings-field">
                    <label htmlFor="settings-email">Business email</label>
                    <input
                      id="settings-email"
                      name="contact_email"
                      type="email"
                      autoComplete="email"
                      value={form.contact_email}
                      onChange={updateField}
                      placeholder="cafe@example.com"
                      maxLength={254}
                    />
                  </div>
                </div>
              </section>

              <section className="restaurant-settings-section">
                <div className="restaurant-settings-section-heading">
                  <div>
                    <h2>Location</h2>
                    <p>Where customers can find your business.</p>
                  </div>
                </div>

                <div className="restaurant-settings-grid">
                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-address">Street address</label>
                    <input
                      id="settings-address"
                      name="address"
                      autoComplete="street-address"
                      value={form.address}
                      onChange={updateField}
                      placeholder="Street, building or locality"
                      maxLength={250}
                    />
                  </div>

                  <div className="restaurant-settings-field">
                    <label htmlFor="settings-city">City</label>
                    <input
                      id="settings-city"
                      name="city"
                      autoComplete="address-level2"
                      value={form.city}
                      onChange={updateField}
                      placeholder="e.g. Patna"
                      maxLength={100}
                    />
                  </div>

                  <div className="restaurant-settings-field">
                    <label htmlFor="settings-state">State</label>
                    <input
                      id="settings-state"
                      name="state"
                      autoComplete="address-level1"
                      value={form.state}
                      onChange={updateField}
                      placeholder="e.g. Bihar"
                      maxLength={100}
                    />
                  </div>

                  <div className="restaurant-settings-field">
                    <label htmlFor="settings-postal">PIN code</label>
                    <input
                      id="settings-postal"
                      name="postal_code"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      value={form.postal_code}
                      onChange={updateField}
                      placeholder="e.g. 800001"
                      maxLength={12}
                    />
                  </div>

                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-description">
                      About your restaurant
                    </label>
                    <textarea
                      id="settings-description"
                      name="description"
                      value={form.description}
                      onChange={updateField}
                      placeholder="Tell customers what makes your restaurant special."
                      rows={4}
                      maxLength={1000}
                    />
                    <span className="restaurant-settings-field-hint">
                      {form.description.length}/1000 characters
                    </span>
                  </div>
                </div>
              </section>

              <div className="restaurant-settings-actions">
                <Link to="/dashboard" className="restaurant-settings-cancel">
                  Cancel
                </Link>
                <button
                  type="submit"
                  className="restaurant-settings-save"
                  disabled={saving}
                >
                  {saving ? (
                    <LoaderCircle
                      className="restaurant-settings-spinner"
                      size={18}
                    />
                  ) : (
                    <Save size={17} />
                  )}
                  {saving ? "Saving changes..." : "Save changes"}
                </button>
              </div>
            </form>

            <section className="restaurant-settings-public-section">
              <div>
                <h2>Your public menu</h2>
                <p>
                  Share your restaurant menu link with customers.
                  {restaurant.is_published
                    ? ""
                    : " Publish your restaurant before sharing this link."}
                </p>
              </div>
              <button
                type="button"
                className="restaurant-settings-link-button"
                onClick={copyMenuLink}
              >
                <ExternalLink size={16} />
                Copy menu link
              </button>
              <code className="restaurant-settings-url">
                {window.location.origin}/menu/{restaurant.slug}
              </code>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
