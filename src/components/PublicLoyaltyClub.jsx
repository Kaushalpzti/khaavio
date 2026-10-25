import { useCallback, useEffect, useState } from "react";
import { Gift, LoaderCircle, RefreshCw, Sparkles, TicketCheck } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getOrCreateKhaavioLoyaltyToken } from "../lib/loyaltyToken";
import "./PublicLoyaltyClub.css";

function firstRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

function pluralStamp(count) {
  return count === 1 ? "stamp" : "stamps";
}

export default function PublicLoyaltyClub({ slug }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (quiet = false) => {
    if (!slug) return;
    const memberToken = getOrCreateKhaavioLoyaltyToken(slug);
    if (!memberToken) {
      setLoading(false);
      setError("Khaavio Perks needs browser storage to remember your stamps. You can still browse and order normally.");
      return;
    }

    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data, error: requestError } = await supabase.rpc(
        "ensure_public_loyalty_member",
        { p_slug: slug, p_member_token: memberToken },
      );
      if (requestError) throw requestError;
      setSummary(firstRow(data));
    } catch (requestError) {
      console.error("Could not load Khaavio Perks:", requestError);
      setError("Perks are temporarily unavailable. Your menu and cart are still ready to use.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  if (loading) return null;
  if (!summary?.is_enabled) {
    if (!error) return null;
    return <section className="public-perks public-perks-unavailable" role="status"><p className="public-perks-message is-error">{error}</p></section>;
  }

  const stampsRequired = Math.max(2, Math.min(20, Number(summary.stamps_required) || 6));
  const stampsBalance = Math.max(0, Number(summary.stamps_balance) || 0);
  const stampsToShow = Math.min(stampsRequired, stampsBalance);
  const rewards = Array.isArray(summary.available_rewards) ? summary.available_rewards : [];

  return (
    <section className="public-perks" aria-labelledby="public-perks-title">
      <div className="public-perks-card">
        <div className="public-perks-copy">
          <div className="public-perks-card-topline">
            <span className="public-perks-kicker"><Sparkles size={14} /> KHAAVIO LOYALTY CLUB</span>
            <button type="button" className="public-perks-inline-refresh" onClick={() => void refresh(true)} disabled={refreshing} aria-label="Refresh stamp progress">
              {refreshing ? <LoaderCircle size={14} className="public-perks-spin" /> : <RefreshCw size={14} />}
              <span>Refresh</span>
            </button>
          </div>
          <h2 id="public-perks-title">Khaavio Perks <span aria-hidden="true">✦</span></h2>
          <p>Every qualifying order brings you closer to a little something special.</p>
          <div className="public-perks-progress-line">
            <strong>{stampsBalance} {pluralStamp(stampsBalance)}</strong>
            <span>{stampsRequired} stamps unlock a reward</span>
          </div>
          <div className="public-perks-stamps" aria-label={`${stampsBalance} of ${stampsRequired} stamps earned`}>
            {Array.from({ length: stampsRequired }, (_, index) => (
              <span key={index} className={`public-perks-stamp${index < stampsToShow ? " is-earned" : ""}`}>
                {index < stampsToShow ? <Sparkles size={13} /> : <span>{index + 1}</span>}
              </span>
            ))}
          </div>
          <small className="public-perks-footnote">
            Stamps are added after an eligible order is completed and its table bill is marked paid. This card is saved in this browser.
          </small>
        </div>
        <div className="public-perks-decoration" aria-hidden="true">
          <span className="public-perks-sunburst">✳</span>
          <span className="public-perks-gift"><Gift size={36} strokeWidth={1.5} /></span>
          <span className="public-perks-orbit" />
        </div>
      </div>

      {rewards.length > 0 && (
        <div className="public-perks-rewards">
          <div className="public-perks-rewards-heading">
            <div>
              <span className="public-perks-kicker"><Gift size={13} /> REWARD UNLOCKED</span>
              <h3>Your reward is ready</h3>
            </div>
            <button type="button" className="public-perks-refresh" onClick={() => void refresh(true)} disabled={refreshing} aria-label="Refresh rewards">
              {refreshing ? <LoaderCircle size={16} className="public-perks-spin" /> : <RefreshCw size={16} />}
            </button>
          </div>
          <div className="public-perks-reward-grid">
            {rewards.map((reward) => (
              <article className="public-perks-reward-card" key={reward.id}>
                <div className="public-perks-revealed">
                  <span className="public-perks-reward-icon"><TicketCheck size={23} /></span>
                  <span className="public-perks-reward-eyebrow">YOUR PERK</span>
                  <strong>{reward.reward_name || "Loyalty reward"}</strong>
                  <span className="public-perks-redemption-label">Show this code to restaurant staff</span>
                  <code>{reward.redemption_code || "REWARD"}</code>
                  <small>One-time redemption. Staff must confirm the reward before handing it over.</small>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {error && <p className="public-perks-message is-error" role="alert">{error}</p>}
    </section>
  );
}
