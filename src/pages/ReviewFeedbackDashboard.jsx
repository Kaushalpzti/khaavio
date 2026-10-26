import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, Clock3, LoaderCircle, MessageSquareText, RefreshCw, Star, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { usePlanAccess } from "../context/PlanAccessContext";
import PlanUpgradeNotice from "../components/PlanUpgradeNotice";
import { cancelKhaavioVoice, isKhaavioVoiceSupported, queueKhaavioVoice } from "../lib/khaavioVoiceAlerts";
import "./ReviewFeedbackDashboard.css";

const FILTERS = [
  { value: "all", label: "All feedback" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "resolved", label: "Resolved" },
];

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  } catch {
    return "Recently";
  }
}

export default function ReviewFeedbackDashboard() {
  const { hasFeature } = usePlanAccess();
  const canManagePrivateFeedback = hasFeature("private_feedback");
  const voiceEnabledRef = useRef(false);
  const knownFeedbackIdsRef = useRef(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [restaurant, setRestaurant] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadFeedback = useCallback(async ({ quiet = false } = {}) => {
    if (!canManagePrivateFeedback) {
      setRestaurant(null);
      setFeedback([]);
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Please sign in to view restaurant feedback.");

      const { data: restaurantData, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id, name, google_review_url")
        .eq("owner_id", authData.user.id)
        .limit(1)
        .maybeSingle();
      if (restaurantError) throw restaurantError;
      if (!restaurantData) throw new Error("No restaurant profile was found.");
      setRestaurant(restaurantData);

      const { data, error: feedbackError } = await supabase
        .from("restaurant_feedback")
        .select("id, restaurant_id, rating, category, message, status, created_at, updated_at")
        .eq("restaurant_id", restaurantData.id)
        .order("created_at", { ascending: false })
        .limit(250);
      if (feedbackError) throw feedbackError;

      const nextFeedback = data || [];
      const currentFeedbackIds = new Set(nextFeedback.map((item) => item.id));
      const previousFeedbackIds = knownFeedbackIdsRef.current;
      const newlyAddedFeedback = previousFeedbackIds
        ? nextFeedback.filter((item) => !previousFeedbackIds.has(item.id) && item.status === "new")
        : [];

      // Announce only new submissions, never status edits. Feedback text is kept private
      // and is deliberately not spoken aloud.
      if (voiceEnabledRef.current && newlyAddedFeedback.length === 1) {
        const rating = Math.max(0, Math.min(5, Number(newlyAddedFeedback[0].rating) || 0));
        queueKhaavioVoice((isHindi) => isHindi
          ? `नई ग्राहक प्रतिक्रिया मिली है। पाँच में से ${rating} स्टार की रेटिंग है।`
          : `New customer feedback received. The rating is ${rating} out of five stars.`);
      } else if (voiceEnabledRef.current && newlyAddedFeedback.length > 1) {
        const count = newlyAddedFeedback.length;
        queueKhaavioVoice((isHindi) => isHindi
          ? `${count} नई ग्राहक प्रतिक्रियाएँ मिली हैं।`
          : `You have ${count} new customer feedback submissions.`);
      }

      knownFeedbackIdsRef.current = currentFeedbackIds;
      setFeedback(nextFeedback);
    } catch (loadError) {
      console.error("Could not load customer feedback:", loadError);
      setError(loadError?.message || "We couldn't load feedback right now.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [canManagePrivateFeedback]);

  useEffect(() => () => {
    voiceEnabledRef.current = false;
    cancelKhaavioVoice();
  }, []);

  useEffect(() => {
    if (canManagePrivateFeedback) return;
    voiceEnabledRef.current = false;
    setVoiceEnabled(false);
    cancelKhaavioVoice();
  }, [canManagePrivateFeedback]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  useEffect(() => {
    if (!canManagePrivateFeedback || !restaurant?.id) return undefined;
    const channel = supabase
      .channel(`restaurant-feedback-${restaurant.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_feedback",
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        () => loadFeedback({ quiet: true }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [canManagePrivateFeedback, restaurant?.id, loadFeedback]);

  const visibleFeedback = useMemo(
    () => filter === "all" ? feedback : feedback.filter((item) => item.status === filter),
    [feedback, filter],
  );
  const newCount = feedback.filter((item) => item.status === "new").length;
  const averageRating = feedback.length
    ? (feedback.reduce((sum, item) => sum + Number(item.rating || 0), 0) / feedback.length).toFixed(1)
    : "—";

  function toggleVoiceAnnouncements() {
    if (voiceEnabledRef.current) {
      voiceEnabledRef.current = false;
      setVoiceEnabled(false);
      cancelKhaavioVoice();
      setNotice("Feedback voice announcements are off.");
      return;
    }

    if (!isKhaavioVoiceSupported()) {
      setError("This browser does not support voice announcements. Try a current version of Chrome or Edge.");
      return;
    }

    cancelKhaavioVoice();
    const queued = queueKhaavioVoice((isHindi) => isHindi
      ? "ग्राहक प्रतिक्रिया अलर्ट चालू हैं। नई प्रतिक्रिया आने पर सूचना दी जाएगी।"
      : "Customer feedback voice alerts are enabled. New feedback will be announced.");
    if (!queued) {
      setError("Voice announcements could not be started in this browser.");
      return;
    }

    voiceEnabledRef.current = true;
    setVoiceEnabled(true);
    setError("");
    setNotice("Feedback voice announcements are on.");
  }

  async function updateStatus(item, status) {
    if (!restaurant || updatingId) return;
    setUpdatingId(item.id);
    setError("");
    setNotice("");
    try {
      const { data, error: updateError } = await supabase
        .from("restaurant_feedback")
        .update({ status })
        .eq("id", item.id)
        .eq("restaurant_id", restaurant.id)
        .select("id, status, updated_at")
        .single();
      if (updateError) throw updateError;
      setFeedback((items) => items.map((entry) => entry.id === item.id ? { ...entry, ...data } : entry));
      setNotice(status === "resolved" ? "Feedback marked as resolved." : "Feedback marked as reviewed.");
    } catch (updateError) {
      console.error("Could not update feedback status:", updateError);
      setError(updateError?.message || "Couldn't update this feedback. Please try again.");
    } finally {
      setUpdatingId("");
    }
  }

  if (!canManagePrivateFeedback) {
    return (
      <main className="review-feedback-page">
        <PlanUpgradeNotice
          title="Unlock private guest feedback"
          description="The private feedback inbox, rating summaries and staff follow-up tools are included with Growth. Your existing feedback records remain preserved."
        />
      </main>
    );
  }

  return (
    <main className="review-feedback-page">
      <header className="review-feedback-heading">
        <span className="review-feedback-eyebrow">CUSTOMER EXPERIENCE</span>
        <div className="review-feedback-heading-row">
          <div>
            <h1>Reviews & feedback</h1>
            <p>Private notes from your customers, all in one place.</p>
          </div>
          <div className="review-feedback-heading-actions">
            <button
              type="button"
              className={`review-feedback-voice${voiceEnabled ? " is-active" : ""}`}
              onClick={toggleVoiceAnnouncements}
              aria-pressed={voiceEnabled}
              title={voiceEnabled ? "Disable new feedback voice announcements" : "Enable new feedback voice announcements"}
            >
              {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {voiceEnabled ? "Voice on" : "Enable voice"}
            </button>
            <button type="button" className="review-feedback-refresh" onClick={() => loadFeedback()} disabled={loading}>
              {loading ? <LoaderCircle size={17} className="review-feedback-spin" /> : <RefreshCw size={17} />}
              Refresh
            </button>
          </div>
        </div>
      </header>

      {error && <div className="review-feedback-alert is-error" role="alert">{error}</div>}
      {notice && <div className="review-feedback-alert is-success" role="status">{notice}</div>}

      <section className="review-feedback-stats" aria-label="Feedback summary">
        <article className="review-feedback-stat"><span>Feedback loaded</span><strong>{loading ? "—" : feedback.length}</strong><MessageSquareText size={19} /></article>
        <article className="review-feedback-stat"><span>Needs attention</span><strong>{loading ? "—" : newCount}</strong><Clock3 size={19} /></article>
        <article className="review-feedback-stat"><span>Average rating</span><strong>{loading ? "—" : averageRating}{!loading && averageRating !== "—" && <small>/5</small>}</strong><Star size={19} /></article>
      </section>

      <section className="review-feedback-toolrow">
        <div>
          <h2>Customer notes</h2>
          <p>These are private feedback messages—not public Google reviews.</p>
        </div>
        <label className="review-feedback-filter">
          <span className="review-feedback-sr-only">Filter feedback</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            {FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </section>

      {loading ? (
        <div className="review-feedback-state"><LoaderCircle className="review-feedback-spin" size={30} /><p>Loading customer feedback…</p></div>
      ) : visibleFeedback.length === 0 ? (
        <div className="review-feedback-state review-feedback-empty"><span><MessageSquareText size={25} /></span><h3>No feedback here yet</h3><p>New private feedback from your public menu will show up here.</p></div>
      ) : (
        <div className="review-feedback-list">
          {visibleFeedback.map((item) => (
            <article className="review-feedback-card" key={item.id}>
              <div className="review-feedback-card-top">
                <div className="review-feedback-rating" aria-label={`${item.rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((star) => <Star key={star} size={15} fill={star <= item.rating ? "currentColor" : "none"} className={star <= item.rating ? "is-filled" : ""} />)}
                  <strong>{item.rating}/5</strong>
                </div>
                <span className={`review-feedback-status status-${item.status}`}>{item.status}</span>
              </div>
              <div className="review-feedback-card-meta"><span>{item.category}</span><span>·</span><time dateTime={item.created_at}>{formatDate(item.created_at)}</time></div>
              {item.message ? <p className="review-feedback-message">{item.message}</p> : <p className="review-feedback-no-message">Customer left a rating without a written note.</p>}
              <div className="review-feedback-card-actions">
                {item.status === "new" && <button type="button" onClick={() => updateStatus(item, "reviewed")} disabled={Boolean(updatingId)}>{updatingId === item.id ? <LoaderCircle size={15} className="review-feedback-spin" /> : <CheckCheck size={15} />} Mark reviewed</button>}
                {item.status !== "resolved" && <button type="button" className="is-primary" onClick={() => updateStatus(item, "resolved")} disabled={Boolean(updatingId)}>{updatingId === item.id ? <LoaderCircle size={15} className="review-feedback-spin" /> : <ThumbsUp size={15} />} Resolve</button>}
                {item.status === "resolved" && <span className="review-feedback-resolved"><CheckCheck size={15} /> Resolved</span>}
              </div>
            </article>
          ))}
        </div>
      )}

      {restaurant && !restaurant.google_review_url && (
        <aside className="review-feedback-setup-note">
          <strong>Add your Google review link</strong>
          <p>Save your Google Business Profile review link in Restaurant settings. It will appear on your public menu for every customer.</p>
        </aside>
      )}
    </main>
  );
}
