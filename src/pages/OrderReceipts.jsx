import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  LoaderCircle,
  Printer,
  Search,
  Share2,
  Store,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { normalizeTableNumber } from "../lib/tableNumber";
import { buildOrderReceiptShareText, getWhatsAppReceiptUrl, printCustomerOrderReceipt } from "../lib/thermalPrinting.js";
import "./OrderReceipts.css";

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

export default function OrderReceipts() {
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [receiptWidth, setReceiptWidth] = useState("80");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReceipts() {
      setLoading(true);
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
          .select("id, name, phone, contact_email, address, city, state, postal_code, receipt_paper_width")
          .eq("owner_id", authData.user.id)
          .maybeSingle();

        if (restaurantError) throw restaurantError;
        if (!restaurantData) {
          throw new Error("No restaurant workspace was found. Complete onboarding first.");
        }
        if (!active) return;
        setRestaurant(restaurantData);
        setReceiptWidth(restaurantData.receipt_paper_width === "58" ? "58" : "80");

        const [ordersResult, tablesResult] = await Promise.all([
          supabase
            .from("orders")
            .select("id, restaurant_id, table_id, customer_name, customer_phone, notes, status, total_amount, discount_amount, coupon_code, created_at")
            .eq("restaurant_id", restaurantData.id)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("restaurant_tables")
            .select("id, table_number")
            .eq("restaurant_id", restaurantData.id),
        ]);

        if (ordersResult.error) throw ordersResult.error;
        if (tablesResult.error) throw tablesResult.error;

        const orderRows = ordersResult.data || [];
        const tableNames = new Map(
          (tablesResult.data || []).map((table) => [table.id, table.table_number]),
        );
        let itemRows = [];

        if (orderRows.length) {
          const { data, error: itemsError } = await supabase
            .from("order_items")
            .select("id, order_id, menu_item_id, item_name, unit_price, quantity, line_total, selected_options")
            .in("order_id", orderRows.map((order) => order.id));
          if (itemsError) throw itemsError;
          itemRows = data || [];
        }

        const itemsByOrder = new Map();
        for (const item of itemRows) {
          const current = itemsByOrder.get(item.order_id) || [];
          current.push(item);
          itemsByOrder.set(item.order_id, current);
        }

        if (!active) return;
        setOrders(
          orderRows.map((order) => ({
            ...order,
            tableNumber: tableNames.get(order.table_id) ?? null,
            items: itemsByOrder.get(order.id) || [],
          })),
        );
      } catch (loadError) {
        console.error("Could not load order receipts:", loadError);
        if (active) setError(loadError?.message || "Could not load order receipts.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadReceipts();
    return () => {
      active = false;
    };
  }, [navigate]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((order) => {
      const searchable = [
        getReference(order.id),
        order.customer_name,
        order.customer_phone,
        order.tableNumber,
        order.status,
      ].join(" ").toLowerCase();
      return searchable.includes(query);
    });
  }, [orders, search]);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;

  function handlePrint() {
    const printed = printCustomerOrderReceipt({
      restaurant,
      order: selectedOrder,
      widthMm: receiptWidth,
    });
    if (!printed) setError("The print window was blocked. Allow pop-ups for this site and try again.");
  }

  async function handleShareReceipt() {
    if (!selectedOrder) return;
    const message = buildOrderReceiptShareText({ restaurant, order: selectedOrder });
    const whatsappUrl = getWhatsAppReceiptUrl(selectedOrder.customer_phone, message);

    if (whatsappUrl) {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Order receipt", text: message });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        setNotice("Receipt details copied. You can paste and share them with the customer.");
        return;
      }
      setError("Receipt sharing is not available in this browser. Add a customer phone number to share through WhatsApp.");
    } catch (shareError) {
      if (shareError?.name !== "AbortError") setError("Could not share this receipt. Please try again.");
    }
  }

  return (
    <main className="order-receipts-page">
      <header className="order-receipts-header no-print">
        <Link to="/dashboard" className="order-receipts-back">
          <ArrowLeft size={17} /> Dashboard
        </Link>
      </header>

      <div className="order-receipts-main">
        {!selectedOrder ? (
          <>
            <div className="order-receipts-heading no-print">
              <div className="order-receipts-eyebrow">RESTAURANT OPERATIONS</div>
              <h1>Order receipts</h1>
              <p>Preview, print or save receipts for your recent customer orders.</p>
            </div>

            {error && <div className="order-receipts-alert" role="alert">{error}</div>}
            {notice && <div className="order-receipts-notice" role="status">{notice}</div>}

            <div className="order-receipts-toolbar no-print">
              <label className="order-receipts-search">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search order, customer, phone or table..."
                  aria-label="Search order receipts"
                />
              </label>
              <span className="order-receipts-count">{filteredOrders.length} orders</span>
            </div>

            {loading ? (
              <div className="order-receipts-state">
                <LoaderCircle size={28} className="order-receipts-spinner" />
                <p>Loading recent orders...</p>
              </div>
            ) : filteredOrders.length ? (
              <div className="order-receipts-list no-print">
                {filteredOrders.map((order) => (
                  <article className="order-receipt-row" key={order.id}>
                    <div className="order-receipt-row-icon"><ClipboardList size={20} /></div>
                    <div className="order-receipt-row-main">
                      <div className="order-receipt-row-title">
                        <strong>Order #{getReference(order.id)}</strong>
                        <span className={`order-receipt-status status-${order.status}`}>{titleCase(order.status)}</span>
                      </div>
                      <p>{order.customer_name || "Walk-in customer"} · Table {normalizeTableNumber(order.tableNumber) || "—"}</p>
                      <span className="order-receipt-row-date"><CalendarDays size={13} /> {formatDate(order.created_at)}</span>
                    </div>
                    <div className="order-receipt-row-end">
                      <strong>{formatPrice(order.total_amount)}</strong>
                      <button type="button" onClick={() => setSelectedOrderId(order.id)}>
                        View receipt <ChevronRight size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="order-receipts-empty">
                <div><ClipboardList size={25} /></div>
                <h2>{orders.length ? "No matching orders" : "No orders yet"}</h2>
                <p>{orders.length ? "Try a different search term." : "Orders placed from your published menu will appear here."}</p>
                {orders.length > 0 && <button type="button" onClick={() => setSearch("")}>Clear search</button>}
              </div>
            )}
            {!loading && orders.length === 100 && (
              <p className="order-receipts-footnote no-print">Showing the latest 100 orders.</p>
            )}
          </>
        ) : (
          <>
            {notice && <div className="order-receipts-notice no-print" role="status">{notice}</div>}
            {error && <div className="order-receipts-alert no-print" role="alert">{error}</div>}
            <div className="order-receipt-preview-toolbar no-print">
              <button type="button" className="order-receipt-secondary-button" onClick={() => setSelectedOrderId("")}>
                <ArrowLeft size={16} /> Back to orders
              </button>
              <label className="order-receipt-width-select-label">
                <span>Paper</span>
                <select value={receiptWidth} onChange={(event) => setReceiptWidth(event.target.value)} aria-label="Receipt paper width">
                  <option value="58">58mm</option>
                  <option value="80">80mm</option>
                </select>
              </label>
              <button type="button" className="order-receipt-secondary-button" onClick={handleShareReceipt}>
                <Share2 size={16} /> Share receipt
              </button>
              <button type="button" className="order-receipt-print-button" onClick={handlePrint}>
                <Printer size={17} /> Print / Save PDF
              </button>
            </div>

            <section className="receipt-paper" aria-label={`Receipt for order ${getReference(selectedOrder.id)}`}>
              <div className="receipt-logo"><Store size={21} /></div>
              <h1>{restaurant?.name || "Restaurant"}</h1>
              {[restaurant?.address, [restaurant?.city, restaurant?.state, restaurant?.postal_code].filter(Boolean).join(", ")]
                .filter(Boolean)
                .map((line, index) => <p className="receipt-small-line" key={`${line}-${index}`}>{line}</p>)}
              {restaurant?.phone && <p className="receipt-small-line">Phone: {restaurant.phone}</p>}
              {restaurant?.contact_email && <p className="receipt-small-line">{restaurant.contact_email}</p>}

              <div className="receipt-divider receipt-dashed" />
              <div className="receipt-title-line">
                <strong>ORDER RECEIPT</strong>
                <span>#{getReference(selectedOrder.id)}</span>
              </div>
              <div className="receipt-meta-line"><span>Date</span><span>{formatDate(selectedOrder.created_at)}</span></div>
              <div className="receipt-meta-line"><span>Order status</span><span>{titleCase(selectedOrder.status)}</span></div>
              <div className="receipt-meta-line"><span>Table</span><span>{normalizeTableNumber(selectedOrder.tableNumber) || "—"}</span></div>
              <div className="receipt-meta-line"><span>Customer</span><span>{selectedOrder.customer_name || "Walk-in customer"}</span></div>
              {selectedOrder.customer_phone && <div className="receipt-meta-line"><span>Phone</span><span>{selectedOrder.customer_phone}</span></div>}

              <div className="receipt-divider receipt-dashed" />
              <div className="receipt-items-heading"><span>ITEM</span><span>AMOUNT</span></div>
              {selectedOrder.items.map((item) => (
                <div className="receipt-item" key={item.id}>
                  <div className="receipt-item-main">
                    <span>{item.item_name}</span>
                    <small>{formatPrice(item.unit_price)} × {item.quantity}</small>
                  </div>
                  <strong>{formatPrice(item.line_total)}</strong>
                </div>
              ))}
              <div className="receipt-divider receipt-dashed" />
              {Number(selectedOrder.discount_amount) > 0 && <div className="receipt-total-line"><span>Coupon {selectedOrder.coupon_code || "discount"}</span><strong>−{formatPrice(selectedOrder.discount_amount)}</strong></div>}
              <div className="receipt-total-line"><span>TOTAL</span><strong>{formatPrice(selectedOrder.total_amount)}</strong></div>
              {selectedOrder.notes && (
                <div className="receipt-notes"><strong>Order notes</strong><p>{selectedOrder.notes}</p></div>
              )}
              <div className="receipt-divider receipt-dashed" />
              <p className="receipt-thank-you">Thank you for dining with us!</p>
              <p className="receipt-footer">Powered by Khaavio · Every Table, Digitally Connected.</p>
            </section>
            <p className="receipt-screen-hint no-print">Print in 58mm or 80mm thermal format, or choose “Save as PDF” in your browser print dialog.</p>
          </>
        )}
      </div>
    </main>
  );
}
