import { useCallback, useEffect, useState } from "react";
import { Gift, LoaderCircle, RefreshCw, Sparkles, TicketCheck, Phone, ShieldCheck, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getOrCreateKhaavioLoyaltyToken } from "../lib/loyaltyToken";
import { normalizeKhaavioIndianMobile } from "../lib/loyaltyPhone";
import "./PublicLoyaltyClub.css";

function firstRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

function pluralStamp(count) {
  return count === 1 ? "stamp" : "stamps";
}

export default function PublicLoyaltyClub({ slug, phone = "", onPhoneChange = () => {} }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [phoneDraft, setPhoneDraft] = useState(phone || "");
  const [showPhoneForm, setShowPhoneForm] = useState(!phone);
  const [loyaltyConsent, setLoyaltyConsent] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [marketingDirty, setMarketingDirty] = useState(false);

  useEffect(() => {
    setPhoneDraft(phone || "");
    setShowPhoneForm(!phone);
  }, [phone]);

  const callPhoneRpc = useCallback(async ({ targetPhone, updateMarketing = false, marketing = false }) => {
    const memberToken = getOrCreateKhaavioLoyaltyToken(slug);
    const { data, error: requestError } = await supabase.rpc(
      "ensure_public_loyalty_member_by_phone",
      {
        p_slug: slug,
        p_phone: targetPhone,
        p_member_token: memberToken,
        p_loyalty_consent: true,
        p_marketing_opt_in: marketing,
        p_update_marketing_consent: updateMarketing,
      },
    );
    if (requestError) throw requestError;
    const result = firstRow(data);
    if (!result?.is_enabled) {
      setSummary(result || null);
      throw new Error("This restaurant has not enabled Khaavio Perks yet.");
    }
    setSummary(result);
    setMarketingOptIn(Boolean(result.marketing_opt_in));
    setMarketingDirty(false);
    return result;
  }, [slug]);

  const refresh = useCallback(async (quiet = false) => {
    if (!slug) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    setNotice("");
    try {
      if (phone) {
        await callPhoneRpc({ targetPhone: phone });
      } else {
        const { data, error: statusError } = await supabase.rpc(
          "get_public_loyalty_program_status",
          { p_slug: slug },
        );
        if (statusError) throw statusError;
        setSummary(firstRow(data));
      }
    } catch (requestError) {
      console.error("Could not load Khaavio Perks:", requestError);
      setError(requestError?.message || "Perks are temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug, phone, callPhoneRpc]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  async function joinOrFindCard(event) {
    event.preventDefault();
    if (saving) return;
    const normalized = normalizeKhaavioIndianMobile(phoneDraft);
    if (!normalized) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (!loyaltyConsent) {
      setError("Please agree to use your mobile number for loyalty membership and reward tracking.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await callPhoneRpc({
        targetPhone: normalized,
        updateMarketing: marketingOptIn,
        marketing: marketingOptIn,
      });
      onPhoneChange(normalized);
      setPhoneDraft(normalized);
      setShowPhoneForm(false);
      setLoyaltyConsent(false);
      setNotice("Your Perks card is ready. Use the same mobile number on future visits.");
      setSummary(result);
    } catch (requestError) {
      console.error("Could not find or join Khaavio Perks:", requestError);
      setError(requestError?.message || "Could not open your Perks card. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveMarketingPreference() {
    if (!phone || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await callPhoneRpc({
        targetPhone: phone,
        updateMarketing: true,
        marketing: marketingOptIn,
      });
      setSummary(result);
      setMarketingDirty(false);
      setNotice(marketingOptIn
        ? "Promotional updates are opted in for this restaurant."
        : "Promotional updates are turned off for this restaurant.");
    } catch (requestError) {
      console.error("Could not save marketing preference:", requestError);
      setError(requestError?.message || "Could not save this preference.");
    } finally {
      setSaving(false);
    }
  }

  function changeNumber() {
    onPhoneChange("");
    setSummary(null);
    setPhoneDraft("");
    setShowPhoneForm(true);
    setLoyaltyConsent(false);
    setMarketingOptIn(false);
    setMarketingDirty(false);
    setError("");
    setNotice("");
  }

  if (phone && loading && !summary) {
    return <section className="public-perks public-perks-loading" aria-live="polite"><LoaderCircle size={20} className="public-perks-spin" /> Loading your Perks card…</section>;
  }

  if (summary && summary.is_enabled === false) {
    return <section className="public-perks public-perks-unavailable"><p className="public-perks-message">This restaurant has not enabled Khaavio Perks yet.</p></section>;
  }

  const stampsRequired = Math.max(2, Math.min(20, Number(summary?.stamps_required) || 6));
  const stampsBalance = Math.max(0, Number(summary?.stamps_balance) || 0);
  const stampsToShow = Math.min(stampsRequired, stampsBalance);
  const rewards = Array.isArray(summary?.available_rewards) ? summary.available_rewards : [];

  return (
    <section className="public-perks" aria-labelledby="public-perks-title">
      <div className="public-perks-card public-perks-phone-card">
        <div className="public-perks-copy">
          <div className="public-perks-card-topline">
            <span className="public-perks-kicker"><Sparkles size={14} /> KHAAVIO LOYALTY CLUB</span>
            {phone && <button type="button" className="public-perks-inline-refresh" onClick={() => void refresh(true)} disabled={refreshing} aria-label="Refresh stamp progress">
              {refreshing ? <LoaderCircle size={14} className="public-perks-spin" /> : <RefreshCw size={14} />}<span>Refresh</span>
            </button>}
          </div>
          <h2 id="public-perks-title">Khaavio Perks <span aria-hidden="true">✦</span></h2>
          <p>Collect stamps on qualifying orders and claim a little reward when you reach your goal.</p>

          {showPhoneForm || !phone ? (
            <form className="public-perks-phone-form" onSubmit={joinOrFindCard}>
              <label className="public-perks-phone-field">
                <span><Phone size={14} /> Mobile number</span>
                <input type="tel" inputMode="tel" autoComplete="tel-national" value={phoneDraft} onChange={(event) => setPhoneDraft(event.target.value)} placeholder="10-digit mobile number" maxLength={16} aria-label="Mobile number for Khaavio Perks" required />
                <small>India mobile numbers only. No OTP is sent; staff will confirm rewards at redemption.</small>
              </label>
              <label className="public-perks-consent-row">
                <input type="checkbox" checked={loyaltyConsent} onChange={(event) => setLoyaltyConsent(event.target.checked)} />
                <span>I agree to use my mobile number for this restaurant's loyalty membership, stamp tracking and reward service.</span>
              </label>
              <label className="public-perks-consent-row is-marketing">
                <input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} />
                <span>I'd also like promotional offers from this restaurant. Optional; I can turn this off later.</span>
              </label>
              <button type="submit" className="public-perks-join-button" disabled={saving}>
                {saving ? <LoaderCircle size={16} className="public-perks-spin" /> : <CheckCircle2 size={16} />}
                {saving ? "Checking card…" : "Find my card / Join free"}
              </button>
            </form>
          ) : (
            <>
              <div className="public-perks-mobile-identity"><span className="public-perks-phone-icon"><Phone size={15} /></span><span><strong>{phone}</strong><small>Mobile number entered · not OTP-verified</small></span><button type="button" onClick={changeNumber}>Change</button></div>
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
              <small className="public-perks-footnote">Stamps are added only after an eligible order is completed and its table bill is paid. Enter the same mobile number next visit to find this card.</small>
              <div className="public-perks-marketing-preference">
                <label><input type="checkbox" checked={marketingOptIn} onChange={(event) => { setMarketingOptIn(event.target.checked); setMarketingDirty(true); }} /><span>Receive offers from this restaurant (optional)</span></label>
                {marketingDirty && <button type="button" onClick={() => void saveMarketingPreference()} disabled={saving}>{saving ? "Saving…" : "Save preference"}</button>}
              </div>
            </>
          )}
        </div>
        <div className="public-perks-decoration" aria-hidden="true"><span className="public-perks-sunburst">✳</span><span className="public-perks-gift"><Gift size={36} strokeWidth={1.5} /></span><span className="public-perks-orbit" /></div>
      </div>

      {phone && rewards.length > 0 && (
        <div className="public-perks-rewards">
          <div className="public-perks-rewards-heading"><div><span className="public-perks-kicker"><Gift size={13} /> REWARD UNLOCKED</span><h3>Your reward is ready</h3></div><button type="button" className="public-perks-refresh" onClick={() => void refresh(true)} disabled={refreshing} aria-label="Refresh rewards">{refreshing ? <LoaderCircle size={16} className="public-perks-spin" /> : <RefreshCw size={16} />}</button></div>
          <div className="public-perks-reward-grid">
            {rewards.map((reward) => <article className="public-perks-reward-card" key={reward.id}><div className="public-perks-revealed"><span className="public-perks-reward-icon"><TicketCheck size={23} /></span><span className="public-perks-reward-eyebrow">YOUR PERK</span><strong>{reward.reward_name || "Loyalty reward"}</strong><span className="public-perks-redemption-label">Show this screen and mobile number to restaurant staff</span><small>Staff will confirm the reward and mark it redeemed. Reward codes are kept private.</small></div></article>)}
          </div>
        </div>
      )}
      {error && <p className="public-perks-message is-error" role="alert">{error}</p>}
      {notice && <p className="public-perks-message is-success" role="status">{notice}</p>}
      <p className="public-perks-privacy-note"><ShieldCheck size={13} /> Your mobile number is used for this restaurant's loyalty service. Promotional offers are optional. This no-OTP mobile number is not independently verified.</p>
    </section>
  );
}
