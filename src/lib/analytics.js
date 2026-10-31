export const ANALYTICS_CONSENT_KEY = "khaavio:analytics-consent:v1";
export const LEAD_CONFIRMATION_KEY = "khaavio:confirmed-lead:v1";

const pendingEvents = [];

export function sanitizeAnalyticsPath(pathname) {
  const path = String(pathname || "/").split("?")[0].replace(/\/{2,}/g, "/");
  if (/^\/menu\/[^/]+(?:\/.*)?$/.test(path)) return "/menu/:restaurant";
  if (/^\/book\/[^/]+(?:\/.*)?$/.test(path)) return "/book/:restaurant";
  if (/^\/track\/[^/]+\/[^/]+(?:\/.*)?$/.test(path)) return "/track/:restaurant/:order";
  return path || "/";
}

export function markLeadConfirmed(leadType) {
  if (typeof window === "undefined" || !["demo", "contact"].includes(leadType)) return false;
  try {
    window.sessionStorage.setItem(LEAD_CONFIRMATION_KEY, leadType);
    return true;
  } catch {
    return false;
  }
}

export function consumeLeadConfirmation(leadType) {
  if (typeof window === "undefined") return false;
  try {
    const confirmed = window.sessionStorage.getItem(LEAD_CONFIRMATION_KEY);
    window.sessionStorage.removeItem(LEAD_CONFIRMATION_KEY);
    return confirmed === leadType;
  } catch {
    return false;
  }
}

export function trackEvent(eventName, parameters = {}) {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(ANALYTICS_CONSENT_KEY) !== "granted") return false;
    if (typeof window.gtag !== "function") {
      pendingEvents.push([eventName, parameters]);
      return true;
    }
    window.gtag("event", eventName, parameters);
    return true;
  } catch {
    return false;
  }
}

export function flushPendingAnalyticsEvents() {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const events = pendingEvents.splice(0, pendingEvents.length);
  for (const [eventName, parameters] of events) {
    window.gtag("event", eventName, parameters);
  }
}
