import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const CONSENT_KEY = "khaavio:analytics-consent:v1";
const MEASUREMENT_ID = String(import.meta.env.VITE_GA4_MEASUREMENT_ID || "").trim();
const ANALYTICS_CONFIGURED = /^G-[A-Z0-9]+$/i.test(MEASUREMENT_ID);
const DENIED_CONSENT = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  functionality_storage: "granted",
  security_storage: "granted",
};

function ensureGtagQueue() {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
}

function updateConsent(choice) {
  if (typeof window === "undefined" || !ANALYTICS_CONFIGURED) return;
  ensureGtagQueue();
  window.gtag("consent", "update", {
    ...DENIED_CONSENT,
    analytics_storage: choice === "accepted" ? "granted" : "denied",
  });
}

function loadAnalytics() {
  if (typeof window === "undefined" || typeof document === "undefined" || !ANALYTICS_CONFIGURED) return;
  ensureGtagQueue();
  if (!document.getElementById("khaavio-ga4-loader")) {
    const script = document.createElement("script");
    script.id = "khaavio-ga4-loader";
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(script);
  }
  if (!window.__khaavioGaConfigured) {
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, { send_page_view: false });
    window.__khaavioGaConfigured = true;
  }
}

export default function AnalyticsConsent() {
  const location = useLocation();
  const [choice, setChoice] = useState(null);
  const [ready, setReady] = useState(false);
  const onCustomerMenu = location.pathname.startsWith("/menu/");
  const consentBottom = onCustomerMenu ? "calc(82px + env(safe-area-inset-bottom, 0px))" : "max(16px, env(safe-area-inset-bottom))";

  useEffect(() => {
    if (!ANALYTICS_CONFIGURED) {
      setReady(true);
      return;
    }
    ensureGtagQueue();
    window.gtag("consent", "default", DENIED_CONSENT);
    let stored = null;
    try { stored = window.localStorage.getItem(CONSENT_KEY); } catch { /* Browser storage may be unavailable. */ }
    const next = stored === "accepted" || stored === "rejected" ? stored : null;
    setChoice(next);
    if (next === "accepted") {
      updateConsent("accepted");
      loadAnalytics();
    } else if (next === "rejected") {
      updateConsent("rejected");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || choice !== "accepted" || !ANALYTICS_CONFIGURED) return;
    updateConsent("accepted");
    loadAnalytics();
    // Do not send query strings: they may contain table or order bearer tokens.
    window.gtag?.("event", "page_view", {
      page_path: location.pathname,
      page_location: window.location.origin + location.pathname,
    });
  }, [choice, location.pathname, ready]);

  function saveChoice(next) {
    setChoice(next);
    try { window.localStorage.setItem(CONSENT_KEY, next); } catch { /* Choice remains active for this page view. */ }
    updateConsent(next);
    if (next === "accepted") loadAnalytics();
  }

  function openPrivacyChoices() {
    // Revoke optional analytics immediately while the visitor is reconsidering.
    updateConsent("rejected");
    setChoice(null);
  }

  if (!ANALYTICS_CONFIGURED || !ready) return null;

  return (
    <>
      {choice === null ? (
        <aside role="dialog" aria-label="Analytics privacy choices" aria-live="polite"
          style={{ position: "fixed", zIndex: 1200, left: "max(16px, env(safe-area-inset-left))", right: "max(16px, env(safe-area-inset-right))", bottom: consentBottom, width: "min(100% - 32px, 720px)", margin: "0 auto", padding: "18px", border: "1px solid #dfe7dc", borderRadius: 18, background: "#fff", color: "#203329", boxShadow: "0 18px 55px rgba(20, 40, 26, .18)" }}>
          <strong style={{ display: "block", fontSize: 15 }}>Your privacy choices</strong>
          <p style={{ margin: "7px 0 14px", color: "#647267", fontSize: 13, lineHeight: 1.6 }}>Khaavio uses essential storage to run the service. With your permission, Google Analytics helps us understand website usage. Optional analytics stays off until you accept.</p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 9 }}>
            <button type="button" onClick={() => saveChoice("accepted")} style={{ minHeight: 40, padding: "0 15px", border: 0, borderRadius: 11, background: "#245b3b", color: "#fff", fontWeight: 750, cursor: "pointer" }}>Accept analytics</button>
            <button type="button" onClick={() => saveChoice("rejected")} style={{ minHeight: 40, padding: "0 15px", border: "1px solid #dce5dc", borderRadius: 11, background: "#fff", color: "#30493a", fontWeight: 700, cursor: "pointer" }}>Reject optional</button>
            <Link to="/privacy" style={{ marginLeft: "auto", color: "#55765e", fontSize: 12, fontWeight: 700 }}>Privacy policy</Link>
          </div>
        </aside>
      ) : (
        <button type="button" onClick={openPrivacyChoices} aria-label="Manage analytics privacy choices"
          style={{ position: "fixed", zIndex: 1190, right: 16, bottom: onCustomerMenu ? "calc(82px + env(safe-area-inset-bottom, 0px))" : 16, minHeight: 34, padding: "0 11px", border: "1px solid #dce5dc", borderRadius: 999, background: "#fff", color: "#53685a", boxShadow: "0 4px 18px rgba(20,40,26,.10)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          Privacy choices
        </button>
      )}
    </>
  );
}
