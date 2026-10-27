export const DEFAULT_PUBLIC_FEATURES = Object.freeze({
  loyalty_rewards: false,
  private_feedback: false,
  google_review_link: false,
  ai_menu_assistant: false,
  voice_alerts_advanced: false,
});

/** Normalize the intentionally limited JSON returned by the public SQL RPC. */
export function normalizePublicFeatureFlags(value) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { ...DEFAULT_PUBLIC_FEATURES };
  }
  return Object.fromEntries(
    Object.keys(DEFAULT_PUBLIC_FEATURES).map((key) => [key, row[key] === true]),
  );
}

export function shouldShowPublicReviewsTab(
  features,
  hasValidGoogleReviewUrl,
  hasConfiguredSocialLinks = false,
) {
  return hasConfiguredSocialLinks === true ||
    features?.private_feedback === true ||
    (features?.google_review_link === true && hasValidGoogleReviewUrl === true);
}
