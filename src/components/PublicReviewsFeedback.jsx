import { useState } from "react";
import { ExternalLink, LoaderCircle, MessageCircle, Send, Sparkles, Star, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import PublicRestaurantSocialLinks from "./PublicRestaurantSocialLinks";
import "./PublicReviewsFeedback.css";

const FEEDBACK_CATEGORIES = [
  { value: "food", label: "Food" },
  { value: "service", label: "Service" },
  { value: "ambience", label: "Ambience" },
  { value: "other", label: "Other" },
];

const GOOGLE_REVIEW_HOSTS = new Set([
  "g.page",
  "search.google.com",
  "www.google.com",
  "maps.google.com",
  "maps.app.goo.gl",
]);

export function isValidGoogleReviewUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && GOOGLE_REVIEW_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export default function PublicReviewsFeedback({
  restaurantSlug,
  restaurantName,
  googleReviewUrl,
  socialLinks = {},
  allowGoogleReviewLink = true,
  allowPrivateFeedback = true,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState("food");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewDraft, setReviewDraft] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("");

  const showGoogleReview = allowGoogleReviewLink === true && isValidGoogleReviewUrl(googleReviewUrl);

  async function submitFeedback(event) {
    event.preventDefault();
    if (!restaurantSlug || submitting) return;

    const trimmedMessage = message.trim();
    if (trimmedMessage.length > 1000) {
      setError("Feedback must be 1,000 characters or fewer.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const { error: submitError } = await supabase.rpc(
        "submit_restaurant_feedback",
        {
          p_restaurant_slug: restaurantSlug,
          p_rating: rating,
          p_category: category,
          p_message: trimmedMessage || null,
        },
      );
      if (submitError) throw submitError;
      setSubmitted(true);
      setMessage("");
    } catch (submitError) {
      console.error("Public feedback submission failed:", submitError);
      setError(
        submitError?.message ||
          "We couldn't send your feedback right now. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function generateReviewDraft() {
    if (!restaurantSlug || !reviewRating || reviewBusy) return;
    setReviewBusy(true);
    setError("");
    setReviewStatus("");
    try {
      const { data, error: aiError } = await supabase.functions.invoke("khaavio-ai-chat", {
        body: {
          mode: "review_draft",
          restaurantSlug,
          restaurantName: restaurantName || "the restaurant",
          rating: reviewRating,
          notes: reviewNotes.trim(),
        },
      });
      if (aiError) throw aiError;
      if (!data?.draft || typeof data.draft !== "string") {
        throw new Error(data?.message || "Could not create a draft. Please write your review yourself.");
      }
      setReviewDraft(data.draft.slice(0, 1200));
      setReviewStatus("Draft ready. Please check and edit it so it reflects your own experience.");
    } catch (draftError) {
      console.error("Google review draft failed:", draftError);
      setError(draftError?.message || "Could not create a draft. You can still write your own review.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function copyReviewDraft() {
    const draft = reviewDraft.trim();
    if (!draft) {
      setReviewStatus("Create an AI draft first, or write your own review in the draft box.");
      return;
    }
    try {
      await navigator.clipboard.writeText(draft);
      setReviewStatus(`Review text copied. Google will not prefill it automatically—paste it there and select your ${reviewRating || "own"}-star rating again.`);
    } catch {
      setReviewStatus("Copy was blocked by the browser. Press and hold the draft text to copy it, then paste it into Google and select your stars there.");
    }
  }

  async function continueToGoogle() {
    if (!isValidGoogleReviewUrl(googleReviewUrl)) return;
    // Open synchronously from the user's click so popup blockers don't eat the link.
    const googleWindow = window.open(googleReviewUrl, "_blank");
    if (googleWindow) googleWindow.opener = null;
    const draft = reviewDraft.trim();
    if (draft) {
      try {
        await navigator.clipboard.writeText(draft);
        setReviewStatus(googleWindow
          ? `Draft copied. In Google, paste it into the review box and select your ${reviewRating || "own"}-star rating again.`
          : `Draft copied, but the browser blocked the new tab. Open Google using the link below, paste the draft and select your ${reviewRating || "own"}-star rating.`);
      } catch {
        setReviewStatus(googleWindow
          ? "Google is open. Copy the draft below, paste it into the review box and select your stars there."
          : "The browser blocked the new tab. Open Google using the link below, then copy your draft and select your stars there.");
      }
    } else {
      setReviewStatus(googleWindow
        ? "Google is open. Write your honest review and choose your star rating there."
        : "The browser blocked the new tab. Open Google using the link below to write your review and choose your stars.");
    }
  }

  return (
    <section className="public-reviews" aria-labelledby="public-reviews-title">
      <div className="public-reviews-intro">
        <span className="public-reviews-eyebrow">A LITTLE NOTE FROM YOU</span>
        <h2 id="public-reviews-title">{allowPrivateFeedback ? "How was your experience?" : "Enjoyed your visit?"}</h2>
        <p>{allowPrivateFeedback
          ? `Your feedback helps ${restaurantName || "our team"} make every visit better.`
          : `Leave an honest Google review to help other guests discover ${restaurantName || "this restaurant"}.`}</p>
      </div>

      <div className="public-reviews-actions">
        {showGoogleReview && (
          <button
            type="button"
            className="public-reviews-google"
            onClick={() => { setReviewOpen((open) => !open); setReviewStatus(""); setError(""); }}
            aria-expanded={reviewOpen}
            aria-label={`Write an honest Google review for ${restaurantName || "this restaurant"}`}
          >
            <span className="public-reviews-google-mark" aria-hidden="true">G</span>
            <span>Write a Google review</span>
            <ExternalLink size={16} aria-hidden="true" />
          </button>
        )}
        {allowPrivateFeedback && (
          <button
            type="button"
            className="public-reviews-private"
            onClick={() => {
              setIsOpen((value) => !value);
              setError("");
            }}
            aria-expanded={isOpen}
          >
            {isOpen ? <X size={17} /> : <MessageCircle size={17} />}
            {isOpen ? "Close feedback" : "Share private feedback"}
          </button>
        )}
      </div>

      {showGoogleReview && reviewOpen && (
        <div className="public-reviews-form-wrap" aria-label="Google review draft">
          <div className="public-review-draft-form">
            <div className="public-reviews-rating">
              <span className="public-reviews-field-label">Your honest rating</span>
              <div className="public-reviews-stars" role="group" aria-label="Choose a rating from 1 to 5 stars">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button key={value} type="button" className={`public-reviews-star${value <= reviewRating ? " is-active" : ""}`} onClick={() => setReviewRating(value)} aria-label={`${value} stars`} aria-pressed={reviewRating === value}>
                    <Star size={25} fill={value <= reviewRating ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
              {reviewRating > 0 && (
                <p className="public-reviews-rating-note">
                  Your {reviewRating}-star choice guides this draft. You’ll choose your stars again on Google.
                </p>
              )}
            </div>
            <label className="public-reviews-field">
              <span className="public-reviews-field-label">What would you like your review to mention? <span>(optional)</span></span>
              <textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value.slice(0, 500))} placeholder="Only share details from your own visit" maxLength={500} rows={3} />
            </label>
            <button type="button" className="public-reviews-submit" onClick={() => void generateReviewDraft()} disabled={!reviewRating || reviewBusy}>
              {reviewBusy ? <LoaderCircle size={16} className="public-menu-spinner" /> : <Sparkles size={16} />}
              {reviewBusy ? "Preparing draft…" : reviewDraft ? "Refresh AI draft" : "Create an AI draft"}
            </button>
            {reviewDraft && (
              <label className="public-reviews-field public-review-draft-field">
                <span className="public-reviews-field-label">Your draft — edit it in your own words</span>
                <textarea value={reviewDraft} onChange={(event) => setReviewDraft(event.target.value.slice(0, 1200))} rows={5} maxLength={1200} />
              </label>
            )}
            {error && reviewOpen && <p className="public-reviews-error" role="alert">{error}</p>}
            {reviewStatus && <p className="public-reviews-status" role="status">{reviewStatus}</p>}
            <div className="public-reviews-next-actions">
              {reviewDraft && (
                <button type="button" className="public-reviews-copy" onClick={() => void copyReviewDraft()}>
                  Copy review text
                </button>
              )}
              <button type="button" className="public-reviews-google" onClick={() => void continueToGoogle()}>
                <span>{reviewDraft ? "Copy draft & continue to Google" : "Continue to Google"}</span>
                <ExternalLink size={16} />
              </button>
            </div>
            <a className="public-reviews-text-button" href={googleReviewUrl} target="_blank" rel="noopener noreferrer nofollow">Open the Google review page</a>
            <p className="public-reviews-privacy-note">The draft is only a suggestion and stays in this browser. Google opens separately; please review, edit and submit it yourself. No reward is offered for a review.</p>
          </div>
        </div>
      )}

      {allowPrivateFeedback && isOpen && (
        <div className="public-reviews-form-wrap">
          {submitted ? (
            <div className="public-reviews-success" role="status">
              <span className="public-reviews-success-icon" aria-hidden="true">♥</span>
              <h3>Thanks for sharing!</h3>
              <p>Your private feedback has been sent to the restaurant team.</p>
              <button
                type="button"
                className="public-reviews-text-button"
                onClick={() => {
                  setSubmitted(false);
                  setRating(0);
                  setCategory("food");
                }}
              >
                Send another note
              </button>
            </div>
          ) : (
            <form className="public-reviews-form" onSubmit={submitFeedback}>
              <div className="public-reviews-rating">
                <span className="public-reviews-field-label">Your overall experience</span>
                <div className="public-reviews-stars" role="group" aria-label="Choose a rating from 1 to 5 stars">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`public-reviews-star${value <= rating ? " is-active" : ""}`}
                      onClick={() => setRating(value)}
                      aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                      aria-pressed={rating === value}
                    >
                      <Star size={25} fill={value <= rating ? "currentColor" : "none"} />
                    </button>
                  ))}
                </div>
                <span className="public-reviews-rating-caption">
                  {rating === 0 ? "Choose a rating" : rating === 5 ? "Loved it" : rating === 4 ? "Really good" : rating === 3 ? "It was okay" : rating === 2 ? "Could be better" : "Needs improvement"}
                </span>
              </div>

              <label className="public-reviews-field">
                <span className="public-reviews-field-label">What is this about?</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {FEEDBACK_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="public-reviews-field">
                <span className="public-reviews-field-label">Anything you'd like us to know? <span>(optional)</span></span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value.slice(0, 1000))}
                  placeholder="Tell us what went well or what we could do better…"
                  rows={4}
                  maxLength={1000}
                />
                <span className="public-reviews-character-count">{message.length}/1000</span>
              </label>

              {error && <p className="public-reviews-error" role="alert">{error}</p>}
              <button type="submit" className="public-reviews-submit" disabled={submitting || rating === 0}>
                <Send size={16} />
                {submitting ? "Sending…" : "Send private feedback"}
              </button>
              <p className="public-reviews-privacy-note">This note goes privately to the restaurant, not to Google. Please don’t include payment details or sensitive information.</p>
            </form>
          )}
        </div>
      )}

      <PublicRestaurantSocialLinks restaurantName={restaurantName} socialLinks={socialLinks} />
    </section>
  );
}
