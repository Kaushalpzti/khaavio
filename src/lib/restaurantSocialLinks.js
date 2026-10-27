export const SOCIAL_LINK_FIELDS = Object.freeze([
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourrestaurant", helper: "Your restaurant's Instagram profile.", hosts: ["instagram.com", "www.instagram.com", "m.instagram.com"] },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/yourrestaurant", helper: "Your restaurant's Facebook page.", hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.me"] },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourrestaurant", helper: "Your channel or video page.", hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"] },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourrestaurant", helper: "Your restaurant's TikTok profile.", hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"] },
  { key: "x", label: "X / Twitter", placeholder: "https://x.com/yourrestaurant", helper: "Your X or Twitter profile.", hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"] },
  { key: "whatsapp", label: "WhatsApp", placeholder: "https://wa.me/919876543210", helper: "A public WhatsApp chat or business contact link.", hosts: ["wa.me", "api.whatsapp.com", "whatsapp.com", "www.whatsapp.com", "chat.whatsapp.com"] },
  { key: "website", label: "Website", placeholder: "https://yourrestaurant.com", helper: "Your official website (HTTPS link).", hosts: null },
]);

const SOCIAL_FIELD_MAP = new Map(SOCIAL_LINK_FIELDS.map((field) => [field.key, field]));

function validateSingleSocialUrl(key, value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { valid: true, url: "" };
  const field = SOCIAL_FIELD_MAP.get(key);
  if (!field) return { valid: false, url: "", message: "Choose a supported social platform." };
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
      return { valid: false, url: "", message: field.label + " must use a public HTTPS link." };
    }
    const hostname = url.hostname.toLowerCase();
    if (field.hosts) {
      if (!field.hosts.includes(hostname)) return { valid: false, url: "", message: "Use an official " + field.label + " URL for the " + field.label + " field." };
    } else if (hostname === "localhost" || !hostname.includes(".") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
      return { valid: false, url: "", message: "Website must use a public domain over HTTPS." };
    }
    return { valid: true, url: url.toString(), message: "" };
  } catch {
    return { valid: false, url: "", message: "Enter a complete HTTPS URL for " + field.label + "." };
  }
}

export function normalizeSocialLinks(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(SOCIAL_LINK_FIELDS.map((field) => {
    const result = validateSingleSocialUrl(field.key, source[field.key]);
    return [field.key, result.valid ? result.url : ""];
  }));
}

export function validateSocialLinks(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalized = {};
  for (const field of SOCIAL_LINK_FIELDS) {
    const raw = typeof source[field.key] === "string" ? source[field.key].trim() : "";
    if (!raw) continue;
    const result = validateSingleSocialUrl(field.key, raw);
    if (!result.valid) return { ok: false, value: {}, message: result.message };
    normalized[field.key] = result.url;
  }
  return { ok: true, value: normalized, message: "" };
}

export function hasSocialLinks(value) {
  const normalized = normalizeSocialLinks(value);
  return SOCIAL_LINK_FIELDS.some((field) => Boolean(normalized[field.key]));
}
