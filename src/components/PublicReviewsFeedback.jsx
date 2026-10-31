import { useState } from "react";
import { ExternalLink, LoaderCircle, MessageCircle, Send, Star, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import " ./PublicReviewsFeedback.css".trim();

const FEEDBACK_CATEGORIES = [
  { value: "food", label: "Food" },
  { value: "service", label: "Service" },
  { value: "ambience", label: "Ambience" },
  { value: "other", label: "Other" },
];

export function isValidGoogleReviewUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    const hosts = new Set(["g.page", "search.google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl"]);
    return url.protocol === "https:" && hosts.has(url.hostname.toLowerCase());
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
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const showGoogleReview = allowGoogleReviewLink === true && isValidGoogleReviewUrl(googleReviewUrl);

  async function submitFeedback(event) {
    event.preventDefault();
    if (!restaurantSlug || submitting) return;
    if (!rating) {
      setError("Choose a rating from 1 to 5 stars.");
      return;
    }
    if (message.trim().length > 1000) {
      setError("Feedback must be 1,000 characters or fewer.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const { data, error: submitError } = await supabase.functions.invoke("khaavio-submit-feedback", {
        body: {
          restaurantSlug,
          rating,
          category,
          message: message.trim(),
          website,
        },
      });
      if (submitError) throw submitError;
      if (data?.ok !== true) throw new Error(data?.message || "We couldn't send your feedback right now. Please try again.");
      setSubmitted(true);
      setMessage("");
      setWebsite("");
    } catch (submitError) {
      console.error("Public feedback submission failed:", submitError);
      setError(submitError?.message || "We couldn't send your feedback right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="public-reviews" aria-labelledby="public-reviews-title">
      <div className="public-reviews-intro">
        <span className="public-reviews-eyebrow">A LITTLE NOTE FROM YOU</span>
        <h2 id="public-reviews-title">{allowPrivateFeedback ? "How was your experience?" : "Enjoyed your visit?"}</h2>
        <p>{allowPrivateFeedback
          ? `Your feedback helps ${restaurantName || "our team"} make every visit better.`
          : `Share an honest review of your visit to help other guests discover ${restaurantName || "this restaurant"}.`}</p>
      </div>

      <div className="public-reviews-actions">
        {showGoogleReview && (
          <a
            className="public-reviews-google"
            href={googleReviewUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-label={`Write an honest Google review for ${restaurantName || "this restaurant"}`}
          >
            <span className="public-reviews-google-mark" aria-hidden="true">G</span>
            <span>Write an honest Google review</span>
            <ExternalLink size={16} aria-hidden="true" />
          </a>
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
                  setError("");
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

              <label className="public-reviews-honeypot" aria-hidden="true">
                Website
                <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
              </label>

              {error && <p className="public-reviews-error" role="alert">{error}</p>}
              <button type="submit" className="public-reviews-submit" disabled={submitting || !rating}>
                {submitting ? <LoaderCircle size={16} className="public-menu-spinner" /> : <Send size={16} />}
                {submitting ? "Sending…" : "Send private feedback"}
              </button>
              <p className="public-reviews-privacy-note">This is private feedback for the restaurant team, not a public Google review. No reward is offered for a review.</p>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
