export const KHAAVIO_ALERT_PREFERENCE_DEFAULTS = Object.freeze({
  // Audio alerts start off until a team member explicitly enables them.
  voiceEnabled: false,
  soundEnabled: false,
});

const STORAGE_PREFIX = "khaavio:operational-alerts:v1:";
const CHANGE_EVENT = "khaavio:operational-alerts-change";
const validKeys = new Set(Object.keys(KHAAVIO_ALERT_PREFERENCE_DEFAULTS));

function storageKey(userId) {
  return userId ? `${STORAGE_PREFIX}${userId}` : null;
}

function dispatchChange(userId, preferences) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
    detail: { userId, preferences },
  }));
}

export function readKhaavioAlertPreferences(userId) {
  if (!userId || typeof window === "undefined") {
    return { ...KHAAVIO_ALERT_PREFERENCE_DEFAULTS };
  }

  try {
    const key = storageKey(userId);
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return { ...KHAAVIO_ALERT_PREFERENCE_DEFAULTS };
    const stored = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(KHAAVIO_ALERT_PREFERENCE_DEFAULTS).map(([name, fallback]) => [
        name,
        typeof stored?.[name] === "boolean" ? stored[name] : fallback,
      ]),
    );
  } catch {
    return { ...KHAAVIO_ALERT_PREFERENCE_DEFAULTS };
  }
}

export function writeKhaavioAlertPreference(userId, preference, value) {
  if (!userId || !validKeys.has(preference) || typeof value !== "boolean") {
    return readKhaavioAlertPreferences(userId);
  }

  const next = {
    ...readKhaavioAlertPreferences(userId),
    [preference]: value,
  };

  try {
    const key = storageKey(userId);
    window.sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    // In-memory state remains usable if browser storage is blocked.
  }
  dispatchChange(userId, next);
  return next;
}

/** Reset all operational alert toggles to ON for an explicit successful login. */
export function resetKhaavioAlertPreferences(userId) {
  if (!userId) return;
  const next = { ...KHAAVIO_ALERT_PREFERENCE_DEFAULTS };
  try {
    window.sessionStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Defaults will be used for the current in-memory session.
  }
  dispatchChange(userId, next);
}

export function subscribeKhaavioAlertPreferences(userId, callback) {
  if (typeof window === "undefined") return () => {};
  const handler = (event) => {
    if (event.detail?.userId === userId) callback(event.detail.preferences);
  };
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
