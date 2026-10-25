const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A random per-restaurant bearer token keeps a guest's Perks card on this
 * browser without requiring a customer account. Never put customer phone
 * numbers or other personal data in localStorage keys.
 */
export function getOrCreateKhaavioLoyaltyToken(slug) {
  if (typeof window === "undefined" || !slug) return null;

  const key = `khaavio:perks:v1:${String(slug).trim().toLowerCase()}`;
  try {
    const existing = window.localStorage.getItem(key);
    if (existing && TOKEN_PATTERN.test(existing)) return existing;

    const cryptoApi = window.crypto;
    if (!cryptoApi || typeof cryptoApi.randomUUID !== "function") return null;

    const token = cryptoApi.randomUUID();
    window.localStorage.setItem(key, token);
    return token;
  } catch {
    // Private browsing/storage restrictions should never block menu browsing
    // or ordering. Perks is optional if a persistent token cannot be stored.
    return null;
  }
}
