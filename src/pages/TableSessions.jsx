import { confirmKhaavio } from "../components/KhaavioDialogSystem.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Printer,
  RefreshCw,
  Receipt,
  Table2,
  WalletCards,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import khaavioIcon from "../assets/icon.png";
import "./TableSessions.css";

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getReference(id) {
  return String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase() || "--------";
}

function titleCase(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function TableSessions() {
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [guestTabs, setGuestTabs] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("open");
  const [expandedSessionId, setExpandedSessionId] = useState("");
  const [expandedInvoiceId, setExpandedInvoiceId] = useState("");
  const [workingSessionId, setWorkingSessionId] = useState("");
  const [workingInvoiceId, setWorkingInvoiceId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [printingInvoiceId, setPrintingInvoiceId] = useState("");

  const loadData = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
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
        .select("id, name, owner_id")
        .eq("owner_id", authData.user.id)
        .maybeSingle();

      if (restaurantError) throw restaurantError;
      if (!restaurantData) throw new Error("No restaurant workspace was found. Complete onboarding first.");

      const [sessionsResult, invoicesResult, tablesResult, guestTabsResult] = await Promise.all([
        supabase
          .from("table_sessions")
          .select("id, restaurant_id, table_id, status, billing_mode, opened_at, closed_at")
          .eq("restaurant_id", restaurantData.id)
          .order("opened_at", { ascending: false })
          .limit(100),
        supabase
          .from("table_session_invoices")
          .select("id, restaurant_id, table_id, session_id, guest_tab_id, invoice_number, total_amount, order_count, payment_status, issued_at, issued_by, paid_at, payment_method")
          .eq("restaurant_id", restaurantData.id)
          .order("issued_at", { ascending: false })
          .limit(100),
        supabase
          .from("restaurant_tables")
          .select("id, table_number")
          .eq("restaurant_id", restaurantData.id),
        supabase
          .from("table_session_tabs")
          .select("id, restaurant_id, table_id, session_id, display_name, status, opened_at, closed_at")
          .eq("restaurant_id", restaurantData.id)
          .order("opened_at", { ascending: false })
          .limit(300),
      ]);

      if (sessionsResult.error) throw sessionsResult.error;
      if (invoicesResult.error) throw invoicesResult.error;
      if (tablesResult.error) throw tablesResult.error;
      if (guestTabsResult.error) throw guestTabsResult.error;

      const sessionRows = sessionsResult.data || [];
      const sessionIds = sessionRows.map((session) => session.id);
      const tableRows = tablesResult.data || [];
      let orderRows = [];
      let itemRows = [];

      if (sessionIds.length) {
        const { data, error: ordersError } = await supabase
          .from("orders")
          .select("id, restaurant_id, table_id, session_id, guest_tab_id, customer_name, customer_phone, notes, status, total_amount, created_at")
          .eq("restaurant_id", restaurantData.id)
          .in("session_id", sessionIds)
          .order("created_at", { ascending: true });
        if (ordersError) throw ordersError;
        orderRows = data || [];
      }

      if (orderRows.length) {
        const { data, error: itemsError } = await supabase
          .from("order_items")
          .select("id, order_id, menu_item_id, item_name, unit_price, quantity, line_total")
          .in("order_id", orderRows.map((order) => order.id));
        if (itemsError) throw itemsError;
        itemRows = data || [];
      }

      setRestaurant(restaurantData);
      setSessions(sessionRows);
      setInvoices(invoicesResult.data || []);
      setTables(tableRows);
      setGuestTabs(guestTabsResult.data || []);
      setOrders(orderRows);
      setItems(itemRows);
    } catch (loadError) {
      setError(loadError?.message || "Could not load table sessions and invoices.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove("khaavio-printing-session-invoice");
      setPrintingInvoiceId("");
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      document.body.classList.remove("khaavio-printing-session-invoice");
    };
  }, []);

  const tableNames = useMemo(
    () => new Map(tables.map((table) => [table.id, table.table_number])),
    [tables],
  );
  const guestTabNames = useMemo(
    () => new Map(guestTabs.map((tab) => [tab.id, tab.display_name || "Guest"])),
    [guestTabs],
  );
  const tabsBySession = useMemo(() => {
    const map = new Map();
    for (const tab of guestTabs) {
      const current = map.get(tab.session_id) || [];
      current.push(tab);
      map.set(tab.session_id, current);
    }
    return map;
  }, [guestTabs]);
  const ordersBySession = useMemo(() => {
    const map = new Map();
    for (const order of orders) {
      const current = map.get(order.session_id) || [];
      current.push(order);
      map.set(order.session_id, current);
    }
    return map;
  }, [orders]);
  const itemsByOrder = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const current = map.get(item.order_id) || [];
      current.push(item);
      map.set(item.order_id, current);
    }
    return map;
  }, [items]);
  const openSessions = sessions.filter((session) => session.status === "open" || session.status === "billing");

  function getSessionTotal(sessionId) {
    return (ordersBySession.get(sessionId) || [])
      .filter((order) => order.status !== "cancelled")
      .reduce((total, order) => total + (Number(order.total_amount) || 0), 0);
  }

  function getGuestTabTotal(tabId) {
    return orders
      .filter((order) => order.guest_tab_id === tabId && order.status !== "cancelled")
      .reduce((total, order) => total + (Number(order.total_amount) || 0), 0);
  }

  async function finalizeGuestTab(tab) {
    const tabOrders = orders.filter((order) => order.guest_tab_id === tab.id && order.status !== "cancelled");
    if (!tabOrders.length) {
      setError("This guest tab has no billable orders yet.");
      return;
    }
    const confirmed = await confirmKhaavio(
      "Generate the final bill for " + (tab.display_name || "this guest") + "? Their tab will stop accepting new orders.",
    );
    if (!confirmed) return;
    setWorkingSessionId(tab.session_id);
    setError("");
    setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc("finalize_guest_tab_invoice", {
        p_guest_tab_id: tab.id,
      });
      if (rpcError) throw rpcError;
      const invoice = Array.isArray(data) ? data[0] : data;
      if (!invoice?.invoice_id || !invoice?.invoice_number) {
        throw new Error("The guest invoice could not be confirmed. Refresh the page before retrying.");
      }
      setNotice("Guest invoice " + invoice.invoice_number + " created for " + formatPrice(invoice.total_amount) + ".");
      setActiveTab("invoices");
      setExpandedInvoiceId(invoice.invoice_id);
      await loadData({ quiet: true });
    } catch (actionError) {
      setError(actionError?.message || "Could not generate the guest invoice.");
    } finally {
      setWorkingSessionId("");
    }
  }

  async function finalizeSession(session) {
    const currentOrders = (ordersBySession.get(session.id) || []).filter(
      (order) => order.status !== "cancelled",
    );
    if (!currentOrders.length) {
      setError("This table session has no billable orders yet.");
      return;
    }
    const tableNumber = tableNames.get(session.table_id) || "this table";
    const confirmed = await confirmKhaavio(
      `Generate the final bill and close ${tableNumber}? New QR orders after closing will start a new bill session.`,
    );
    if (!confirmed) return;

    setWorkingSessionId(session.id);
    setError("");
    setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc("finalize_table_session", {
        p_session_id: session.id,
      });
      if (rpcError) throw rpcError;
      const invoice = Array.isArray(data) ? data[0] : data;
      if (!invoice?.invoice_id || !invoice?.invoice_number) {
        throw new Error("The final bill could not be confirmed. Refresh the page before retrying.");
      }
      setNotice(`Final invoice ${invoice.invoice_number} created for ${formatPrice(invoice.total_amount)}.`);
      setActiveTab("invoices");
      setExpandedInvoiceId(invoice.invoice_id);
      await loadData({ quiet: true });
    } catch (actionError) {
      setError(actionError?.message || "Could not generate the final bill.");
    } finally {
      setWorkingSessionId("");
    }
  }

  async function markInvoicePaid(invoice) {
    if (invoice.payment_status === "paid") return;
    const confirmed = await confirmKhaavio(
      `Mark invoice ${invoice.invoice_number} (${formatPrice(invoice.total_amount)}) as paid via ${paymentMethod}?`,
    );
    if (!confirmed) return;

    setWorkingInvoiceId(invoice.id);
    setError("");
    setNotice("");
    try {
      const { error: rpcError } = await supabase.rpc(
        invoice.guest_tab_id ? "mark_guest_tab_invoice_paid" : "mark_table_invoice_paid",
        { p_invoice_id: invoice.id, p_payment_method: paymentMethod },
      );
      if (rpcError) throw rpcError;
      setNotice(`Invoice ${invoice.invoice_number} marked as paid.`);
      await loadData({ quiet: true });
    } catch (actionError) {
      setError(actionError?.message || "Could not record invoice payment.");
    } finally {
      setWorkingInvoiceId("");
    }
  }

  function printInvoice(invoice) {
    setExpandedInvoiceId(invoice.id);
    setPrintingInvoiceId(invoice.id);
    document.body.classList.add("khaavio-printing-session-invoice");
    window.setTimeout(() => window.print(), 150);
  }

  function renderSessionOrders(session, guestTabId = null) {
    const sessionOrders = (ordersBySession.get(session.id) || []).filter(
      (order) => !guestTabId || order.guest_tab_id === guestTabId,
    );
    if (!sessionOrders.length) {
      return <p className="ts-empty-inline">No orders have been linked to this session.</p>;
    }
    return (
      <div className="ts-order-list">
        {sessionOrders.map((order) => (
          <article className="ts-order-block" key={order.id}>
            <div className="ts-order-heading">
              <div>
                <strong>Order #{getReference(order.id)}</strong>
                <span>{formatDate(order.created_at)} · {order.customer_name || "Customer"}</span>
              </div>
              <div className="ts-order-amount">
                <strong>{formatPrice(order.total_amount)}</strong>
                <span className={`ts-status ts-status-${order.status}`}>{titleCase(order.status)}</span>
              </div>
            </div>
            <div className="ts-order-items">
              {(itemsByOrder.get(order.id) || []).map((item) => (
                <div className="ts-order-item" key={item.id}>
                  <span>{item.quantity} × {item.item_name}</span>
                  <strong>{formatPrice(item.line_total)}</strong>
                </div>
              ))}
              {!itemsByOrder.get(order.id)?.length && (
                <span className="ts-empty-inline">No item details available.</span>
              )}
            </div>
            {order.notes && <p className="ts-order-notes">Notes: {order.notes}</p>}
          </article>
        ))}
      </div>
    );
  }

  return (
    <main className="table-sessions-page">
      <header className="ts-header no-print">
        <Link to="/dashboard" className="ts-back"><ArrowLeft size={16} /> Dashboard</Link>
      </header>

      <div className="ts-main">
        <div className="ts-eyebrow no-print">RESTAURANT BILLING</div>
        <div className="ts-title-row no-print">
          <div>
            <h1>Table sessions & billing</h1>
            <p>{restaurant?.name || "Restaurant"} · Every table visit gets its own bill session.</p>
          </div>
          <button type="button" className="ts-refresh" onClick={() => loadData({ quiet: true })} disabled={refreshing || loading}>
            {refreshing ? <LoaderCircle size={16} className="ts-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>

        {error && <div className="ts-alert ts-alert-error no-print" role="alert"><CircleAlert size={17} /> <span>{error}</span></div>}
        {notice && <div className="ts-alert ts-alert-success no-print" role="status"><CheckCircle2 size={17} /> <span>{notice}</span></div>}

        {loading ? (
          <section className="ts-state"><LoaderCircle size={30} className="ts-spin" /><h2>Loading table sessions…</h2></section>
        ) : (
          <>
            <section className="ts-stats no-print">
              <article><span>Open tables</span><strong>{openSessions.length}</strong><small>Sessions accepting more QR orders</small></article>
              <article><span>Final invoices</span><strong>{invoices.length}</strong><small>Combined bills generated</small></article>
              <article><span>Unpaid invoices</span><strong>{invoices.filter((invoice) => invoice.payment_status === "unpaid").length}</strong><small>Awaiting payment confirmation</small></article>
            </section>

            <div className="ts-tabs no-print" role="tablist" aria-label="Billing views">
              <button type="button" role="tab" aria-selected={activeTab === "open"} className={activeTab === "open" ? "active" : ""} onClick={() => setActiveTab("open")}>Open sessions <span>{openSessions.length}</span></button>
              <button type="button" role="tab" aria-selected={activeTab === "invoices"} className={activeTab === "invoices" ? "active" : ""} onClick={() => setActiveTab("invoices")}>Final invoices <span>{invoices.length}</span></button>
            </div>

            {activeTab === "open" ? (
              openSessions.length ? (
                <section className="ts-session-list">
                  {openSessions.map((session) => {
                    const sessionOrders = ordersBySession.get(session.id) || [];
                    const total = getSessionTotal(session.id);
                    const tableNumber = tableNames.get(session.table_id) || "—";
                    const expanded = expandedSessionId === session.id;
                    return (
                      <article className="ts-session-card" key={session.id}>
                        <div className="ts-session-card-top">
                          <div className="ts-table-symbol"><Table2 size={20} /></div>
                          <div className="ts-session-summary">
                            <span className="ts-chip ts-chip-open">OPEN BILL</span>
                            <h2>Table {tableNumber}</h2>
                            <p><Clock3 size={13} /> Started {formatDate(session.opened_at)}</p>
                          </div>
                          <div className="ts-session-total"><span>Running total</span><strong>{formatPrice(total)}</strong><small>{sessionOrders.length} {sessionOrders.length === 1 ? "order" : "orders"}</small></div>
                        </div>
                        {session.billing_mode === "per_guest" && (
                          <div className="ts-guest-tabs">
                            <div className="ts-guest-tabs-heading">
                              <h3>Guest bills</h3>
                              <span>{(tabsBySession.get(session.id) || []).length} tabs</span>
                            </div>
                            {(tabsBySession.get(session.id) || []).length ? (
                              (tabsBySession.get(session.id) || []).map((tab) => {
                                const tabOrders = orders.filter((order) => order.guest_tab_id === tab.id);
                                const tabInvoice = invoices.find((invoice) => invoice.guest_tab_id === tab.id);
                                const tabTotal = tabInvoice ? Number(tabInvoice.total_amount) : getGuestTabTotal(tab.id);
                                return (
                                  <article className="ts-guest-tab-card" key={tab.id}>
                                    <div className="ts-guest-tab-summary">
                                      <div>
                                        <strong>{tab.display_name || "Guest"}</strong>
                                        <span>{titleCase(tab.status)} · {tabOrders.filter((order) => order.status !== "cancelled").length} orders</span>
                                      </div>
                                      <strong>{formatPrice(tabTotal)}</strong>
                                    </div>
                                    <div className="ts-guest-tab-actions no-print">
                                      {tab.status === "open" && !tabInvoice && (
                                        <button type="button" className="ts-primary-button" onClick={() => finalizeGuestTab(tab)} disabled={workingSessionId === tab.session_id}>
                                          {workingSessionId === tab.session_id ? <LoaderCircle size={16} className="ts-spin" /> : <Receipt size={16} />}
                                          Generate guest bill
                                        </button>
                                      )}
                                      {tabInvoice && (
                                        <button type="button" className="ts-secondary-button" onClick={() => { setActiveTab("invoices"); setExpandedInvoiceId(tabInvoice.id); }}>
                                          View invoice
                                        </button>
                                      )}
                                    </div>
                                  </article>
                                );
                              })
                            ) : (
                              <p className="ts-empty-inline">No guest tabs yet. Each customer gets a tab when they place their first order.</p>
                            )}
                          </div>
                        )}
                        <div className="ts-session-actions no-print">
                          <button type="button" className="ts-secondary-button" onClick={() => setExpandedSessionId(expanded ? "" : session.id)}>
                            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            {expanded ? "Hide orders" : "View orders"}
                          </button>
                          {session.billing_mode !== "per_guest" && (
                            <button type="button" className="ts-primary-button" onClick={() => finalizeSession(session)} disabled={workingSessionId === session.id}>
                              {workingSessionId === session.id ? <LoaderCircle size={16} className="ts-spin" /> : <Receipt size={16} />}
                              Generate final bill & close
                            </button>
                          )}
                        </div>
                        {expanded && <div className="ts-session-details">{renderSessionOrders(session)}</div>}
                      </article>
                    );
                  })}
                </section>
              ) : (
                <section className="ts-empty-state"><div><WalletCards size={24} /></div><h2>No open table sessions</h2><p>When a customer places the first QR order at a table, Khaavio will open a bill session automatically.</p></section>
              )
            ) : (
              invoices.length ? (
                <section className="ts-session-list">
                  {invoices.map((invoice) => {
                    const session = sessions.find((row) => row.id === invoice.session_id);
                    const tableNumber = tableNames.get(invoice.table_id) || "—";
                    const expanded = expandedInvoiceId === invoice.id;
                    return (
                      <article className="ts-session-card ts-invoice-card" key={invoice.id}>
                        <div className="ts-session-card-top">
                          <div className="ts-table-symbol ts-invoice-symbol"><Receipt size={20} /></div>
                          <div className="ts-session-summary">
                            <span className={`ts-chip ${invoice.payment_status === "paid" ? "ts-chip-paid" : "ts-chip-unpaid"}`}>{titleCase(invoice.payment_status)}</span>
                            <h2>{invoice.invoice_number}</h2>
                            <p><Table2 size={13} /> Table {tableNumber}{invoice.guest_tab_id ? " · " + (guestTabNames.get(invoice.guest_tab_id) || "Guest") : ""} · <CalendarDays size={13} /> {formatDate(invoice.issued_at)}</p>
                          </div>
                          <div className="ts-session-total"><span>Final total</span><strong>{formatPrice(invoice.total_amount)}</strong><small>{invoice.order_count} {invoice.order_count === 1 ? "order" : "orders"}</small></div>
                        </div>
                        <div className="ts-session-actions no-print">
                          <button type="button" className="ts-secondary-button" onClick={() => setExpandedInvoiceId(expanded ? "" : invoice.id)}>
                            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            {expanded ? "Hide bill details" : "View final bill"}
                          </button>
                          {invoice.payment_status === "unpaid" && (
                            <>
                              <label className="ts-payment-select-label">
                                <span>Payment</span>
                                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                                  <option value="UPI">UPI</option>
                                  <option value="Cash">Cash</option>
                                  <option value="Card">Card</option>
                                  <option value="Other">Other</option>
                                </select>
                              </label>
                              <button type="button" className="ts-primary-button" onClick={() => markInvoicePaid(invoice)} disabled={workingInvoiceId === invoice.id}>
                                {workingInvoiceId === invoice.id ? <LoaderCircle size={16} className="ts-spin" /> : <CheckCircle2 size={16} />}
                                Mark paid
                              </button>
                            </>
                          )}
                          <button type="button" className="ts-secondary-button" onClick={() => printInvoice(invoice)}><Printer size={16} /> Print</button>
                        </div>
                        {expanded && (
                          <section className={`ts-session-details ts-invoice-print-surface ${printingInvoiceId === invoice.id ? "print-target" : ""}`}>
                            <div className="ts-print-heading">
                              <img src={khaavioIcon} alt="" />
                              <div><span>{invoice.guest_tab_id ? "GUEST INVOICE" : "FINAL TABLE INVOICE"}</span><h2>{restaurant?.name || "Restaurant"}</h2><p>{invoice.invoice_number}</p>{invoice.guest_tab_id && <p>{guestTabNames.get(invoice.guest_tab_id) || "Guest"}</p>}</div>
                            </div>
                            <div className="ts-print-meta"><span>Table <strong>{tableNumber}</strong></span><span>Issued <strong>{formatDate(invoice.issued_at)}</strong></span><span>Payment <strong>{titleCase(invoice.payment_status)}</strong></span></div>
                            {session ? renderSessionOrders(session, invoice.guest_tab_id) : <p className="ts-empty-inline">Order details are unavailable for this invoice.</p>}
                            <div className="ts-print-grand-total"><span>FINAL TOTAL</span><strong>{formatPrice(invoice.total_amount)}</strong></div>
                            {invoice.payment_status === "paid" && <p className="ts-paid-note">Paid {invoice.payment_method ? `via ${invoice.payment_method}` : ""}{invoice.paid_at ? ` · ${formatDate(invoice.paid_at)}` : ""}</p>}
                            <p className="ts-print-footer">Thank you for dining with us · Powered by Khaavio</p>
                          </section>
                        )}
                      </article>
                    );
                  })}
                </section>
              ) : (
                <section className="ts-empty-state"><div><Receipt size={24} /></div><h2>No final invoices yet</h2><p>Generate a final bill from an open session. Each order will remain available in Order Receipts.</p></section>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}
