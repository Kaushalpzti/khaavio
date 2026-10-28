import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BadgePercent,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Tag,
  TrendingUp,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "./MarketingStudio.css";

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(Number(value) || 0);

function localDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function dateLabel(value) {
  if (!value) return "No expiry";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Date unavailable";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusLabel(status) {
  return String(status || "").replaceAll("_", " ").replace(/^\w/, (s) => s.toUpperCase());
}

export default function MarketingStudio() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("offers");
  const [restaurant, setRestaurant] = useState(null);
  const [offers, setOffers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [offerForm, setOfferForm] = useState({
    name: "", coupon_code: "", description: "", discount_type: "percentage",
    discount_value: "10", minimum_order_amount: "0", maximum_discount_amount: "",
    starts_at: localDateTime(), ends_at: "", max_redemptions: "", per_customer_limit: "1",
    publish_now: true,
  });
  const [campaignForm, setCampaignForm] = useState({
    name: "", offer_id: "", message_text: "",
  });

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) {
        navigate("/login", { replace: true });
        return;
      }
      const { data: restaurantData, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id, name, slug")
        .eq("owner_id", authData.user.id)
        .maybeSingle();
      if (restaurantError) throw restaurantError;
      if (!restaurantData) throw new Error("No restaurant workspace was found. Complete onboarding first.");

      const [offersResult, campaignsResult, redemptionResult] = await Promise.all([
        supabase.from("offers").select("*").eq("restaurant_id", restaurantData.id).order("created_at", { ascending: false }),
        supabase.from("marketing_campaigns").select("*").eq("restaurant_id", restaurantData.id).order("created_at", { ascending: false }),
        supabase.from("offer_redemptions").select("id, offer_id, order_id, discount_amount, total_amount, redeemed_at").eq("restaurant_id", restaurantData.id),
      ]);
      if (offersResult.error) throw offersResult.error;
      if (campaignsResult.error) throw campaignsResult.error;
      if (redemptionResult.error) throw redemptionResult.error;
      setRestaurant(restaurantData);
      setOffers(offersResult.data || []);
      setCampaigns(campaignsResult.data || []);
      setRedemptions(redemptionResult.data || []);
    } catch (loadError) {
      setError(loadError?.message || "Could not load Offers & Campaigns.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const offerStats = useMemo(() => {
    const result = new Map();
    for (const row of redemptions) {
      const current = result.get(row.offer_id) || { count: 0, discount: 0, sales: 0 };
      current.count += 1;
      current.discount += Number(row.discount_amount) || 0;
      current.sales += Number(row.total_amount) || 0;
      result.set(row.offer_id, current);
    }
    return result;
  }, [redemptions]);

  const activeOffers = offers.filter((offer) => offer.status === "active");
  const activeCampaignCount = campaigns.filter((campaign) => campaign.status === "active").length;

  function setOfferField(field, value) {
    setOfferForm((current) => ({ ...current, [field]: value }));
  }

  function setCampaignField(field, value) {
    setCampaignForm((current) => ({ ...current, [field]: value }));
  }

  async function createOffer(event) {
    event.preventDefault();
    if (!restaurant || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const code = offerForm.coupon_code.trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(code)) {
        throw new Error("Coupon code must be 3–24 characters using letters, numbers, hyphens or underscores.");
      }
      const { error: insertError } = await supabase.from("offers").insert({
        restaurant_id: restaurant.id,
        name: offerForm.name.trim(),
        description: offerForm.description.trim() || null,
        coupon_code: code,
        discount_type: offerForm.discount_type,
        discount_value: Number(offerForm.discount_value),
        minimum_order_amount: Number(offerForm.minimum_order_amount || 0),
        maximum_discount_amount: offerForm.maximum_discount_amount === "" ? null : Number(offerForm.maximum_discount_amount),
        starts_at: new Date(offerForm.starts_at).toISOString(),
        ends_at: offerForm.ends_at ? new Date(offerForm.ends_at).toISOString() : null,
        max_redemptions: offerForm.max_redemptions === "" ? null : Number(offerForm.max_redemptions),
        per_customer_limit: Number(offerForm.per_customer_limit || 1),
        status: offerForm.publish_now ? "active" : "draft",
      });
      if (insertError) throw insertError;
      setOfferForm({
        name: "", coupon_code: "", description: "", discount_type: "percentage",
        discount_value: "10", minimum_order_amount: "0", maximum_discount_amount: "",
        starts_at: localDateTime(), ends_at: "", max_redemptions: "", per_customer_limit: "1",
        publish_now: true,
      });
      setShowOfferForm(false);
      setNotice("Offer saved. Final coupon rules are enforced by Supabase during checkout.");
      setRefreshing(true);
      setRefreshKey((n) => n + 1);
    } catch (saveError) {
      setError(saveError?.message || "Could not save this offer.");
    } finally {
      setSaving(false);
    }
  }

  async function createCampaign(event) {
    event.preventDefault();
    if (!restaurant || saving) return;
    const linkedOffer = offers.find((offer) => offer.id === campaignForm.offer_id);
    if (!linkedOffer || linkedOffer.status !== "active") {
      setError("Choose an active offer before creating a campaign.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { error: insertError } = await supabase.from("marketing_campaigns").insert({
        restaurant_id: restaurant.id,
        offer_id: linkedOffer.id,
        name: campaignForm.name.trim(),
        message_text: campaignForm.message_text.trim(),
        status: "draft",
      });
      if (insertError) throw insertError;
      setCampaignForm({ name: "", offer_id: linkedOffer.id, message_text: "" });
      setShowCampaignForm(false);
      setNotice("Campaign draft saved. Share the copy yourself; WhatsApp automation is on hold.");
      setTab("campaigns");
      setRefreshKey((n) => n + 1);
    } catch (saveError) {
      setError(saveError?.message || "Could not save this campaign.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(table, row, status) {
    if (!restaurant || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { error: updateError } = await supabase.from(table)
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("restaurant_id", restaurant.id);
      if (updateError) throw updateError;
      setNotice(`${table === "offers" ? "Offer" : "Campaign"} status changed to ${statusLabel(status).toLowerCase()}.`);
      setRefreshKey((n) => n + 1);
    } catch (updateError) {
      setError(updateError?.message || "Could not update status.");
    } finally {
      setSaving(false);
    }
  }

  function offerLink(offer) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://khaavio.in";
    return `${origin}/menu/${encodeURIComponent(restaurant?.slug || "")}?coupon=${encodeURIComponent(offer.coupon_code)}`;
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} copied to clipboard.`);
      setError("");
    } catch {
      setNotice(`Copy is blocked by this browser. Select and copy this text manually: ${text}`);
    }
  }

  function campaignMessage(campaign) {
    const offer = offers.find((row) => row.id === campaign.offer_id);
    const code = offer?.coupon_code || "YOUR CODE";
    const link = offer ? offerLink(offer) : `${window.location.origin}/menu/${restaurant?.slug || ""}`;
    return `${campaign.message_text}\n\nUse code ${code}.\nBrowse the menu: ${link}\nTo place a QR order, scan the restaurant's table QR.`;
  }

  if (loading) {
    return <main className="marketing-page"><div className="marketing-loading"><LoaderCircle className="marketing-spin" size={28} /><p>Preparing your marketing workspace…</p></div></main>;
  }

  return (
    <main className="marketing-page">
      <div className="marketing-shell">
        <header className="marketing-topbar">
          <Link to="/dashboard" className="marketing-back">← Dashboard</Link>
          <button className="marketing-ghost-button" type="button" onClick={() => { setRefreshing(true); setRefreshKey((n) => n + 1); }} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? "marketing-spin" : ""} /> Refresh
          </button>
        </header>

        <section className="marketing-hero">
          <div className="marketing-hero-copy">
            <span className="marketing-eyebrow"><Sparkles size={14} /> GROW YOUR RESTAURANT</span>
            <h1>Offers &amp; Campaigns</h1>
            <p>Create coupon offers, prepare promotional campaigns and track real redemptions—all inside Khaavio.</p>
            <div className="marketing-hero-note"><Check size={15} /> No new marketing subscription required</div>
          </div>
          <div className="marketing-hero-mark"><Megaphone size={38} /><span>Marketing Studio</span></div>
        </section>

        {error && <div className="marketing-alert is-error" role="alert"><X size={17} /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
        {notice && <div className="marketing-alert is-success" role="status"><Check size={17} /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}

        <section className="marketing-metrics" aria-label="Marketing overview">
          <article className="marketing-metric"><span className="marketing-metric-icon"><Tag size={18} /></span><div><span>Total offers</span><strong>{offers.length}</strong><small>{activeOffers.length} active now</small></div></article>
          <article className="marketing-metric"><span className="marketing-metric-icon"><Megaphone size={18} /></span><div><span>Campaign drafts &amp; runs</span><strong>{campaigns.length}</strong><small>{activeCampaignCount} active campaigns</small></div></article>
          <article className="marketing-metric"><span className="marketing-metric-icon"><TrendingUp size={18} /></span><div><span>Coupon redemptions</span><strong>{redemptions.length}</strong><small>{money(redemptions.reduce((sum, row) => sum + (Number(row.discount_amount) || 0), 0))} saved by guests</small></div></article>
        </section>

        <div className="marketing-section-heading">
          <div><span className="marketing-eyebrow">YOUR WORKSPACE</span><h2>Manage promotions</h2></div>
          <div className="marketing-heading-actions">
            <button type="button" className="marketing-primary-button" onClick={() => { setError(""); setShowOfferForm(true); }}><Plus size={17} /> Create offer</button>
            <button type="button" className="marketing-secondary-button" onClick={() => { setError(""); setShowCampaignForm(true); }} disabled={!activeOffers.length}><Megaphone size={17} /> New campaign</button>
          </div>
        </div>

        <div className="marketing-tabs" role="tablist" aria-label="Marketing sections">
          <button type="button" role="tab" aria-selected={tab === "offers"} className={tab === "offers" ? "is-active" : ""} onClick={() => setTab("offers")}><BadgePercent size={16} /> Offers <span>{offers.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === "campaigns"} className={tab === "campaigns" ? "is-active" : ""} onClick={() => setTab("campaigns")}><Megaphone size={16} /> Campaigns <span>{campaigns.length}</span></button>
        </div>

        {tab === "offers" ? (
          <section className="marketing-card-grid" aria-label="Coupon offers">
            {offers.map((offer) => {
              const stats = offerStats.get(offer.id) || { count: 0, discount: 0, sales: 0 };
              const value = offer.discount_type === "percentage" ? `${Number(offer.discount_value)}% OFF` : `${money(offer.discount_value)} OFF`;
              return <article className="marketing-offer-card" key={offer.id}>
                <div className="marketing-card-top"><span className={`marketing-status status-${offer.status}`}>{statusLabel(offer.status)}</span><span className="marketing-offer-icon"><BadgePercent size={22} /></span></div>
                <div className="marketing-discount-value">{value}</div>
                <h3>{offer.name}</h3><p className="marketing-description">{offer.description || "A restaurant offer ready to share with your guests."}</p>
                <div className="marketing-code-row"><code>{offer.coupon_code}</code><button type="button" aria-label={`Copy coupon ${offer.coupon_code}`} onClick={() => void copy(offer.coupon_code, "Coupon code")}><Copy size={15} /></button></div>
                <div className="marketing-offer-details"><span><Tag size={14} /> Minimum order {money(offer.minimum_order_amount)}</span><span><CalendarDays size={14} /> Ends {dateLabel(offer.ends_at)}</span><span><TrendingUp size={14} /> {stats.count} redemptions · {money(stats.discount)} discount</span></div>
                <div className="marketing-card-actions">
                  <button type="button" className="marketing-secondary-button" onClick={() => void copy(offerLink(offer), "Menu offer link")}><Copy size={15} /> Copy menu link</button>
                  {offer.status === "active" ? <button type="button" className="marketing-ghost-button" disabled={saving} onClick={() => void updateStatus("offers", offer, "paused")}><Pause size={15} /> Pause</button> : offer.status === "archived" ? null : <button type="button" className="marketing-ghost-button" disabled={saving} onClick={() => void updateStatus("offers", offer, "active")}><Play size={15} /> Activate</button>}
                  {offer.status !== "archived" && <button type="button" className="marketing-icon-button" aria-label={`Archive ${offer.name}`} disabled={saving} onClick={() => void updateStatus("offers", offer, "archived")}><Archive size={15} /></button>}
                </div>
              </article>;
            })}
            {!offers.length && <div className="marketing-empty"><span><BadgePercent size={23} /></span><h3>No offers yet</h3><p>Create the first discount and choose whether to publish it immediately.</p><button className="marketing-primary-button" type="button" onClick={() => setShowOfferForm(true)}><Plus size={16} /> Create your first offer</button></div>}
          </section>
        ) : (
          <section className="marketing-card-grid" aria-label="Marketing campaigns">
            {campaigns.map((campaign) => {
              const offer = offers.find((row) => row.id === campaign.offer_id);
              const stats = offer ? offerStats.get(offer.id) || { count: 0, discount: 0, sales: 0 } : { count: 0, discount: 0, sales: 0 };
              return <article className="marketing-campaign-card" key={campaign.id}>
                <div className="marketing-card-top"><span className={`marketing-status status-${campaign.status}`}>{statusLabel(campaign.status)}</span><span className="marketing-campaign-icon"><Megaphone size={20} /></span></div>
                <h3>{campaign.name}</h3><p className="marketing-description">{campaign.message_text}</p>
                <div className="marketing-campaign-code"><span>Campaign code</span><code>{campaign.campaign_code}</code></div>
                <div className="marketing-campaign-offer"><span>Linked offer</span><strong>{offer ? `${offer.name} · ${offer.coupon_code}` : "No linked offer"}</strong></div>
                <div className="marketing-campaign-results"><div><strong>{stats.count}</strong><span>redemptions</span></div><div><strong>{money(stats.sales)}</strong><span>order value</span></div><div><strong>{money(stats.discount)}</strong><span>discounts</span></div></div>
                <div className="marketing-card-actions">
                  <button type="button" className="marketing-secondary-button" onClick={() => void copy(campaignMessage(campaign), "Campaign message")}><Copy size={15} /> Copy promo text</button>
                  {offer && <button type="button" className="marketing-ghost-button" onClick={() => void copy(offerLink(offer), "Menu link")}><ExternalLink size={15} /> Copy menu link</button>}
                  {campaign.status === "active" ? <button type="button" className="marketing-ghost-button" disabled={saving} onClick={() => void updateStatus("marketing_campaigns", campaign, "paused")}><Pause size={15} /> Pause</button> : campaign.status !== "ended" && <button type="button" className="marketing-ghost-button" disabled={saving} onClick={() => void updateStatus("marketing_campaigns", campaign, "active")}><Play size={15} /> Activate</button>}
                  {campaign.status !== "ended" && <button type="button" className="marketing-icon-button" aria-label={`End ${campaign.name}`} disabled={saving} onClick={() => void updateStatus("marketing_campaigns", campaign, "ended")}><Archive size={15} /></button>}
                </div>
                <p className="marketing-footnote">Copy and share manually. Automatic WhatsApp sending is not enabled.</p>
              </article>;
            })}
            {!campaigns.length && <div className="marketing-empty"><span><Megaphone size={23} /></span><h3>No campaigns yet</h3><p>Link an active offer to prepare copy-ready promotional text and track coupon redemptions.</p><button className="marketing-primary-button" type="button" onClick={() => setShowCampaignForm(true)} disabled={!activeOffers.length}><Plus size={16} /> Create a campaign</button></div>}
          </section>
        )}

        <aside className="marketing-info-note"><Sparkles size={17} /><div><strong>How campaign tracking works</strong><p>Khaavio tracks successful coupon redemptions and recorded order value. Link clicks and message delivery are not tracked. Campaigns are for copy-and-share workflows only while WhatsApp automation is on hold.</p></div></aside>
      </div>

      {showOfferForm && <div className="marketing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowOfferForm(false); }}>
        <section className="marketing-modal" role="dialog" aria-modal="true" aria-labelledby="marketing-offer-modal-title">
          <div className="marketing-modal-heading"><div><span className="marketing-eyebrow">NEW PROMOTION</span><h2 id="marketing-offer-modal-title">Create an offer</h2><p>Discounts are recalculated and checked securely when the customer places a QR order.</p></div><button type="button" className="marketing-icon-button" aria-label="Close" onClick={() => setShowOfferForm(false)}><X size={18} /></button></div>
          <form onSubmit={createOffer} className="marketing-form">
            <label>Offer name<input value={offerForm.name} onChange={(e) => setOfferField("name", e.target.value)} maxLength={80} required placeholder="Weekend special" /></label>
            <label>Coupon code<input value={offerForm.coupon_code} onChange={(e) => setOfferField("coupon_code", e.target.value.toUpperCase().replace(/\s+/g, ""))} maxLength={24} required placeholder="WEEKEND10" /></label>
            <label className="marketing-field-wide">Short description<textarea value={offerForm.description} onChange={(e) => setOfferField("description", e.target.value)} maxLength={500} rows={2} placeholder="A little something for your next visit" /></label>
            <label>Discount type<select value={offerForm.discount_type} onChange={(e) => setOfferField("discount_type", e.target.value)}><option value="percentage">Percentage (%)</option><option value="fixed">Fixed amount (₹)</option></select></label>
            <label>Discount value<input type="number" min="0.01" max={offerForm.discount_type === "percentage" ? "100" : undefined} step="0.01" value={offerForm.discount_value} onChange={(e) => setOfferField("discount_value", e.target.value)} required /></label>
            <label>Minimum order (₹)<input type="number" min="0" step="0.01" value={offerForm.minimum_order_amount} onChange={(e) => setOfferField("minimum_order_amount", e.target.value)} required /></label>
            <label>Maximum discount (₹)<input type="number" min="0.01" step="0.01" value={offerForm.maximum_discount_amount} onChange={(e) => setOfferField("maximum_discount_amount", e.target.value)} placeholder="No cap" /></label>
            <label>Starts at<input type="datetime-local" value={offerForm.starts_at} onChange={(e) => setOfferField("starts_at", e.target.value)} required /></label>
            <label>Expires at<input type="datetime-local" min={offerForm.starts_at} value={offerForm.ends_at} onChange={(e) => setOfferField("ends_at", e.target.value)} /></label>
            <label>Total redemptions<input type="number" min="1" step="1" value={offerForm.max_redemptions} onChange={(e) => setOfferField("max_redemptions", e.target.value)} placeholder="Unlimited" /></label>
            <label>Uses per customer<input type="number" min="1" max="100" step="1" value={offerForm.per_customer_limit} onChange={(e) => setOfferField("per_customer_limit", e.target.value)} required /></label>
            <label className="marketing-checkbox-field marketing-field-wide"><input type="checkbox" checked={offerForm.publish_now} onChange={(e) => setOfferField("publish_now", e.target.checked)} /><span><strong>Activate immediately</strong><small>Customers can redeem it once the start time is reached.</small></span></label>
            <div className="marketing-modal-actions"><button type="button" className="marketing-ghost-button" onClick={() => setShowOfferForm(false)} disabled={saving}>Cancel</button><button type="submit" className="marketing-primary-button" disabled={saving}>{saving ? <LoaderCircle className="marketing-spin" size={16} /> : <Plus size={16} />} Save offer</button></div>
          </form>
        </section>
      </div>}

      {showCampaignForm && <div className="marketing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowCampaignForm(false); }}>
        <section className="marketing-modal" role="dialog" aria-modal="true" aria-labelledby="marketing-campaign-modal-title">
          <div className="marketing-modal-heading"><div><span className="marketing-eyebrow">PROMOTION COPY</span><h2 id="marketing-campaign-modal-title">Create a campaign</h2><p>Prepare a message and track redemptions from the linked coupon. No automated sending happens here.</p></div><button type="button" className="marketing-icon-button" aria-label="Close" onClick={() => setShowCampaignForm(false)}><X size={18} /></button></div>
          <form onSubmit={createCampaign} className="marketing-form">
            <label className="marketing-field-wide">Campaign name<input value={campaignForm.name} onChange={(e) => setCampaignField("name", e.target.value)} maxLength={100} required placeholder="October weekend offer" /></label>
            <label className="marketing-field-wide">Active offer<select value={campaignForm.offer_id} onChange={(e) => { const offer = activeOffers.find((row) => row.id === e.target.value); setCampaignField("offer_id", e.target.value); if (offer && !campaignForm.message_text) setCampaignField("message_text", `Enjoy ${offer.discount_type === "percentage" ? `${Number(offer.discount_value)}% off` : `${money(offer.discount_value)} off`} with code ${offer.coupon_code} at ${restaurant?.name || "our restaurant"}.`); }} required><option value="">Choose an active offer</option>{activeOffers.map((offer) => <option value={offer.id} key={offer.id}>{offer.name} · {offer.coupon_code}</option>)}</select></label>
            <label className="marketing-field-wide">Promotional message<textarea value={campaignForm.message_text} onChange={(e) => setCampaignField("message_text", e.target.value)} maxLength={1000} rows={5} required placeholder="Write a short, friendly offer announcement…" /></label>
            <div className="marketing-field-wide marketing-campaign-preview"><span>What this does</span><p>Khaavio saves the campaign and gives you copyable promotional text and a menu link. You choose where and to whom you share it.</p></div>
            <div className="marketing-modal-actions"><button type="button" className="marketing-ghost-button" onClick={() => setShowCampaignForm(false)} disabled={saving}>Cancel</button><button type="submit" className="marketing-primary-button" disabled={saving || !activeOffers.length}>{saving ? <LoaderCircle className="marketing-spin" size={16} /> : <Plus size={16} />} Save campaign draft</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
