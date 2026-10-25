const STORAGE_PREFIX = "khaavio:perks-phone:v1:";

export function normalizeKhaavioIndianMobile(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  let mobile = digits;
  if (mobile.length === 12 && mobile.startsWith("91")) mobile = mobile.slice(2);
  if (mobile.length !== 10 || !/^[6-9]\d{9}$/.test(mobile)) return "";
  return `+91${mobile}`;
}

export function getStoredKhaavioLoyaltyPhone(slug) {
  if (typeof window === "undefined" || !slug) return "";
  try {
    return normalizeKhaavioIndianMobile(
      window.sessionStorage.getItem(`${STORAGE_PREFIX}${String(slug).trim().toLowerCase()}`) || "",
    );
  } catch {
    return "";
  }
}

export function setStoredKhaavioLoyaltyPhone(slug, value) {
  if (typeof window === "undefined" || !slug) return;
  const key = `${STORAGE_PREFIX}${String(slug).trim().toLowerCase()}`;
  try {
    const normalized = normalizeKhaavioIndianMobile(value);
    if (normalized) window.sessionStorage.setItem(key, normalized);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Loyalty is optional; browser storage restrictions must not break ordering.
  }
}
