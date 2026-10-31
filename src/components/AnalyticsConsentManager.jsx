import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ANALYTICS_CONSENT_KEY,
  flushPendingAnalyticsEvents,
  sanitizeAnalyticsPath,
  trackEvent,
} from "../lib/analytics";
import "./AnalyticsConsentManager.css";

const MEASUREMENT_ID = String(import.meta.env.VITE_GA4_MEASUREMENT_ID || "").trim();
let analyticsConfigured = false;

function readConsent() {
  if (typeof window === "undefined") return "unset";
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : "unset";
  } catch {
    return "unset";
  }
}

function consentPayload(value) {
  return {
    analytics_storage: value === "granted" ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
}

function applyConsent(value) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("consent", "update", consentPayload(value));
}

function loadGoogleAnalytics() {
  if (!MEASUREMENT_ID || typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  if (!document.querySelector('script[data-khaavio-ga="true"]')) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(MEASUREMENT_ID);
    script.dataset.khaavioGa = "true";
    document.head.appendChild(script);
  }

  if (analyticsConfigured) return;
  window.gtag("consent", "default", consentPayload("denied"));
  window.gtag("consent", "update", consentPayload("granted"));
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, { send_page_view: false });
  analyticsConfigured = true;
  flushPendingAnalyticsEvents();
}

export default function AnalyticsConsentManager() {
  const location = useLocation();
  const [consent, setConsent] = useState(readConsent);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("khaavio:privacy-settings", onOpen);
    return () => window.removeEventListener("khaavio:privacy-settings", onOpen);
  }, []);

  useEffect(() => {
    if (consent !== "granted" || !MEASUREMENT_ID) return;
    loadGoogleAnalytics();
    const pagePath = sanitizeAnalyticsPath(location.pathname);
    trackEvent("page_view", {
      page_path: pagePath,
      page_location: window.location.origin + pagePath,
    });
  }, [consent, location.pathname]);

  function choose(value) {
    try {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
    } catch {
      // If storage is unavailable, the choice remains valid for this render only.
    }
    applyConsent(value);
    setConsent(value);
    setOpen(false);
  }

  if (!MEASUREMENT_ID) return null;

  const visible = consent === "unset" || open;
  return (
    <>
      {consent !== "unset" && (
        <button type="button" className="kh-privacy-choices-trigger" onClick={() => setOpen(true)}>
          Privacy choices
        </button>
      )}
      {visible && (
        <section className="kh-analytics-consent" role="dialog" aria-modal="false" aria-labelledby="kh-analytics-title">
          <div className="kh-analytics-consent-copy">
            <strong id="kh-analytics-title">Your privacy choices</strong>
            <p>
              We use Google Analytics 4 only when you allow analytics. Essential site
              functions remain available either way. Read our{" "}
              <Link to="/privacy" onClick={() => setOpen(false)}>Privacy Policy</Link>.
            </p>
          </div>
          <div className="kh-analytics-consent-actions">
            <button type="button" className="kh-analytics-accept" onClick={() => choose("granted")}>Allow analytics</button>
            <button type="button" className="kh-analytics-reject" onClick={() => choose("denied")}>Reject optional</button>
            {consent !== "unset" && (
              <button type="button" className="kh-analytics-close" onClick={() => setOpen(false)} aria-label="Close privacy choices">×</button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
