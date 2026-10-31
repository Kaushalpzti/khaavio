import { useCallback, useEffect, useState } from "react";
import { Gift, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, TicketCheck } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getOrCreateKhaavioLoyaltyToken } from "../lib/loyaltyToken";
import "./PublicLoyaltyClub.css";

function firstRow(value) { return Array.isArray(value) ? value[0] || null : value; }
function pluralStamp(value) { return value === 1 ? "stamp" : "stamps"; }

export default function PublicLoyaltyClub({ slug }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (quiet = false) => {
    if (!slug) { setLoading(false); return; }
    const token = getOrCreateKhaavioLoyaltyToken(slug);
    if (!token) {
      setSummary(null);
      setError("This browser could not securely save a Perks card. Enable browser storage or ask restaurant staff for help.");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data, error: requestError } = await supabase.rpc("ensure_public_loyalty_member", {
        p_slug: slug, p_member_token: token,
      });
      if (requestError) throw requestError;
      setSummary(firstRow(data));
    } catch (requestError) {
      console.error("Could not load Khaavio Perks:", requestError);
      setError("Perks are temporarily unavailable. Please refresh or ask restaurant staff for help.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => { void refresh(false); }, [refresh]);

  if (loading && !summary) return <section className="public-perks public-perks-loading" aria-live="polite"><LoaderCircle size={20} className="public-perks-spin" /> Loading your Perks card…</section>;
  if (summary?.is_enabled === false) return <section className="public-perks public-perks-unavailable"><p className="public-perks-message">This restaurant has not enabled Khaavio Perks yet.</p></section>;

  const stampsRequired = Math.max(2, Math.min(20, Number(summary?.stamps_required) || 6));
  const stampsBalance = Math.max(0, Number(summary?.stamps_balance) || 0);
  const stampsToShow = Math.min(stampsRequired, stampsBalance);
  const rewards = Array.isArray(summary?.available_rewards) ? summary.available_rewards : [];

  return (
    <section className="public-perks" aria-labelledby="public-perks-title">
      <div className="public-perks-card">
        <div className="public-perks-copy">
          <div className="public-perks-card-topline">
            <span className="public-perks-kicker"><Sparkles size={14} /> KHAAVIO LOYALTY CLUB</span>
            <button type="button" className="public-perks-inline-refresh" onClick={() => void refresh(true)} disabled={refreshing} aria-label="Refresh stamp progress">
              {refreshing ? <LoaderCircle size={14} className="public-perks-spin" /> : <RefreshCw size={14} />}<span>Refresh</span>
            </button>
          </div>
          <h2 id="public-perks-title">Khaavio Perks <span aria-hidden="true">✦</span></h2>
          <p>Collect stamps on qualifying orders and claim a little reward when you reach your goal.</p>
          <div className="public-perks-progress-line"><strong>{stampsBalance} {pluralStamp(stampsBalance)}</strong><span>{stampsRequired} stamps unlock a reward</span></div>
          <div className="public-perks-stamps" aria-label={`${stampsBalance} of ${stampsRequired} stamps earned`}>
            {Array.from({ length: stampsRequired }, (_, index) => (
              <span key={index} className={`public-perks-stamp${index < stampsToShow ? " is-earned" : ""}`}>
                {index < stampsToShow ? <Sparkles size={13} /> : <span>{index + 1}</span>}
              </span>
            ))}
          </div>
          <small className="public-perks-footnote">Stamps are added only after an eligible order is completed and its table bill is paid. Place an order from this same browser to keep your Perks card together.</small>
        </div>
        <div className="public-perks-decoration" aria-hidden="true"><span className="public-perks-sunburst">✳</span><span className="public-perks-gift"><Gift size={36} strokeWidth={1.5} /></span><span className="public-perks-orbit" /></div>
      </div>
      {rewards.length > 0 && (
        <div className="public-perks-rewards">
          <div className="public-perks-rewards-heading">
            <div><span className="public-perks-kicker"><Gift size={13} /> REWARD UNLOCKED</span><h3>Your reward is ready</h3></div>
            <button type="button" className="public-perks-refresh" onClick={() => void refresh(true)} disabled={refreshing} aria-label="Refresh rewards">{refreshing ? <LoaderCircle size={16} className="public-perks-spin" /> : <RefreshCw size={16} />}</button>
          </div>
          <div className="public-perks-reward-grid">
            {rewards.map((reward) => (
              <article className="public-perks-reward-card" key={reward.id}>
                <div className="public-perks-revealed">
                  <span className="public-perks-reward-icon"><TicketCheck size={23} /></span>
                  <span className="public-perks-reward-eyebrow">YOUR PERK</span>
                  <strong>{reward.reward_name || "Loyalty reward"}</strong>
                  <span className="public-perks-redemption-label">Show this screen to restaurant staff</span>
                  <small>Staff will confirm the reward and mark it redeemed. Reward codes are kept private.</small>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {error && <p className="public-perks-message is-error" role="alert">{error}</p>}
      <p className="public-perks-privacy-note"><ShieldCheck size={13} /> Your Perks card is linked to a private random token stored in this browser. Phone numbers are not used to look up or recover a loyalty card.</p>
    </section>
  );
}
