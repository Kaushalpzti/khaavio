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
import { createPublicQrDestination } from "../lib/seoMetadata.js";
import { normalizeSocialLinks, SOCIAL_LINK_FIELDS, validateSocialLinks } from "../lib/restaurantSocialLinks.js";
import { isValidUpiId, normalizeUpiId } from "../lib/upiPayment.js";
import { GST_REGISTRATION_TYPES, getGstTaxType, getIndianGstStateCode } from "../lib/gstBilling.js";
import "./RestaurantSettings.css";
import "./RestaurantSettingsLogo.css";

const RESTAURANT_FIELDS =
  "id, name, slug, restaurant_type, logo_url, phone, contact_email, address, city, state, postal_code, description, google_review_url, social_links, table_billing_mode, pickup_enabled, dine_in_enabled, gst_registration_type, gst_legal_name, gst_enabled, gstin, gst_rate, gst_price_inclusive, upi_payment_enabled, counter_payment_enabled, upi_id, receipt_paper_width, is_published";

const GOOGLE_REVIEW_HOSTS = new Set([
  "g.page",
  "search.google.com",
  "www.google.com",
  "maps.google.com",
  "maps.app.goo.gl",
]);

function isAllowedGoogleReviewUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && GOOGLE_REVIEW_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
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
  google_review_url: "",
  social_links: {},
  table_billing_mode: "combined",
  pickup_enabled: true,
  dine_in_enabled: true,
  gst_registration_type: GST_REGISTRATION_TYPES.UNREGISTERED,
  gst_legal_name: "",
  gst_enabled: false,
  gstin: "",
  gst_rate: "",
  gst_price_inclusive: false,
  upi_payment_enabled: false,
  counter_payment_enabled: true,
  upi_id: "",
  receipt_paper_width: "80",
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
    google_review_url: restaurant.google_review_url || "",
    social_links: normalizeSocialLinks(restaurant.social_links),
    table_billing_mode: restaurant.table_billing_mode === "per_guest" ? "per_guest" : "combined",
    pickup_enabled: restaurant.pickup_enabled !== false,
    dine_in_enabled: restaurant.dine_in_enabled !== false,
    gst_registration_type: restaurant.gst_registration_type || (restaurant.gst_enabled === true ? GST_REGISTRATION_TYPES.NEEDS_REVIEW : GST_REGISTRATION_TYPES.UNREGISTERED),
    gst_legal_name: restaurant.gst_legal_name || "",
    gst_enabled: restaurant.gst_enabled === true,
    gstin: restaurant.gstin || "",
    gst_rate: restaurant.gst_rate == null ? "" : String(restaurant.gst_rate),
    gst_price_inclusive: restaurant.gst_price_inclusive === true,
    upi_payment_enabled: restaurant.upi_payment_enabled === true,
    counter_payment_enabled: restaurant.counter_payment_enabled !== false,
    upi_id: restaurant.upi_id || "",
    receipt_paper_width: restaurant.receipt_paper_width === "58" ? "58" : "80",
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

  function updateSocialLink(key, value) {
    setForm((current) => ({ ...current, social_links: { ...current.social_links, [key]: value } }));
    setNotice("");
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!restaurant || !userId || saving) return;

    const name = form.name.trim();
    const email = form.contact_email.trim();
    const googleReviewUrl = form.google_review_url.trim();

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
    if (googleReviewUrl && !isAllowedGoogleReviewUrl(googleReviewUrl)) {
      setError("Use a valid HTTPS Google review link (for example, a g.page or Google Maps review URL).");
      return;
    }

    const gstRate = Number(form.gst_rate);
    const gstin = form.gstin.trim().toUpperCase();
    const gstLegalName = form.gst_legal_name.trim();
    const registrationType = form.gst_registration_type;
    const validGstin = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gstin);
    const gstStateCode = getIndianGstStateCode(form.state);
    const gstTaxType = getGstTaxType({ gstin, placeOfSupplyState: form.state });
    const upiId = normalizeUpiId(form.upi_id);

    if (!Object.values(GST_REGISTRATION_TYPES).includes(registrationType)) {
      setError("Choose a valid GST registration type.");
      return;
    }
    if ([GST_REGISTRATION_TYPES.REGULAR, GST_REGISTRATION_TYPES.COMPOSITION].includes(registrationType) && !validGstin) {
      setError("Enter a valid 15-character GSTIN for this registration type.");
      return;
    }
    if ([GST_REGISTRATION_TYPES.REGULAR, GST_REGISTRATION_TYPES.COMPOSITION].includes(registrationType) && !gstStateCode) {
      setError("Choose a valid restaurant outlet state before saving GST registration details.");
      return;
    }
    if ([GST_REGISTRATION_TYPES.REGULAR, GST_REGISTRATION_TYPES.COMPOSITION].includes(registrationType)
      && (gstLegalName.length < 2 || !form.address.trim() || !form.city.trim())) {
      setError("Enter the GST-registered legal business name, full street address and city before enabling tax documents.");
      return;
    }
    if (registrationType === GST_REGISTRATION_TYPES.REGULAR && (!Number.isFinite(gstRate) || gstRate <= 0 || gstRate > 100)) {
      setError("Enter the total GST rate confirmed by your accountant (greater than 0 and no more than 100%).");
      return;
    }
    if (registrationType === GST_REGISTRATION_TYPES.REGULAR && !gstTaxType) {
      setError("We could not classify this GSTIN against the restaurant state. Check the GSTIN and outlet state.");
      return;
    }
    if (form.upi_payment_enabled && !isValidUpiId(upiId)) {
      setError("Enter a valid UPI ID before enabling UPI QR payments.");
      return;
    }

    const socialValidation = validateSocialLinks(form.social_links);
    if (!socialValidation.ok) {
      setError(socialValidation.message);
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
        google_review_url: googleReviewUrl || null,
        social_links: socialValidation.value,
        table_billing_mode: form.table_billing_mode === "per_guest" ? "per_guest" : "combined",
        pickup_enabled: form.pickup_enabled,
        dine_in_enabled: form.dine_in_enabled,
        gst_registration_type: registrationType,
        gst_legal_name: [GST_REGISTRATION_TYPES.REGULAR, GST_REGISTRATION_TYPES.COMPOSITION].includes(registrationType)
          ? gstLegalName
          : (registrationType === GST_REGISTRATION_TYPES.NEEDS_REVIEW ? (gstLegalName || null) : null),
        gst_enabled: registrationType === GST_REGISTRATION_TYPES.REGULAR,
        gstin: registrationType === GST_REGISTRATION_TYPES.UNREGISTERED ? null : (gstin || null),
        gst_rate: registrationType === GST_REGISTRATION_TYPES.REGULAR ? gstRate : (registrationType === GST_REGISTRATION_TYPES.NEEDS_REVIEW ? (Number.isFinite(gstRate) && gstRate > 0 && gstRate <= 100 ? gstRate : 0) : 0),
        gst_price_inclusive: registrationType === GST_REGISTRATION_TYPES.REGULAR && form.gst_price_inclusive,
        upi_payment_enabled: form.upi_payment_enabled,
        counter_payment_enabled: form.counter_payment_enabled,
        upi_id: upiId || null,
        receipt_paper_width: form.receipt_paper_width === "58" ? "58" : "80",
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

    const url = createPublicQrDestination("menu", restaurant.slug);

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

                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-billing-mode">Table billing mode</label>
                    <select
                      id="settings-billing-mode"
                      name="table_billing_mode"
                      value={form.table_billing_mode}
                      onChange={updateField}
                    >
                      <option value="combined">One combined bill for the table</option>
                      <option value="per_guest">Separate bill for each customer</option>
                    </select>
                    <span className="restaurant-settings-field-hint">
                      Applies to new table sessions only. Existing sessions keep their original billing mode.
                    </span>
                  </div>

                  <div className="restaurant-settings-field full-width">
                    <label>Online ordering modes</label>
                    <div className="restaurant-settings-grid">
                      <label className="restaurant-settings-checkbox" htmlFor="settings-pickup-enabled">
                        <input id="settings-pickup-enabled" type="checkbox" checked={form.pickup_enabled} onChange={(event) => setForm((current) => ({ ...current, pickup_enabled: event.target.checked }))} />
                        <span><strong>Pickup</strong><small>Customers can order ahead and collect from the restaurant.</small></span>
                      </label>
                      <label className="restaurant-settings-checkbox" htmlFor="settings-dine-in-enabled">
                        <input id="settings-dine-in-enabled" type="checkbox" checked={form.dine_in_enabled} onChange={(event) => setForm((current) => ({ ...current, dine_in_enabled: event.target.checked }))} />
                        <span><strong>Dine in</strong><small>Allow table QR orders and dine-in orders without a table QR.</small></span>
                      </label>
                    </div>
                    {!form.pickup_enabled && !form.dine_in_enabled && <span className="restaurant-settings-field-hint">Customers cannot place online orders until at least one mode is enabled.</span>}
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

              <section className="restaurant-settings-section" aria-labelledby="settings-printing-heading">
                <div className="restaurant-settings-section-heading">
                  <div>
                    <h2 id="settings-printing-heading">Printing &amp; receipts</h2>
                    <p>Choose the thermal paper width used for kitchen tickets and customer receipts.</p>
                  </div>
                </div>
                <div className="restaurant-settings-grid">
                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-receipt-paper-width">Thermal printer paper size</label>
                    <select
                      id="settings-receipt-paper-width"
                      name="receipt_paper_width"
                      value={form.receipt_paper_width}
                      onChange={updateField}
                    >
                      <option value="80">80mm — standard wide thermal printer</option>
                      <option value="58">58mm — compact thermal printer</option>
                    </select>
                    <span className="restaurant-settings-field-hint">
                      Applies to KOT printing, order receipts and customer bill printing. You can temporarily choose another width where a print screen offers a size selector.
                    </span>
                  </div>
                </div>
              </section>

              <section className="restaurant-settings-section" aria-labelledby="settings-gst-heading">
                <div className="restaurant-settings-section-heading">
                  <div>
                    <h2 id="settings-gst-heading">GST &amp; billing</h2>
                    <p>Choose the restaurant's GST registration status. Khaavio calculates the tax split automatically; confirm registration and applicable rates with your accountant.</p>
                  </div>
                </div>
                <div className="restaurant-settings-grid">
                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-gst-registration-type">GST registration type</label>
                    <select
                      id="settings-gst-registration-type"
                      name="gst_registration_type"
                      value={form.gst_registration_type}
                      onChange={updateField}
                    >
                      {form.gst_registration_type === GST_REGISTRATION_TYPES.NEEDS_REVIEW && (
                        <option value={GST_REGISTRATION_TYPES.NEEDS_REVIEW}>Needs review — legacy GST settings are disabled</option>
                      )}
                      <option value={GST_REGISTRATION_TYPES.REGULAR}>Regular GST registration</option>
                      <option value={GST_REGISTRATION_TYPES.COMPOSITION}>Composition scheme</option>
                      <option value={GST_REGISTRATION_TYPES.UNREGISTERED}>Not registered for GST</option>
                    </select>
                    <span className="restaurant-settings-field-hint">
                      Regular registration can collect GST from customers. Composition and unregistered businesses must not add GST to customer bills.
                    </span>
                  </div>

                  {form.gst_registration_type === GST_REGISTRATION_TYPES.NEEDS_REVIEW && (
                    <div className="restaurant-settings-field full-width settings-gst-notice" role="status">
                      Previous GST settings were not automatically carried forward. GST is currently disabled until you confirm the correct registration type and details.
                    </div>
                  )}

                  {[GST_REGISTRATION_TYPES.REGULAR, GST_REGISTRATION_TYPES.COMPOSITION].includes(form.gst_registration_type) && (
                    <>
                      <div className="restaurant-settings-field full-width">
                        <label htmlFor="settings-gst-legal-name">GST-registered legal business name *</label>
                        <input
                          id="settings-gst-legal-name"
                          name="gst_legal_name"
                          value={form.gst_legal_name}
                          onChange={updateField}
                          placeholder="Name shown on your GST registration"
                          maxLength={160}
                          required
                        />
                      </div>
                      <div className="restaurant-settings-field">
                        <label htmlFor="settings-gstin">GSTIN *</label>
                        <input
                          id="settings-gstin"
                          name="gstin"
                          value={form.gstin}
                          onChange={updateField}
                          placeholder="15-character GSTIN"
                          maxLength={15}
                          autoCapitalize="characters"
                          required
                        />
                      </div>
                      <div className="restaurant-settings-field">
                        <label htmlFor="settings-gst-outlet-state">Outlet state / place of supply</label>
                        <input
                          id="settings-gst-outlet-state"
                          value={form.state}
                          readOnly
                          aria-describedby="settings-gst-state-help"
                        />
                        <span id="settings-gst-state-help" className="restaurant-settings-field-hint">
                          Taken from the restaurant address above. Restaurant service place of supply is where the service is actually performed.
                        </span>
                      </div>
                    </>
                  )}

                  {form.gst_registration_type === GST_REGISTRATION_TYPES.REGULAR && (
                    <>
                      <div className="restaurant-settings-field">
                        <label htmlFor="settings-gst-rate">Total GST rate (%) *</label>
                        <input
                          id="settings-gst-rate"
                          name="gst_rate"
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          max="100"
                          step="0.01"
                          value={form.gst_rate}
                          onChange={updateField}
                          placeholder="Enter accountant-confirmed rate"
                          required
                        />
                        <span className="restaurant-settings-field-hint">Enter the total rate once. Do not enter CGST and SGST separately.</span>
                      </div>
                      <div className="restaurant-settings-field settings-gst-toggle">
                        <label htmlFor="settings-gst-inclusive">Menu prices include GST</label>
                        <div className="settings-gst-control">
                          <input
                            id="settings-gst-inclusive"
                            name="gst_price_inclusive"
                            type="checkbox"
                            checked={form.gst_price_inclusive}
                            onChange={(event) => setForm((current) => ({ ...current, gst_price_inclusive: event.target.checked }))}
                          />
                          <span>{form.gst_price_inclusive ? "GST is included in menu prices" : "GST is added to the discounted taxable value"}</span>
                        </div>
                      </div>
                      <div className="restaurant-settings-field full-width settings-gst-preview">
                        <strong>Automatic tax split preview</strong>
                        {getGstTaxType({ gstin: form.gstin, placeOfSupplyState: form.state }) === "cgst_sgst" ? (
                          <div className="settings-gst-preview-grid">
                            <span>CGST <b>{((Number(form.gst_rate) || 0) / 2).toFixed(2)}%</b></span>
                            <span>SGST <b>{((Number(form.gst_rate) || 0) / 2).toFixed(2)}%</b></span>
                          </div>
                        ) : getGstTaxType({ gstin: form.gstin, placeOfSupplyState: form.state }) === "igst" ? (
                          <div className="settings-gst-preview-grid">
                            <span>IGST <b>{(Number(form.gst_rate) || 0).toFixed(2)}%</b></span>
                          </div>
                        ) : (
                          <p>Enter a valid GSTIN and select a recognised outlet state to preview the applicable tax split.</p>
                        )}
                        <span className="restaurant-settings-field-hint">Khaavio compares the GSTIN state code with the outlet state. Restaurant service place of supply is the outlet where the service is performed.</span>
                      </div>
                    </>
                  )}

                  {form.gst_registration_type === GST_REGISTRATION_TYPES.COMPOSITION && (
                    <div className="restaurant-settings-field full-width settings-gst-notice" role="status">
                      Composition scheme selected. Khaavio will not collect or add GST to customer bills. Eligible supplies will use a Bill of Supply document.
                    </div>
                  )}

                  {form.gst_registration_type === GST_REGISTRATION_TYPES.UNREGISTERED && (
                    <div className="restaurant-settings-field full-width settings-gst-notice" role="status">
                      GST is off. Khaavio will not add GST to customer bills or display a GST tax invoice.
                    </div>
                  )}
                </div>
              </section>

              <section className="restaurant-settings-section" aria-labelledby="settings-payments-heading">
                <div className="restaurant-settings-section-heading">
                  <div>
                    <h2 id="settings-payments-heading">Customer payment methods</h2>
                    <p>Let customers pay the restaurant directly. Khaavio does not collect or hold food-order payments.</p>
                  </div>
                </div>
                <div className="restaurant-settings-grid">
                  <label className="restaurant-settings-checkbox" htmlFor="settings-upi-enabled">
                    <input
                      id="settings-upi-enabled"
                      type="checkbox"
                      checked={form.upi_payment_enabled}
                      onChange={(event) => setForm((current) => ({ ...current, upi_payment_enabled: event.target.checked }))}
                    />
                    <span>
                      <strong>UPI QR payment</strong>
                      <small>Show an amount-specific UPI QR and UPI app link on the customer's final bill.</small>
                    </span>
                  </label>
                  <label className="restaurant-settings-checkbox" htmlFor="settings-counter-payment-enabled">
                    <input
                      id="settings-counter-payment-enabled"
                      type="checkbox"
                      checked={form.counter_payment_enabled}
                      onChange={(event) => setForm((current) => ({ ...current, counter_payment_enabled: event.target.checked }))}
                    />
                    <span>
                      <strong>Pay at counter</strong>
                      <small>Customers can settle the bill with restaurant staff using cash or the counter's accepted method.</small>
                    </span>
                  </label>
                  {form.upi_payment_enabled && (
                    <div className="restaurant-settings-field full-width">
                      <label htmlFor="settings-upi-id">Restaurant UPI ID *</label>
                      <input
                        id="settings-upi-id"
                        name="upi_id"
                        value={form.upi_id}
                        onChange={updateField}
                        placeholder="restaurant@bank"
                        maxLength={320}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        required
                      />
                      <span className="restaurant-settings-field-hint">
                        Khaavio creates the QR with the exact invoice amount. Customer-submitted UPI references remain pending until your staff confirms the credit in the restaurant's UPI/bank app.
                      </span>
                    </div>
                  )}
                  {!form.upi_payment_enabled && !form.counter_payment_enabled && (
                    <p className="restaurant-settings-field-hint full-width">
                      Both payment options are off. Customers will be asked to contact restaurant staff for payment instructions.
                    </p>
                  )}
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
                  <div className="restaurant-settings-field full-width">
                    <label htmlFor="settings-google-review-url">Google review link <span className="restaurant-settings-field-hint">(optional)</span></label>
                    <input
                      id="settings-google-review-url"
                      name="google_review_url"
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      value={form.google_review_url}
                      onChange={updateField}
                      placeholder="https://g.page/r/.../review"
                      maxLength={500}
                    />
                    <span className="restaurant-settings-field-hint">
                      Add your Google Business Profile review link. It appears to all customers, regardless of their private feedback rating.
                    </span>
                  </div>
                </div>
              </section>

              <section className="restaurant-settings-section restaurant-settings-social-section">
                <div className="restaurant-settings-section-heading">
                  <div>
                    <h2>Social media & links</h2>
                    <p>Add profiles customers can follow. Only links you fill in appear on your public menu.</p>
                  </div>
                </div>
                <div className="restaurant-settings-grid">
                  {SOCIAL_LINK_FIELDS.map((field) => (
                    <div className="restaurant-settings-field" key={field.key}>
                      <label htmlFor={"settings-social-" + field.key}>
                        {field.label}
                        <span className="restaurant-settings-field-hint"> (optional)</span>
                      </label>
                      <input
                        id={"settings-social-" + field.key}
                        name={"social_links." + field.key}
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        value={form.social_links?.[field.key] || ""}
                        onChange={(event) => updateSocialLink(field.key, event.target.value)}
                        placeholder={field.placeholder}
                        maxLength={500}
                      />
                      <span className="restaurant-settings-field-hint">{field.helper}</span>
                    </div>
                  ))}
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
                {createPublicQrDestination("menu", restaurant.slug)}
              </code>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
