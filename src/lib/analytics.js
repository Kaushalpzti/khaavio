export const ANALYTICS_CONSENT_KEY = "khaavio:analytics-consent:v1";

export function trackEvent(eventName, parameters = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return false;
  try {
    window.gtag("event", eventName, parameters);
    return true;
  } catch {
    return false;
  }
}
