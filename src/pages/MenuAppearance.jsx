import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  LoaderCircle,
  Monitor,
  Palette,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { PUBLIC_SITE_URL } from "../lib/domainRouting.js";
import {
  DEFAULT_PUBLIC_MENU_THEME_ID,
  PUBLIC_MENU_THEMES,
  getPublicMenuTheme,
  isValidPublicMenuThemeId,
} from "../lib/publicMenuThemes.js";
import "./MenuAppearance.css";

const ORIGINAL_SWATCHES = ["#B6471C", "#8F3211", "#2D7756", "#FBF6EE", "#FFFDF8", "#2C1B14"];
const PREVIEW_MESSAGE = "khaavio:public-menu-theme-preview";
const PREVIEW_READY_MESSAGE = "khaavio:public-menu-theme-preview-ready";

function isMissingThemeSettingsTable(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || (message.includes("restaurant_public_menu_themes") && message.includes("not"));
}

function ThemePaletteCard({ theme, selected, onSelect }) {
  return (
    <button
      type="button"
      className={"menu-appearance-theme-card" + (selected ? " is-selected" : "")}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="menu-appearance-card-swatches" aria-hidden="true">
        {theme.swatches.map((color, index) => (
          <span key={color + index} style={{ backgroundColor: color }} />
        ))}
      </span>
      <span className="menu-appearance-card-copy">
        <strong>{theme.name}</strong>
        <small>{theme.description}</small>
      </span>
      <span className="menu-appearance-card-check" aria-hidden="true">
        {selected ? <Check size={16} /> : <Palette size={15} />}
      </span>
    </button>
  );
}

export default function MenuAppearance() {
  const navigate = useNavigate();
  const iframeRef = useRef(null);
  const [restaurant, setRestaurant] = useState(null);
  const [selectedThemeId, setSelectedThemeId] = useState(DEFAULT_PUBLIC_MENU_THEME_ID);
  const [savedThemeId, setSavedThemeId] = useState(DEFAULT_PUBLIC_MENU_THEME_ID);
  const [previewMode, setPreviewMode] = useState("mobile");
  const [previewReady, setPreviewReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isDirty = selectedThemeId !== savedThemeId;
  const publicPreviewOrigin = window.location.hostname.toLowerCase() === "app.khaavio.in"
    ? new URL(PUBLIC_SITE_URL).origin
    : window.location.origin;
  const selectedTheme = getPublicMenuTheme(selectedThemeId);

  useEffect(() => {
    let active = true;

    async function loadAppearance() {
      setLoading(true);
      setError("");
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData?.user) {
          navigate("/login", { replace: true });
          return;
        }

        const { data: restaurantData, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name, slug, is_published")
          .eq("owner_id", authData.user.id)
          .maybeSingle();
        if (restaurantError) throw restaurantError;
        if (!restaurantData) {
          throw new Error("No restaurant workspace was found. Complete restaurant setup first.");
        }
        if (!active) return;
        setRestaurant(restaurantData);

        const { data: themeRow, error: themeError } = await supabase
          .from("restaurant_public_menu_themes")
          .select("theme_id")
          .eq("restaurant_id", restaurantData.id)
          .maybeSingle();

        if (themeError) {
          if (isMissingThemeSettingsTable(themeError)) {
            setMigrationMissing(true);
          } else {
            throw themeError;
          }
        }

        const persistedThemeId = isValidPublicMenuThemeId(themeRow?.theme_id)
          ? themeRow.theme_id
          : DEFAULT_PUBLIC_MENU_THEME_ID;
        if (!active) return;
        setSelectedThemeId(persistedThemeId);
        setSavedThemeId(persistedThemeId);
      } catch (loadError) {
        if (active) setError(loadError?.message || "Could not load the menu appearance settings.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadAppearance();
    return () => { active = false; };
  }, [navigate]);

  useEffect(() => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow || !previewReady) return;
    frameWindow.postMessage(
      { type: PREVIEW_MESSAGE, themeId: selectedThemeId },
      publicPreviewOrigin,
    );
  }, [selectedThemeId, previewReady, restaurant?.slug, publicPreviewOrigin]);

  useEffect(() => {
    function handlePreviewMessage(event) {
      const frameWindow = iframeRef.current?.contentWindow;
      if (
        event.origin !== publicPreviewOrigin
        || !frameWindow
        || event.source !== frameWindow
        || event.data?.type !== PREVIEW_READY_MESSAGE
      ) {
        return;
      }
      setPreviewReady(true);
      frameWindow.postMessage(
        { type: PREVIEW_MESSAGE, themeId: selectedThemeId },
        event.origin,
      );
    }

    window.addEventListener("message", handlePreviewMessage);
    return () => window.removeEventListener("message", handlePreviewMessage);
  }, [selectedThemeId]);

  function handleIframeLoad() {
    setPreviewReady(true);
    iframeRef.current?.contentWindow?.postMessage(
      { type: PREVIEW_MESSAGE, themeId: selectedThemeId },
      publicPreviewOrigin,
    );
  }

  async function saveTheme() {
    if (!restaurant || saving || migrationMissing || !isDirty) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { error: saveError } = await supabase
        .from("restaurant_public_menu_themes")
        .upsert(
          { restaurant_id: restaurant.id, theme_id: selectedThemeId },
          { onConflict: "restaurant_id" },
        );
      if (saveError) {
        if (isMissingThemeSettingsTable(saveError)) setMigrationMissing(true);
        throw saveError;
      }
      setSavedThemeId(selectedThemeId);
      setNotice("Your public menu theme has been saved and applied.");
    } catch (saveError) {
      setError(saveError?.message || "Could not save this theme. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function resetTheme() {
    setSelectedThemeId(DEFAULT_PUBLIC_MENU_THEME_ID);
    setNotice("Original Khaavio styling selected. Save to apply it to your public menu.");
    setError("");
  }

  if (loading) {
    return (
      <main className="menu-appearance-page menu-appearance-loading">
        <LoaderCircle size={26} className="menu-appearance-spinner" />
        <p>Loading your menu design studio...</p>
      </main>
    );
  }

  return (
    <main className="menu-appearance-page">
      <header className="menu-appearance-header">
        <div>
          <Link className="menu-appearance-back" to="/dashboard/menu">
            <ArrowLeft size={16} />
            Back to Menu Manager
          </Link>
          <div className="menu-appearance-heading">
            <span className="menu-appearance-heading-icon"><Palette size={21} /></span>
            <div>
              <p className="menu-appearance-eyebrow">CUSTOMER-FACING DESIGN</p>
              <h1>Public Menu Appearance</h1>
              <p>Make your digital menu feel like your restaurant brand.</p>
            </div>
          </div>
        </div>
        <div className="menu-appearance-header-actions">
          <button
            type="button"
            className="menu-appearance-reset"
            onClick={resetTheme}
            disabled={selectedThemeId === DEFAULT_PUBLIC_MENU_THEME_ID}
          >
            <RotateCcw size={15} />
            Reset to original
          </button>
          <button
            type="button"
            className="menu-appearance-save"
            onClick={() => void saveTheme()}
            disabled={!isDirty || saving || migrationMissing || !restaurant}
          >
            {saving ? <LoaderCircle size={16} className="menu-appearance-spinner" /> : <Save size={16} />}
            {saving ? "Saving..." : "Save & Apply"}
          </button>
        </div>
      </header>

      {error && <div className="menu-appearance-alert is-error" role="alert">{error}</div>}
      {notice && <div className="menu-appearance-alert is-success" role="status">{notice}</div>}
      {migrationMissing && (
        <div className="menu-appearance-alert is-warning" role="status">
          <strong>Database migration required.</strong> You can explore palettes and preview them, but saving is unavailable until the Public Menu Theme Studio migration is applied to this Supabase project.
        </div>
      )}

      <div className="menu-appearance-workspace">
        <section className="menu-appearance-library" aria-labelledby="menu-appearance-library-title">
          <div className="menu-appearance-section-heading">
            <div>
              <p className="menu-appearance-eyebrow">CURATED COLLECTION</p>
              <h2 id="menu-appearance-library-title">Choose your colour palette</h2>
              <p>12 hand-picked palettes, plus your original Khaavio look.</p>
            </div>
            <span className="menu-appearance-count">{PUBLIC_MENU_THEMES.length} palettes</span>
          </div>

          <button
            type="button"
            className={"menu-appearance-original-card" + (selectedThemeId === DEFAULT_PUBLIC_MENU_THEME_ID ? " is-selected" : "")}
            aria-pressed={selectedThemeId === DEFAULT_PUBLIC_MENU_THEME_ID}
            onClick={() => setSelectedThemeId(DEFAULT_PUBLIC_MENU_THEME_ID)}
          >
            <span className="menu-appearance-card-swatches" aria-hidden="true">
              {ORIGINAL_SWATCHES.map((color) => <span key={color} style={{ backgroundColor: color }} />)}
            </span>
            <span className="menu-appearance-card-copy">
              <strong>Original Khaavio</strong>
              <small>Keep the current public menu design.</small>
            </span>
            <span className="menu-appearance-card-check" aria-hidden="true">
              {selectedThemeId === DEFAULT_PUBLIC_MENU_THEME_ID ? <Check size={16} /> : <Palette size={15} />}
            </span>
          </button>

          <div className="menu-appearance-theme-grid">
            {PUBLIC_MENU_THEMES.map((theme) => (
              <ThemePaletteCard
                key={theme.id}
                theme={theme}
                selected={selectedThemeId === theme.id}
                onSelect={() => setSelectedThemeId(theme.id)}
              />
            ))}
          </div>

          <div className="menu-appearance-tip">
            <Sparkles size={17} />
            <p>These colours affect the customer-facing Public Menu only. QR artwork and the four existing QR templates stay exactly as they are.</p>
          </div>
        </section>

        <aside className="menu-appearance-preview-panel" aria-label="Live public menu preview">
          <div className="menu-appearance-preview-heading">
            <div>
              <p className="menu-appearance-eyebrow">LIVE PREVIEW</p>
              <h2>{restaurant?.name || "Your restaurant"}</h2>
              <p>Changes here are a draft until you save.</p>
            </div>
            <div className="menu-appearance-preview-switch" role="group" aria-label="Preview size">
              <button
                type="button"
                aria-pressed={previewMode === "mobile"}
                className={previewMode === "mobile" ? "is-active" : ""}
                onClick={() => setPreviewMode("mobile")}
              >
                <Smartphone size={15} />
                Mobile
              </button>
              <button
                type="button"
                aria-pressed={previewMode === "desktop"}
                className={previewMode === "desktop" ? "is-active" : ""}
                onClick={() => setPreviewMode("desktop")}
              >
                <Monitor size={15} />
                Desktop
              </button>
            </div>
          </div>

          {restaurant?.is_published && restaurant?.slug ? (
            <div className={"menu-appearance-preview-stage is-" + previewMode}>
              <div className="menu-appearance-preview-frame">
                <iframe
                  ref={iframeRef}
                  title={restaurant.name + " public menu theme preview"}
                  src={publicPreviewOrigin + "/menu/" + encodeURIComponent(restaurant.slug) + "?khaavioThemePreview=1"}
                  onLoad={handleIframeLoad}
                  loading="eager"
                />
              </div>
            </div>
          ) : (
            <div className="menu-appearance-preview-empty">
              <div><ExternalLink size={22} /></div>
              <strong>Publish your menu to preview it here</strong>
              <p>You can still choose and save a palette. Once your public menu is published, this panel will show the real customer experience.</p>
              <Link to="/dashboard">Open restaurant overview</Link>
            </div>
          )}

          <div className="menu-appearance-preview-footer">
            <span className={isDirty ? "is-unsaved" : "is-saved"}>
              <span />
              {isDirty ? "Unsaved preview" : "Saved theme"}
            </span>
            <span>{selectedTheme?.name || "Original Khaavio"}</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
