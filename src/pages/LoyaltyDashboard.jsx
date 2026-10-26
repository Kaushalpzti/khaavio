import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Gift,
  LoaderCircle,
  RefreshCw,
  Save,
  Sparkles,
  TicketCheck,
  UsersRound,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { usePlanAccess } from "../context/PlanAccessContext";
import PlanUpgradeNotice from "../components/PlanUpgradeNotice";
import "./LoyaltyDashboard.css";

const DEFAULT_FORM = {
  enabled: false,
  stamps_required: 6,
  min_order_amount: "0",
  reward_name: "Free treat",
};

function firstRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function LoyaltyDashboard() {
  const { hasFeature } = usePlanAccess();
  const canManageLoyalty = hasFeature("loyalty_rewards");
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [members, setMembers] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [stats, setStats] = useState({ members: 0, stamps: 0, available: 0, redeemed: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [redeemingId, setRedeemingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === restaurantId) || null,
    [restaurants, restaurantId],
  );

  const loadDashboard = useCallback(async (quiet = false) => {
    if (!canManageLoyalty) {
      setRestaurants([]);
      setRestaurantId("");
      setMembers([]);
      setRewards([]);
      setStats({ members: 0, stamps: 0, available: 0, redeemed: 0 });
      setForm(DEFAULT_FORM);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const { data: authResult, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authResult?.user) throw new Error("Please sign in to manage loyalty rewards.");

      const { data: ownedRestaurants, error: restaurantsError } = await supabase
        .from("restaurants")
        .select("id, name")
        .eq("owner_id", authResult.user.id)
        .order("name", { ascending: true });
      if (restaurantsError) throw restaurantsError;

      const owned = ownedRestaurants || [];
      setRestaurants(owned);
      const chosenId = owned.some((restaurant) => restaurant.id === restaurantId)
        ? restaurantId
        : owned[0]?.id || "";
      setRestaurantId(chosenId);

      if (!chosenId) {
        setMembers([]);
        setRewards([]);
        setStats({ members: 0, stamps: 0, available: 0, redeemed: 0 });
        setForm(DEFAULT_FORM);
        return;
      }

      const [programResult, memberCount, stampCount, availableCount, redeemedCount, memberRows, rewardRows] = await Promise.all([
        supabase.from("restaurant_loyalty_programs").select("restaurant_id, enabled, stamps_required, min_order_amount, reward_name").eq("restaurant_id", chosenId).maybeSingle(),
        supabase.from("restaurant_loyalty_members").select("id", { count: "exact", head: true }).eq("restaurant_id", chosenId),
        supabase.from("restaurant_loyalty_ledger").select("id", { count: "exact", head: true }).eq("restaurant_id", chosenId).eq("entry_type", "stamp_earned"),
        supabase.from("restaurant_loyalty_rewards").select("id", { count: "exact", head: true }).eq("restaurant_id", chosenId).eq("status", "available"),
        supabase.from("restaurant_loyalty_rewards").select("id", { count: "exact", head: true }).eq("restaurant_id", chosenId).eq("status", "redeemed"),
        supabase.from("restaurant_loyalty_members").select("id, created_at, last_seen_at, phone_number, phone_consent_at, marketing_opt_in, marketing_opt_in_at, marketing_opt_out_at").eq("restaurant_id", chosenId).order("last_seen_at", { ascending: false }).limit(50),
        supabase.from("restaurant_loyalty_rewards").select("id, member_id, unlock_order_id, reward_name, redemption_code, status, created_at, revealed_at, redeemed_at").eq("restaurant_id", chosenId).order("created_at", { ascending: false }).limit(30),
      ]);

      for (const result of [programResult, memberCount, stampCount, availableCount, redeemedCount, memberRows, rewardRows]) {
        if (result.error) throw result.error;
      }

      const program = firstRow(programResult.data);
      setForm(program ? {
        enabled: Boolean(program.enabled),
        stamps_required: Number(program.stamps_required) || 6,
        min_order_amount: String(program.min_order_amount ?? 0),
        reward_name: program.reward_name || "Free treat",
      } : DEFAULT_FORM);
      setStats({
        members: memberCount.count || 0,
        stamps: stampCount.count || 0,
        available: availableCount.count || 0,
        redeemed: redeemedCount.count || 0,
      });
      setMembers(memberRows.data || []);
      setRewards(rewardRows.data || []);
    } catch (loadError) {
      console.error("Could not load loyalty dashboard:", loadError);
      setError(loadError?.message || "Could not load loyalty program data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId, canManageLoyalty]);

  useEffect(() => {
    void loadDashboard(false);
    // The callback also depends on the selected restaurant; reload only when the
    // entitlement itself changes here. Selected restaurant changes use the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageLoyalty]);

  useEffect(() => {
    if (!restaurantId || loading) return;
    void loadDashboard(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function saveProgram(event) {
    event.preventDefault();
    if (!restaurantId || saving) return;

    const stampGoal = Number(form.stamps_required);
    const minAmount = Number(form.min_order_amount);
    const rewardName = form.reward_name.trim();
    if (!Number.isInteger(stampGoal) || stampGoal < 2 || stampGoal > 20) {
      setError("Choose a stamp goal between 2 and 20.");
      return;
    }
    if (!Number.isFinite(minAmount) || minAmount < 0 || minAmount > 1000000) {
      setError("Enter a valid minimum order amount.");
      return;
    }
    if (rewardName.length < 2 || rewardName.length > 80) {
      setError("Reward name must be between 2 and 80 characters.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { error: saveError } = await supabase
        .from("restaurant_loyalty_programs")
        .upsert({
          restaurant_id: restaurantId,
          enabled: Boolean(form.enabled),
          stamps_required: stampGoal,
          min_order_amount: minAmount,
          reward_name: rewardName,
        }, { onConflict: "restaurant_id" });
      if (saveError) throw saveError;
      setNotice(form.enabled ? "Khaavio Perks is enabled for this restaurant." : "Loyalty program settings saved. The program is currently paused.");
      await loadDashboard(true);
    } catch (saveError) {
      console.error("Could not save loyalty settings:", saveError);
      setError(saveError?.message || "Could not save loyalty settings.");
    } finally {
      setSaving(false);
    }
  }

  async function redeemReward(reward) {
    if (!reward?.id || redeemingId) return;
    if (!reward.revealed_at) {
      setError("The customer must first unlock this reward through eligible completed orders.");
      return;
    }

    setRedeemingId(reward.id);
    setError("");
    setNotice("");
    try {
      const { data, error: redeemError } = await supabase.rpc(
        "owner_redeem_loyalty_reward",
        { p_reward_id: reward.id },
      );
      if (redeemError) throw redeemError;
      const result = firstRow(data);
      if (!result) throw new Error("The reward may already have been redeemed. Refresh and check its status.");
      setNotice(`Reward ${reward.redemption_code} marked as redeemed.`);
      await loadDashboard(true);
    } catch (redeemError) {
      console.error("Could not redeem loyalty reward:", redeemError);
      setError(redeemError?.message || "Could not redeem this reward.");
    } finally {
      setRedeemingId("");
    }
  }

  if (!canManageLoyalty) {
    return (
      <main className="loyalty-dashboard-page">
        <PlanUpgradeNotice
          title="Unlock Khaavio Perks"
          description="Digital stamp cards, loyalty rewards and redemption management are included with Growth. Existing loyalty data is preserved if your plan changes."
        />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="loyalty-dashboard-page">
        <section className="loyalty-dashboard-state"><LoaderCircle className="loyalty-spin" size={28} /><h1>Loading Khaavio Perks…</h1><p>Checking your restaurant and loyalty activity.</p></section>
      </main>
    );
  }

  if (!selectedRestaurant) {
    return (
      <main className="loyalty-dashboard-page">
        <section className="loyalty-dashboard-state"><Gift size={30} /><h1>Khaavio Perks</h1><p>Create a restaurant profile before setting up loyalty rewards.</p></section>
      </main>
    );
  }

  return (
    <main className="loyalty-dashboard-page">
      <header className="loyalty-dashboard-header">
        <div>
          <span className="loyalty-dashboard-eyebrow"><Sparkles size={14} /> CUSTOMER LOYALTY</span>
          <h1>Loyalty & rewards</h1>
          <p>Turn completed visits into little reasons to come back.</p>
        </div>
        <div className="loyalty-dashboard-header-actions">
          {restaurants.length > 1 && (
            <label className="loyalty-restaurant-select"><span>Restaurant</span>
              <select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>
                {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="loyalty-refresh-button" onClick={() => void loadDashboard(true)} disabled={refreshing}>
            {refreshing ? <LoaderCircle size={16} className="loyalty-spin" /> : <RefreshCw size={16} />} Refresh
          </button>
        </div>
      </header>

      {error && <div className="loyalty-flash is-error" role="alert">{error}</div>}
      {notice && <div className="loyalty-flash is-success" role="status">{notice}</div>}

      <section className="loyalty-stats-grid" aria-label="Loyalty program statistics">
        <article className="loyalty-stat-card"><span className="loyalty-stat-icon"><UsersRound size={18} /></span><small>Perks members</small><strong>{stats.members}</strong><span>Guest cards linked to an order</span></article>
        <article className="loyalty-stat-card"><span className="loyalty-stat-icon is-peach"><Sparkles size={18} /></span><small>Stamps awarded</small><strong>{stats.stamps}</strong><span>Earned on eligible paid orders</span></article>
        <article className="loyalty-stat-card"><span className="loyalty-stat-icon is-gold"><Gift size={18} /></span><small>Rewards waiting</small><strong>{stats.available}</strong><span>Available for customer redemption</span></article>
        <article className="loyalty-stat-card"><span className="loyalty-stat-icon is-green"><BadgeCheck size={18} /></span><small>Rewards redeemed</small><strong>{stats.redeemed}</strong><span>Confirmed by restaurant staff</span></article>
      </section>

      <div className="loyalty-dashboard-grid">
        <section className="loyalty-panel">
          <div className="loyalty-panel-heading"><div><span className="loyalty-dashboard-eyebrow">PROGRAM SETUP</span><h2>Make repeat visits rewarding</h2></div><span className={`loyalty-program-state${form.enabled ? " is-enabled" : ""}`}>{form.enabled ? "Enabled" : "Paused"}</span></div>
          <form className="loyalty-program-form" onSubmit={saveProgram}>
            <label className="loyalty-toggle-row"><span><strong>Enable Khaavio Perks</strong><small>Show the stamp card on your public menu.</small></span><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} /></label>
            <label className="loyalty-field"><span>Stamps needed for a reward</span><input type="number" min="2" max="20" step="1" value={form.stamps_required} onChange={(event) => setForm((current) => ({ ...current, stamps_required: event.target.value }))} required /><small>Choose between 2 and 20 stamps.</small></label>
            <label className="loyalty-field"><span>Minimum order amount (₹)</span><input type="number" min="0" max="1000000" step="0.01" value={form.min_order_amount} onChange={(event) => setForm((current) => ({ ...current, min_order_amount: event.target.value }))} required /><small>Set 0 to count any order amount. Each order is checked separately.</small></label>
            <label className="loyalty-field"><span>Reward name</span><input type="text" maxLength="80" value={form.reward_name} onChange={(event) => setForm((current) => ({ ...current, reward_name: event.target.value }))} placeholder="e.g. Free coffee" required /><small>Displayed when the customer unlocks a reward.</small></label>
            <button className="loyalty-save-button" type="submit" disabled={saving}>{saving ? <LoaderCircle size={17} className="loyalty-spin" /> : <Save size={17} />} Save program</button>
          </form>
          <div className="loyalty-safety-note"><Sparkles size={16} /><p>Stamps are awarded server-side only after an order is completed and the table's final invoice is paid. Opening the menu does not earn stamps.</p></div>
        </section>

        <section className="loyalty-panel loyalty-members-panel">
          <div className="loyalty-panel-heading"><div><span className="loyalty-dashboard-eyebrow">YOUR COMMUNITY</span><h2>Customer leads & Perks cards</h2></div><span className="loyalty-count-pill">{members.length} shown</span></div>
          {members.length === 0 ? <div className="loyalty-empty"><UsersRound size={25} /><strong>No members yet</strong><p>Customers who join Khaavio Perks with a mobile number will appear here. Numbers are customer-provided and not OTP-verified.</p></div> : (
            <div className="loyalty-member-list">
              {members.map((member) => <article className="loyalty-member-row" key={member.id}><span className="loyalty-member-avatar"><Gift size={17} /></span><span className="loyalty-member-copy"><strong>{member.phone_number || `Legacy Perks member · ${member.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`}</strong><small>Joined {formatDate(member.created_at)} · Mobile not OTP-verified</small><small className={`loyalty-marketing-status${member.marketing_opt_in ? " is-opted-in" : ""}`}>{member.marketing_opt_in ? "Offers: opted in (self-reported)" : "No promotional consent"}</small></span><span className="loyalty-member-last-seen">Seen {formatDate(member.last_seen_at)}</span></article>)}
            </div>
          )}
          <p className="loyalty-muted-note">Mobile numbers and offer preferences are customer-provided, not OTP-verified. Treat this list as unverified until confirmed in person; send promotional offers only to customers who explicitly opted in. Staff must confirm the customer/order context before handing over a reward.</p>
        </section>
      </div>

      <section className="loyalty-panel loyalty-rewards-panel">
        <div className="loyalty-panel-heading"><div><span className="loyalty-dashboard-eyebrow">REDEMPTION DESK</span><h2>Rewards to redeem</h2><p>Check the customer's code and mark it redeemed only when the reward is handed over.</p></div><span className="loyalty-count-pill">{rewards.length} recent</span></div>
        {rewards.length === 0 ? <div className="loyalty-empty compact"><TicketCheck size={25} /><strong>No rewards unlocked yet</strong><p>Rewards appear here when eligible completed and paid orders unlock them.</p></div> : (
          <div className="loyalty-rewards-table-wrap"><table className="loyalty-rewards-table"><thead><tr><th>Reward</th><th>Customer mobile / member</th><th>Code</th><th>Status</th><th>Unlocked</th><th>Action</th></tr></thead><tbody>
            {rewards.map((reward) => <tr key={reward.id}><td><strong>{reward.reward_name}</strong></td><td><strong>{members.find((member) => member.id === reward.member_id)?.phone_number || `Member ${reward.member_id.replace(/-/g, "").slice(0, 6).toUpperCase()}`}</strong><small className="loyalty-member-unverified">Mobile is not OTP-verified</small></td><td><code>{reward.redemption_code}</code></td><td><span className={`loyalty-reward-status is-${reward.status}`}>{reward.status === "available" ? "Available" : "Redeemed"}</span></td><td>{formatDate(reward.created_at)}</td><td>{reward.status === "available" ? <button type="button" className="loyalty-redeem-button" onClick={() => void redeemReward(reward)} disabled={redeemingId === reward.id}>{redeemingId === reward.id ? <LoaderCircle size={14} className="loyalty-spin" /> : <BadgeCheck size={14} />} Mark redeemed</button> : <span className="loyalty-redeemed-date">{formatDate(reward.redeemed_at)}</span>}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </main>
  );
}
