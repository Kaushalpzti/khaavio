export function trackAnalyticsEvent(eventName, parameters = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return false;
  if (!/^[a-z][a-z0-9_]{1,39}$/i.test(String(eventName || ""))) return false;
  window.gtag("event", eventName, parameters);
  return true;
}
