export const PUBLIC_SITE_URL = "https://khaavio.in";
export const APP_SITE_URL = "https://app.khaavio.in";

const APP_ONLY_PATH = /^\/(?:login|signup|reset-password|onboarding|dashboard(?:\/|$)|platform-admin(?:\/|$))/;
const CUSTOMER_PATH = /^\/(?:menu|book|track)(?:\/|$)/;
const MARKETING_PATH = /^\/(?:about|contact|privacy|terms|refund-policy|refunds|cancellation-refund)(?:\/|$)/;
const PRODUCTION_HOSTS = new Set(["khaavio.in", "www.khaavio.in", "app.khaavio.in"]);

function normalizeHost(hostname) {
  return String(hostname || "")
    .split(",")[0]
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .replace(/:\d+$/, "")
    .toLowerCase();
}

function normalizePath(pathname) {
  let path = String(pathname || "/").split("?")[0];
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("\0")) {
    return "/";
  }
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path || "/";
}

function normalizeSearch(search) {
  const value = String(search || "").trim();
  if (!value || value === "?") return "";
  return value.startsWith("?") ? value : `?${value}`;
}

/**
 * Return the canonical host destination for a route, or an empty string when
 * the current host already owns that route.
 *
 * Marketing and customer URLs stay on khaavio.in. Authenticated restaurant
 * workspaces stay on app.khaavio.in. The Super Admin remains a separate app.
 */
export function getDomainRedirectTarget(hostname, pathname, search = "") {
  const host = normalizeHost(hostname);
  const path = normalizePath(pathname);
  const suffix = normalizeSearch(search);

  if (host === "www.khaavio.in") {
    const destination = APP_ONLY_PATH.test(path) ? APP_SITE_URL : PUBLIC_SITE_URL;
    return `${destination}${path}${suffix}`;
  }

  if (host === "khaavio.in" && APP_ONLY_PATH.test(path)) {
    return `${APP_SITE_URL}${path}${suffix}`;
  }

  if (
    host === "app.khaavio.in" &&
    (CUSTOMER_PATH.test(path) || MARKETING_PATH.test(path))
  ) {
    return `${PUBLIC_SITE_URL}${path}${suffix}`;
  }

  return "";
}

/**
 * Send Supabase auth callbacks to the restaurant app in production while
 * keeping local and Vercel preview authentication on their own origin.
 */
export function getAppRedirectUrl(pathname, hostname, currentOrigin) {
  const path = String(pathname || "/").startsWith("/")
    ? String(pathname || "/")
    : `/${pathname}`;
  const host = normalizeHost(hostname);
  const base = PRODUCTION_HOSTS.has(host)
    ? APP_SITE_URL
    : String(currentOrigin || APP_SITE_URL).replace(/\/+$/, "");

  return `${base}${path}`;
}
