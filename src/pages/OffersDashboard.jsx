import { useCallback, useEffect, useState } from "react";
import { BadgePercent, CalendarClock, Check, Copy, LoaderCircle, Pencil, Plus, RefreshCw, Tag, Trash2, ToggleLeft, ToggleRight, Users, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "./OffersDashboard.css";

const EMPTY_FORM = {
  code: "",
  title: "",
  discount_type: "percent",
  discount_value: "10",
  minimum_order_amount: "0",
  maximum_discount_amount: "",
  starts_at: "",
  ends_at: "",
  usage_limit: "",
};

function dateTimeLocal(value) {
  if (!value) return "No expiry";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function localNowInput() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

function toLocalDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function emptyCouponForm() {
  return { ...EMPTY_FORM, starts_at: localNowInput() };
}

export default function OffersDashboard() {
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState(emptyCouponForm);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState("");
  const [deletingCouponId, setDeletingCouponId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedCode, setCopiedCode] = useState("");

  const loadCoupons = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData?.user) throw new Error("Sign in to manage your offers.");
      const { data: owned, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id, name")
        .eq("owner_id", authData.user.id)
        .order("name", { ascending: true });
      if (restaurantError) throw restaurantError;
      const ownedRows = owned || [];
      setRestaurants(ownedRows);
      const chosenId = ownedRows.some((row) => row.id === restaurantId) ? restaurantId : ownedRows[0]?.id || "";
      setRestaurantId(chosenId);
      if (!chosenId) {
        setCoupons([]);
        return;
      }
      const { data, error: couponError } = await supabase
        .from("restaurant_coupons")
        .select("id, code, title, discount_type, discount_value, minimum_order_amount, maximum_discount_amount, starts_at, ends_at, usage_limit, used_count, is_active, created_at")
        .eq("restaurant_id", chosenId)
        .order("created_at", { ascending: false });
      if (couponError) throw couponError;
      setCoupons(data || []);
    } catch (loadError) {
      console.error("Could not load offers:", loadError);
      setError(loadError?.message || "Could not load your offers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId]);

  useEffect(() => { void loadCoupons(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!restaurantId || loading) return;
    void loadCoupons(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function saveCoupon(event) {
    event.preventDefault();
    if (!restaurantId || saving) return;
    setError("");
    setNotice("");
    const code = form.code.trim().toUpperCase();
    const title = form.title.trim();
    const value = Number(form.discount_value);
    const minimum = Number(form.minimum_order_amount);
    const cap = form.maximum_discount_amount === "" ? null : Number(form.maximum_discount_amount);
    const usageLimit = form.usage_limit === "" ? null : Number(form.usage_limit);
    const startsAt = form.starts_at ? new Date(form.starts_at) : new Date();
    const endsAt = form.ends_at ? new Date(form.ends_at) : null;
    if (!/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(code)) {
      setError("Coupon code must be 3–24 letters, numbers, hyphens or underscores.");
      return;
    }
    if (title.length < 2 || title.length > 80) { setError("Give this offer a title between 2 and 80 characters."); return; }
    if (!Number.isFinite(value) || value <= 0 || value > 1_000_000 || (form.discount_type === "percent" && value > 100)) {
      setError(form.discount_type === "percent" ? "Percent discount must be between 0 and 100." : "Enter a fixed discount amount up to ₹10,00,000.");
      return;
    }
    if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1_000_000 || (cap !== null && (!Number.isFinite(cap) || cap <= 0 || cap > 1_000_000))) {
      setError("Check the minimum order and maximum discount amounts.");
      return;
    }
    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) { setError("Usage limit must be a positive whole number."); return; }
    if (!Number.isFinite(startsAt.getTime()) || (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt))) {
      setError("Expiry must be later than the offer start time.");
      return;
    }

    setSaving(true);
    try {
      const couponPayload = {
        code,
        title,
        discount_type: form.discount_type,
        discount_value: value,
        minimum_order_amount: minimum,
        maximum_discount_amount: form.discount_type === "percent" ? cap : null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt?.toISOString() || null,
        usage_limit: usageLimit,
      };

      if (editingCouponId) {
        const { error: updateError } = await supabase
          .from("restaurant_coupons")
          .update(couponPayload)
          .eq("id", editingCouponId)
          .eq("restaurant_id", restaurantId)
          .select("id")
          .single();
        if (updateError) throw updateError;
        setNotice(`${code} updated successfully. Existing orders keep their saved totals.`);
      } else {
        const { error: insertError } = await supabase.from("restaurant_coupons").insert({
          restaurant_id: restaurantId,
          ...couponPayload,
        });
        if (insertError) throw insertError;
        setNotice(`${code} is ready. Share it with your customers.`);
      }

      setEditingCouponId("");
      setForm(emptyCouponForm());
      await loadCoupons(true);
    } catch (saveError) {
      const message = saveError?.code === "23505"
        ? "That code already exists for this restaurant. Choose another code."
        : saveError?.message || "Could not create the coupon.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function resetCouponForm() {
    setEditingCouponId("");
    setForm(emptyCouponForm());
    setError("");
    setNotice("");
  }

  function editCoupon(coupon) {
    setEditingCouponId(coupon.id);
    setError("");
    setNotice("");
    setForm({
      code: coupon.code,
      title: coupon.title,
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      minimum_order_amount: String(coupon.minimum_order_amount),
      maximum_discount_amount: coupon.maximum_discount_amount === null ? "" : String(coupon.maximum_discount_amount),
      starts_at: toLocalDateTimeInput(coupon.starts_at),
      ends_at: toLocalDateTimeInput(coupon.ends_at),
      usage_limit: coupon.usage_limit === null ? "" : String(coupon.usage_limit),
    });
  }

  async function deleteCoupon(coupon) {
    if (!restaurantId || deletingCouponId) return;
    const confirmed = window.confirm(
      `Delete coupon ${coupon.code}? It will stop being available to customers. Existing orders keep their saved coupon code and totals.`,
    );
    if (!confirmed) return;

    setDeletingCouponId(coupon.id);
    setError("");
    setNotice("");
    try {
      const { error: deleteError } = await supabase
        .from("restaurant_coupons")
        .delete()
        .eq("id", coupon.id)
        .eq("restaurant_id", restaurantId)
        .select("id")
        .single();
      if (deleteError) throw deleteError;

      setCoupons((current) => current.filter((entry) => entry.id !== coupon.id));
      if (editingCouponId === coupon.id) resetCouponForm();
      setNotice(`${coupon.code} deleted. Existing order totals remain unchanged.`);
    } catch (deleteError) {
      console.error("Could not delete coupon:", deleteError);
      setError(deleteError?.message || "Could not delete the coupon.");
    } finally {
      setDeletingCouponId("");
    }
  }

  async function toggleCoupon(coupon) {
    setError("");
    setNotice("");
    const { error: updateError } = await supabase.from("restaurant_coupons")
      .update({ is_active: !coupon.is_active })
      .eq("id", coupon.id)
      .eq("restaurant_id", restaurantId);
    if (updateError) setError(updateError.message || "Could not update the coupon.");
    else {
      setCoupons((current) => current.map((entry) => entry.id === coupon.id ? { ...entry, is_active: !entry.is_active } : entry));
      setNotice(`${coupon.code} ${coupon.is_active ? "paused" : "activated"}.`);
    }
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(""), 1600);
    } catch {
      setError("Could not copy the code. Select and copy it manually.");
    }
  }

  const activeCount = coupons.filter((coupon) => coupon.is_active).length;
  const usedCount = coupons.reduce((sum, coupon) => sum + Number(coupon.used_count || 0), 0);

  return (
    <main className="offers-page">
      <header className="offers-header">
        <div>
          <span className="offers-eyebrow"><BadgePercent size={14} /> SALES & PROMOTIONS</span>
          <h1>Offers &amp; Coupons</h1>
          <p>Make a deal, share the code, and let the QR menu apply it at checkout.</p>
        </div>
        <div className="offers-header-actions">
          {restaurants.length > 1 && <label className="offers-restaurant-select"><span>Restaurant</span><select value={restaurantId} onChange={(event) => { resetCouponForm(); setRestaurantId(event.target.value); }}>{restaurants.map((restaurant) => <option value={restaurant.id} key={restaurant.id}>{restaurant.name}</option>)}</select></label>}
          <button type="button" className="offers-refresh" onClick={() => void loadCoupons(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "offers-spin" : ""} /> Refresh</button>
        </div>
      </header>

      {error && <div className="offers-alert is-error" role="alert">{error}</div>}
      {notice && <div className="offers-alert is-success" role="status">{notice}</div>}
      {!loading && restaurants.length === 0 ? <section className="offers-empty"><Tag size={25} /><h2>Set up your restaurant first</h2><p>Create a restaurant profile before making customer coupons.</p></section> : (
        <>
          <section className="offers-stats" aria-label="Offer summary">
            <article><span><Tag size={17} /></span><small>Active offers</small><strong>{activeCount}</strong></article>
            <article><span><Users size={17} /></span><small>Coupon uses</small><strong>{usedCount}</strong></article>
          </section>

          <div className="offers-layout">
            <section className="offers-panel offers-create-panel">
              <div className="offers-panel-heading">
                <span className="offers-icon">{editingCouponId ? <Pencil size={17} /> : <Plus size={17} />}</span>
                <div><h2>{editingCouponId ? "Edit coupon" : "Create a coupon"}</h2><p>{editingCouponId ? "Update the offer details. Saved orders keep their original totals." : "Discounts apply to one QR menu order."}</p></div>
                {editingCouponId && <button type="button" className="offers-cancel-edit" onClick={resetCouponForm} aria-label="Cancel coupon editing"><X size={16} /> Cancel</button>}
              </div>
              <form className="offers-form" onSubmit={saveCoupon}>
                <div className="offers-fields two-cols">
                  <label><span>Coupon code</span><input value={form.code} onChange={(event) => setForm((value) => ({ ...value, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) }))} placeholder="e.g. WELCOME10" maxLength={24} autoCapitalize="characters" required /><small>Customers enter this at checkout.</small></label>
                  <label><span>Offer name</span><input value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} placeholder="e.g. First order offer" maxLength={80} required /></label>
                </div>
                <div className="offers-fields three-cols">
                  <label><span>Discount type</span><select value={form.discount_type} onChange={(event) => setForm((value) => ({ ...value, discount_type: event.target.value }))}><option value="percent">Percentage</option><option value="fixed">Fixed amount (₹)</option></select></label>
                  <label><span>{form.discount_type === "percent" ? "Percent off" : "Amount off (₹)"}</span><input type="number" min="0.01" max={form.discount_type === "percent" ? "100" : "1000000"} step="0.01" value={form.discount_value} onChange={(event) => setForm((value) => ({ ...value, discount_value: event.target.value }))} required /></label>
                  <label><span>Minimum order (₹)</span><input type="number" min="0" max="1000000" step="0.01" value={form.minimum_order_amount} onChange={(event) => setForm((value) => ({ ...value, minimum_order_amount: event.target.value }))} required /></label>
                </div>
                {form.discount_type === "percent" && <label><span>Maximum discount (₹) · optional</span><input type="number" min="0.01" max="1000000" step="0.01" value={form.maximum_discount_amount} onChange={(event) => setForm((value) => ({ ...value, maximum_discount_amount: event.target.value }))} placeholder="No cap" /></label>}
                <div className="offers-fields three-cols">
                  <label><span>Starts at</span><input type="datetime-local" value={form.starts_at} onChange={(event) => setForm((value) => ({ ...value, starts_at: event.target.value }))} required /></label>
                  <label><span>Expires at · optional</span><input type="datetime-local" value={form.ends_at} onChange={(event) => setForm((value) => ({ ...value, ends_at: event.target.value }))} /></label>
                  <label><span>Total uses · optional</span><input type="number" min="1" step="1" value={form.usage_limit} onChange={(event) => setForm((value) => ({ ...value, usage_limit: event.target.value }))} placeholder="Unlimited" /></label>
                </div>
                <div className="offers-safety-note"><Check size={15} /><span>Coupon dates, limits and discount amounts are checked again when an order is placed.</span></div>
                <div className="offers-form-actions">
                  <button className="offers-primary-button" type="submit" disabled={saving || loading || !restaurantId}>
                    {saving ? <LoaderCircle size={16} className="offers-spin" /> : editingCouponId ? <Check size={16} /> : <Plus size={16} />}
                    {saving ? "Saving…" : editingCouponId ? "Save changes" : "Create coupon"}
                  </button>
                  {editingCouponId && <button className="offers-secondary-button" type="button" onClick={resetCouponForm} disabled={saving}>Cancel</button>}
                </div>
              </form>
            </section>

            <section className="offers-panel offers-list-panel">
              <div className="offers-panel-heading"><span className="offers-icon is-gold"><Tag size={17} /></span><div><h2>Your coupons</h2><p>Pause an offer any time. Existing orders keep their saved totals.</p></div><span className="offers-count">{coupons.length}</span></div>
              {loading ? <div className="offers-state"><LoaderCircle size={23} className="offers-spin" /><span>Loading offers…</span></div> : coupons.length === 0 ? <div className="offers-empty compact"><Tag size={23} /><strong>No coupons yet</strong><p>Create your first offer and its code will work on the restaurant QR menu.</p></div> : (
                <div className="offers-list">
                  {coupons.map((coupon) => {
                    const exhausted = coupon.usage_limit !== null && Number(coupon.used_count) >= Number(coupon.usage_limit);
                    const live = coupon.is_active && !exhausted && new Date(coupon.starts_at) <= new Date() && (!coupon.ends_at || new Date(coupon.ends_at) > new Date());
                    return <article className={`offers-coupon-card${live ? " is-live" : ""}`} key={coupon.id}>
                      <div className="offers-coupon-top">
                        <div><span className="offers-coupon-kicker">{coupon.title}</span><strong>{coupon.discount_type === "percent" ? `${Number(coupon.discount_value)}% off` : `₹${Number(coupon.discount_value).toFixed(2)} off`}</strong></div>
                        <div className="offers-coupon-actions" aria-label={`Actions for coupon ${coupon.code}`}>
                          <button type="button" className="offers-toggle" title={coupon.is_active ? "Pause coupon" : "Enable coupon"} aria-label={`${coupon.is_active ? "Pause" : "Activate"} ${coupon.code}`} onClick={() => void toggleCoupon(coupon)}>{coupon.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}</button>
                          <button type="button" className="offers-edit-button" title={`Edit ${coupon.code}`} onClick={() => editCoupon(coupon)} aria-label={`Edit coupon ${coupon.code}`} disabled={saving || Boolean(deletingCouponId)}><Pencil size={13} /><span>Edit</span></button>
                          <button type="button" className="offers-delete-button" title={`Delete ${coupon.code}`} onClick={() => void deleteCoupon(coupon)} aria-label={`Delete coupon ${coupon.code}`} disabled={Boolean(deletingCouponId)}>{deletingCouponId === coupon.id ? <LoaderCircle size={13} className="offers-spin" /> : <Trash2 size={13} />}<span>Delete</span></button>
                        </div>
                      </div>
                      <div className="offers-code-row"><code>{coupon.code}</code><button type="button" onClick={() => void copyCode(coupon.code)} aria-label={`Copy coupon ${coupon.code}`}>{copiedCode === coupon.code ? <Check size={15} /> : <Copy size={15} />}{copiedCode === coupon.code ? "Copied" : "Copy"}</button></div>
                      <div className="offers-coupon-meta"><span>Min. ₹{Number(coupon.minimum_order_amount).toFixed(0)}</span>{coupon.maximum_discount_amount !== null && <span>Max. ₹{Number(coupon.maximum_discount_amount).toFixed(0)} off</span>}<span>{coupon.used_count} / {coupon.usage_limit ?? "∞"} uses</span></div>
                      <div className="offers-coupon-footer"><span className={`offers-status${live ? " is-live" : ""}`}>{exhausted ? "Limit reached" : live ? "Active" : coupon.is_active ? "Scheduled / expired" : "Paused"}</span><span><CalendarClock size={13} /> {dateTimeLocal(coupon.ends_at)}</span></div>
                    </article>;
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
