import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, BarChart3, BrainCircuit, CalendarDays, Clock3,
  LoaderCircle, MessageCircle, RefreshCw, Send, ShoppingBag, Sparkles,
  TrendingUp, UsersRound,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { usePlanAccess } from "../context/PlanAccessContext";
import PlanUpgradeNotice from "../components/PlanUpgradeNotice";
import "./BusinessCopilot.css";

const RANGES = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];
const QUICK_QUESTIONS = [
  "Compare completed sales with the previous period.",
  "Which dishes sold the most?",
  "How many repeat customers ordered in this period?",
  "What are my busiest order hours?",
  "How many bookings are coming up in the next 30 days?",
  "Summarise the key things I should focus on next.",
];
const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(Number(value) || 0);
const percentChange = (current, previous) => {
  const a = Number(current) || 0;
  const b = Number(previous) || 0;
  return b === 0 ? null : ((a - b) / Math.abs(b)) * 100;
};

function MetricCard({ icon: Icon, label, value, helper, tone = "green" }) {
  return (
    <article className={`copilot-metric copilot-metric-${tone}`}>
      <span className="copilot-metric-icon"><Icon size={19} /></span>
      <div className="copilot-metric-copy">
        <span>{label}</span><strong>{value}</strong><small>{helper}</small>
      </div>
    </article>
  );
}

export default function BusinessCopilot() {
  const navigate = useNavigate();
  const { hasFeature } = usePlanAccess();
  const canUseCopilot = hasFeature("business_copilot");
  const [restaurant, setRestaurant] = useState(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState("");
  const messageEndRef = useRef(null);

  useEffect(() => {
    let alive = true;
    async function loadWorkspace() {
      setWorkspaceLoading(true);
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) {
          navigate("/login", { replace: true });
          return;
        }
        const { data, error } = await supabase
          .from("restaurants")
          .select("id, name, slug")
          .eq("owner_id", authData.user.id)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("No restaurant workspace was found. Complete onboarding first.");
        if (alive) setRestaurant(data);
      } catch (error) {
        if (alive) setSummaryError(error?.message || "Could not load your restaurant workspace.");
      } finally {
        if (alive) setWorkspaceLoading(false);
      }
    }
    void loadWorkspace();
    return () => { alive = false; };
  }, [navigate]);

  const loadSummary = useCallback(async () => {
    if (!restaurant || !canUseCopilot) return;
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const { data, error } = await supabase.rpc("khaavio_business_copilot_summary", {
        p_restaurant_id: restaurant.id,
        p_days: rangeDays,
      });
      if (error) {
        if (String(error.message || "").includes("KHAAVIO_PLAN_ACCESS_REQUIRED")) {
          setSummaryError("Business Copilot is available on Growth or during an eligible trial.");
        } else {
          throw error;
        }
      } else {
        setSummary(data || null);
      }
    } catch (error) {
      setSummaryError(error?.message || "Could not load your business summary.");
    } finally {
      setSummaryLoading(false);
    }
  }, [restaurant, canUseCopilot, rangeDays]);

  useEffect(() => { void loadSummary(); }, [loadSummary, refreshKey]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, asking]);

  const current = summary?.current_period || {};
  const previous = summary?.previous_period || {};
  const salesDelta = percentChange(current.completed_sales_inr, previous.completed_sales_inr);
  const topDishes = Array.isArray(summary?.top_dishes) ? summary.top_dishes : [];
  const peakHours = Array.isArray(summary?.peak_hours_ist) ? summary.peak_hours_ist : [];
  const periodLabel = useMemo(
    () => RANGES.find((item) => item.value === rangeDays)?.label || `${rangeDays} days`,
    [rangeDays],
  );

  async function askCopilot(text = question) {
    const prompt = String(text || "").trim();
    if (!prompt || asking || !restaurant || !canUseCopilot) return;
    if (prompt.length > 500) {
      setChatError("Keep your question under 500 characters.");
      return;
    }
    setQuestion("");
    setChatError("");
    setMessages((items) => [...items, { role: "user", content: prompt }]);
    setAsking(true);
    try {
      const { data, error } = await supabase.functions.invoke("khaavio-business-copilot", {
        body: { restaurantId: restaurant.id, rangeDays, question: prompt },
      });
      if (error) {
        let message = error.message || "The Copilot could not answer right now.";
        try {
          const payload = await error.context?.json?.();
          if (payload?.message) message = payload.message;
        } catch {
          // Keep the SDK error if the response is not JSON.
        }
        if (error.context?.status === 403) {
          setChatError("Business Copilot is available on Growth or during an eligible trial. Your restaurant data remains unchanged.");
        } else {
          setChatError(message);
        }
      } else if (data?.answer) {
        setMessages((items) => [...items, { role: "assistant", content: data.answer }]);
      } else {
        setChatError("The Copilot returned an empty response. Please try again.");
      }
    } catch (error) {
      setChatError(error?.message || "AI is temporarily unavailable. Try again shortly.");
    } finally {
      setAsking(false);
    }
  }

  if (workspaceLoading) {
    return <main className="business-copilot-page"><div className="copilot-loading"><LoaderCircle className="copilot-spin" size={28} /><p>Preparing your business workspace…</p></div></main>;
  }

  if (!canUseCopilot) {
    return (
      <main className="business-copilot-page">
        <div className="copilot-shell">
          <Link to="/dashboard" className="copilot-back"><ArrowLeft size={15} /> Dashboard</Link>
          <section className="copilot-gated">
            <span className="copilot-gated-icon"><BrainCircuit size={30} /></span>
            <span className="copilot-eyebrow">YOUR BUSINESS, BETTER UNDERSTOOD</span>
            <h1>Business Copilot</h1>
            <p>Ask questions about sales, popular dishes, repeat customers and upcoming bookings using your restaurant's data.</p>
            <PlanUpgradeNotice
              title="Unlock Business Copilot with Growth"
              description="The assistant uses aggregated data from your own restaurant. Usage limits apply."
            />
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="business-copilot-page">
      <div className="copilot-shell">
        <header className="copilot-topbar">
          <Link to="/dashboard" className="copilot-back"><ArrowLeft size={15} /> Dashboard</Link>
          <button type="button" className="copilot-icon-button" onClick={() => setRefreshKey((value) => value + 1)}
            disabled={summaryLoading} aria-label="Refresh business data" title="Refresh business data">
            <RefreshCw size={16} className={summaryLoading ? "copilot-spin" : ""} />
          </button>
        </header>

        <section className="copilot-hero">
          <div className="copilot-hero-copy">
            <span className="copilot-eyebrow"><Sparkles size={14} /> RESTAURANT INTELLIGENCE</span>
            <h1>Meet your Business Copilot.</h1>
            <p>Turn your restaurant's recent numbers into clear answers and practical next steps.</p>
            {restaurant?.name && <span className="copilot-restaurant-chip"><span /> {restaurant.name}</span>}
          </div>
          <div className="copilot-hero-art" aria-hidden="true">
            <div className="copilot-art-orbit orbit-one" /><div className="copilot-art-orbit orbit-two" />
            <span className="copilot-art-core"><BrainCircuit size={36} /></span>
            <span className="copilot-art-spark spark-one"><Sparkles size={15} /></span>
            <span className="copilot-art-spark spark-two"><TrendingUp size={17} /></span>
          </div>
        </section>

        <section className="copilot-summary-heading">
          <div><span className="copilot-eyebrow">YOUR NUMBERS, NOT GUESSES</span><h2>Business snapshot</h2>
            <p>Completed sales are based on orders marked completed. All values use your selected period.</p></div>
          <label className="copilot-range"><span>Reporting period</span>
            <select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))} aria-label="Reporting period">
              {RANGES.map((range) => <option value={range.value} key={range.value}>{range.label}</option>)}
            </select>
          </label>
        </section>

        {summaryError && <div className="copilot-alert" role="alert">{summaryError}</div>}

        <section className="copilot-metrics" aria-label="Business metrics">
          <MetricCard icon={TrendingUp} label="Completed sales" value={summaryLoading && !summary ? "…" : money(current.completed_sales_inr)}
            helper={salesDelta === null ? "No previous-period baseline" : `${salesDelta >= 0 ? "+" : ""}${salesDelta.toFixed(1)}% vs previous ${periodLabel}`} />
          <MetricCard icon={ShoppingBag} label="Completed orders" value={summaryLoading && !summary ? "…" : (Number(current.completed_orders) || 0).toLocaleString("en-IN")}
            helper={`${Number(current.orders) || 0} total orders in period`} tone="blue" />
          <MetricCard icon={BarChart3} label="Average order value" value={summaryLoading && !summary ? "…" : money(current.average_order_value_inr)}
            helper="Completed orders only" tone="amber" />
          <MetricCard icon={UsersRound} label="Repeat customers" value={summaryLoading && !summary ? "…" : (Number(summary?.repeat_customers) || 0).toLocaleString("en-IN")}
            helper="Customers with 2+ completed orders" tone="violet" />
        </section>

        <section className="copilot-detail-grid">
          <article className="copilot-panel">
            <div className="copilot-panel-heading"><div><span className="copilot-panel-icon"><ShoppingBag size={16} /></span><h3>Top-selling dishes</h3></div><span className="copilot-panel-meta">Last {periodLabel}</span></div>
            {summaryLoading && !summary ? <p className="copilot-muted">Loading dish performance…</p> : topDishes.length ? (
              <div className="copilot-dish-list">{topDishes.map((dish, index) => (
                <div className="copilot-dish-row" key={`${dish.dish}-${index}`}>
                  <span className="copilot-dish-rank">{index + 1}</span>
                  <div className="copilot-dish-info"><strong>{dish.dish || "Menu item"}</strong><small>{Number(dish.quantity_sold) || 0} sold</small></div>
                  <strong className="copilot-dish-sales">{money(dish.net_sales_inr)}</strong>
                </div>
              ))}</div>
            ) : <p className="copilot-muted">No completed dish sales found in this period yet.</p>}
          </article>

          <article className="copilot-panel">
            <div className="copilot-panel-heading"><div><span className="copilot-panel-icon is-blue"><Clock3 size={16} /></span><h3>Busiest hours</h3></div><span className="copilot-panel-meta">India time</span></div>
            {summaryLoading && !summary ? <p className="copilot-muted">Loading order patterns…</p> : peakHours.length ? (
              <div className="copilot-hour-list">{peakHours.map((hour) => {
                const start = Number(hour.hour_ist) || 0;
                const maxOrders = Math.max(...peakHours.map((item) => Number(item.completed_orders) || 0), 1);
                const width = Math.max(8, ((Number(hour.completed_orders) || 0) / maxOrders) * 100);
                return <div className="copilot-hour-row" key={start}>
                  <span>{String(start).padStart(2, "0")}:00–{String((start + 1) % 24).padStart(2, "0")}:00</span>
                  <div className="copilot-hour-track"><span style={{ width: `${width}%` }} /></div><strong>{hour.completed_orders}</strong>
                </div>;
              })}</div>
            ) : <p className="copilot-muted">Not enough completed orders to show a time pattern.</p>}
            <div className="copilot-bookings-mini"><CalendarDays size={16} /><span>Upcoming bookings</span>
              <strong>{Number(summary?.upcoming_bookings_next_30_days) || 0}</strong><small>Next 30 days</small></div>
          </article>
        </section>

        <section className="copilot-chat-panel">
          <div className="copilot-chat-header">
            <span className="copilot-chat-avatar"><BrainCircuit size={20} /></span>
            <div><h2>Ask your Copilot</h2><p>Answers are grounded in your restaurant's aggregated records.</p></div>
            <span className="copilot-powered"><span /> Groq AI</span>
          </div>

          {!messages.length && <div className="copilot-welcome">
            <span className="copilot-welcome-icon"><MessageCircle size={22} /></span>
            <h3>What would you like to understand?</h3><p>Choose a starter question or ask in your own words.</p>
            <div className="copilot-prompts">{QUICK_QUESTIONS.map((prompt) => <button type="button" key={prompt}
              onClick={() => void askCopilot(prompt)} disabled={asking}><span>{prompt}</span><ArrowRight size={14} /></button>)}</div>
          </div>}

          {!!messages.length && <div className="copilot-conversation" aria-live="polite">
            {messages.map((message, index) => <article className={`copilot-message is-${message.role}`} key={`${message.role}-${index}`}>
              {message.role === "assistant" && <span className="copilot-message-icon"><Sparkles size={14} /></span>}
              <div className="copilot-message-bubble">{message.content}</div>
            </article>)}
            {asking && <div className="copilot-thinking"><span /><span /><span /> Analysing your numbers…</div>}
            <div ref={messageEndRef} />
          </div>}

          {chatError && <div className="copilot-alert" role="alert">{chatError}</div>}
          <form className="copilot-composer" onSubmit={(event) => { event.preventDefault(); void askCopilot(); }}>
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askCopilot(); } }}
              maxLength={500} rows={2} aria-label="Ask Business Copilot"
              placeholder="Ask about sales, dishes, repeat customers…" disabled={asking} />
            <div className="copilot-composer-footer"><span>Max 500 characters · No actions are taken automatically</span>
              <button type="submit" disabled={asking || !question.trim()} aria-label="Send question">
                {asking ? <LoaderCircle className="copilot-spin" size={17} /> : <Send size={16} />} Ask Copilot
              </button>
            </div>
          </form>
          <p className="copilot-privacy-note">Privacy-first: customer names and phone numbers stay out of the AI prompt. Responses are suggestions, not automatic changes.</p>
        </section>
      </div>
    </main>
  );
}
