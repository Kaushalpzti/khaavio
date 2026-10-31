export const ANALYTICS_CONSENT_KEY = "khaavio:analytics-consent:v1";
export const LEAD_CONFIRMATION_KEY = "khaavio:confirmed-lead:v1";

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
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("event", eventName, parameters);
    return true;
  } catch {
    return false;
  }
}
