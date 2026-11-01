import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, Copy, Download, ExternalLink, LoaderCircle, QrCode, Share2, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabaseClient";
import { buildUpiIntentUrl, isValidUpiTransactionReference } from "../lib/upiPayment.js";
import "./PublicInvoicePayment.css";

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export default function PublicInvoicePayment({
  slug,
  tableToken,
  guestTabToken = null,
  invoice,
  paymentSettings,
  paymentSubmission = null,
  receiptItems = [],
  restaurantName = "",
  tableNumber = "",
  guestName = "",
  onRefresh,
}) {
  const [qrState, setQrState] = useState(null);
  const [reference, setReference] = useState("");
  const [localPaymentChoice, setLocalPaymentChoice] = useState(null);
  const [selectingMethod, setSelectingMethod] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const upiEnabled = paymentSettings?.upi_enabled === true && Boolean(paymentSettings?.upi_id);
  const counterEnabled = paymentSettings?.counter_payment_enabled !== false;
  const receiptWidth = paymentSettings?.receipt_paper_width === "58" ? "58" : "80";
  const invoiceUnpaid = invoice?.payment_status === "unpaid";
  const submissionPending = paymentSubmission?.status === "pending";
  const selectedMethod = localPaymentChoice?.invoiceId === invoice?.id
    ? localPaymentChoice.method
    : invoice?.payment_choice || "";

  useEffect(() => {
    const clearPrintState = () => {
      document.body.classList.remove("khaavio-printing-public-invoice", "khaavio-printing-public-invoice-58", "khaavio-printing-public-invoice-80");
      document.getElementById("khaavio-public-invoice-page-size")?.remove();
    };
    window.addEventListener("afterprint", clearPrintState);
    return () => {
      window.removeEventListener("afterprint", clearPrintState);
      clearPrintState();
    };
  }, []);

  function printPaidReceipt() {
    let pageStyle = document.getElementById("khaavio-public-invoice-page-size");
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "khaavio-public-invoice-page-size";
      document.head.appendChild(pageStyle);
    }
    pageStyle.textContent = "@page { size: " + receiptWidth + "mm auto; margin: 0; }";
    document.body.classList.remove("khaavio-printing-public-invoice-58", "khaavio-printing-public-invoice-80");
    document.body.classList.add("khaavio-printing-public-invoice", "khaavio-printing-public-invoice-" + receiptWidth);
    window.setTimeout(() => window.print(), 150);
  }

  async function sharePaidReceipt() {
    const receiptLines = Array.isArray(receiptItems) ? receiptItems : [];
    const message = [
      (restaurantName || paymentSettings?.payee_name || "Restaurant") + " — Payment Receipt",
      "Invoice: " + (invoice?.invoice_number || "—"),
      "Payment status: PAID",
      "Payment method: " + (invoice?.payment_method || "Confirmed by restaurant"),
      tableNumber ? "Table: " + tableNumber : "",
      guestName ? "Guest: " + guestName : "",
      "",
      ...receiptLines.map((item) => (Number(item.quantity) || 1) + " × " + (item.item_name || "Item") + " — " + formatPrice(item.line_total ?? ((Number(item.unit_price) || 0) * (Number(item.quantity) || 1)))),
      "",
      "TOTAL PAID: " + formatPrice(invoice?.total_amount),
      "Thank you for dining with us!",
    ].filter(Boolean).join("\n");

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Payment receipt", text: message });
        return;
      }
      window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
    } catch (shareError) {
      if (shareError?.name !== "AbortError") setError("Could not share this receipt. Please try again.");
    }
  }

  const qrKey = [
    invoice?.id || "",
    invoice?.invoice_number || "",
    invoice?.total_amount ?? "",
    paymentSettings?.upi_id || "",
    paymentSettings?.payee_name || "",
    selectedMethod,
  ].join(":");
  const qrData = qrState?.key === qrKey ? qrState : null;

  useEffect(() => {
    if (!upiEnabled || !invoiceUnpaid || selectedMethod !== "upi" || !invoice?.invoice_number) {
      return undefined;
    }

    let active = true;
    Promise.resolve()
      .then(() => {
        const intent = buildUpiIntentUrl({
          upiId: paymentSettings.upi_id,
          payeeName: paymentSettings.payee_name,
          amount: invoice.total_amount,
          invoiceNumber: invoice.invoice_number,
        });
        return QRCode.toDataURL(intent, {
          width: 224,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#183b2a", light: "#ffffff" },
        }).then((dataUrl) => ({ intent, dataUrl }));
      })
      .then(({ intent, dataUrl }) => {
        if (active) setQrState({ key: qrKey, intent, dataUrl, error: "" });
      })
      .catch((qrBuildError) => {
        if (active) {
          setQrState({
            key: qrKey,
            intent: "",
            dataUrl: "",
            error: qrBuildError?.message || "The UPI QR could not be prepared. You can still open your UPI app or copy the UPI ID.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [
    upiEnabled,
    invoiceUnpaid,
    selectedMethod,
    invoice?.id,
    invoice?.invoice_number,
    invoice?.total_amount,
    paymentSettings?.upi_id,
    paymentSettings?.payee_name,
    qrKey,
  ]);

  async function choosePaymentMethod(method) {
    if (!invoice?.id || !invoiceUnpaid || selectingMethod || submitting || submissionPending) return;
    if (method !== "upi" && method !== "counter") return;

    setSelectingMethod(true);
    setError("");
    setNotice("");
    try {
      const { error: selectionError } = await supabase.rpc(
        "khaavio_select_public_invoice_payment_method",
        {
          p_slug: slug,
          p_table_token: tableToken,
          p_invoice_id: invoice.id,
          p_guest_tab_token: guestTabToken,
          p_payment_method: method,
        },
      );
      if (selectionError) throw selectionError;
      setLocalPaymentChoice({ invoiceId: invoice.id, method });
      setNotice(method === "upi"
        ? "UPI selected. Pay the exact amount shown below."
        : "Pay at the counter selected. Please settle with restaurant staff.");
      await onRefresh?.();
    } catch (selectionError) {
      setError(selectionError?.message || "Could not select this payment method. Please refresh the bill.");
    } finally {
      setSelectingMethod(false);
    }
  }

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(paymentSettings.upi_id);
      setCopied(true);
      setError("");
    } catch {
      setError("Could not copy the UPI ID. Please select and copy it manually.");
    }
  }

  async function submitReference(event) {
    event.preventDefault();
    if (!invoice?.id || !invoiceUnpaid || selectedMethod !== "upi" || submitting || submissionPending) return;

    const cleanedReference = reference.trim();
    if (!isValidUpiTransactionReference(cleanedReference)) {
      setError("Enter a valid UPI transaction reference (6–80 letters or numbers).");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const { error: submitError } = await supabase.rpc(
        "khaavio_submit_public_invoice_upi_payment",
        {
          p_slug: slug,
          p_table_token: tableToken,
          p_invoice_id: invoice.id,
          p_guest_tab_token: guestTabToken,
          p_payment_reference: cleanedReference,
        },
      );
      if (submitError) throw submitError;
      setReference("");
      setNotice("Your UPI reference has been submitted. The restaurant will verify the payment before marking this bill as paid.");
      await onRefresh?.();
    } catch (submitError) {
      setError(submitError?.message || "Could not submit the UPI reference. Please ask restaurant staff for help.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!invoice) return null;

  if (invoice.payment_status === "paid") {
    const receiptLines = Array.isArray(receiptItems) ? receiptItems : [];
    return (
      <>
        <section className="public-invoice-payment public-invoice-payment-paid" aria-live="polite">
          <div className="public-invoice-payment-status-icon"><CheckCircle2 size={20} /></div>
          <div className="public-invoice-payment-paid-copy">
            <strong>Payment received</strong>
            <p>This bill is confirmed as paid by the restaurant.</p>
          </div>
          <div className="public-invoice-receipt-paid-actions">
            <button type="button" className="public-invoice-receipt-download" onClick={printPaidReceipt}>
              <Download size={16} />
              Download bill / Save PDF
            </button>
            <button type="button" className="public-invoice-receipt-share" onClick={sharePaidReceipt}>
              <Share2 size={16} />
              Share receipt
            </button>
          </div>
        </section>

        <section className="public-invoice-receipt-print-surface" aria-label="Paid invoice receipt">
          <header className="public-invoice-receipt-heading">
            <span>PAYMENT RECEIPT</span>
            <h1>{restaurantName || paymentSettings?.payee_name || "Restaurant"}</h1>
            {tableNumber && <p>Table {tableNumber}{guestName ? " · " + guestName : ""}</p>}
          </header>

          <div className="public-invoice-receipt-meta">
            <div><span>Invoice number</span><strong>{invoice.gst_document_number || invoice.invoice_number || "—"}</strong></div>
            {invoice.gst_document_type && <div><span>Document type</span><strong>{invoice.gst_document_type === "tax_invoice" ? "Tax Invoice" : invoice.gst_document_type === "bill_of_supply" ? "Bill of Supply" : "Receipt"}</strong></div>}
            <div><span>Bill issued</span><strong>{invoice.gst_document_issued_at || invoice.issued_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invoice.gst_document_issued_at || invoice.issued_at)) : "—"}</strong></div>
            <div><span>Payment status</span><strong>PAID</strong></div>
            <div><span>Payment method</span><strong>{invoice.payment_method || "Confirmed by restaurant"}</strong></div>
            {invoice.paid_at && <div><span>Paid at</span><strong>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invoice.paid_at))}</strong></div>}
            {invoice.supplier_legal_name && <div><span>Supplier legal name</span><strong>{invoice.supplier_legal_name}</strong></div>}
            {invoice.supplier_address && <div><span>Registered address</span><strong>{invoice.supplier_address}{invoice.supplier_city ? ", " + invoice.supplier_city : ""}{invoice.supplier_state ? ", " + invoice.supplier_state : ""}{invoice.supplier_postal_code ? " - " + invoice.supplier_postal_code : ""}</strong></div>}
            {invoice.supplier_phone && <div><span>Supplier phone</span><strong>{invoice.supplier_phone}</strong></div>}
            {invoice.gstin_snapshot && <div><span>Supplier GSTIN</span><strong>{invoice.gstin_snapshot}</strong></div>}
            {invoice.place_of_supply_state && <div><span>Place of supply</span><strong>{invoice.place_of_supply_state}</strong></div>}
            {invoice.sac_code && <div><span>SAC</span><strong>{invoice.sac_code}</strong></div>}
          </div>

          <div className="public-invoice-receipt-items">
            <div className="public-invoice-receipt-items-heading"><span>ITEM</span><span>AMOUNT</span></div>
            {receiptLines.length ? receiptLines.map((item) => (
              <div className="public-invoice-receipt-item" key={item.id || [item.order_reference, item.item_name, item.quantity].join("-")}>
                <div>
                  <strong>{Number(item.quantity) || 1} × {item.item_name || "Item"}</strong>
                  {item.order_reference && <small>Order #{item.order_reference}</small>}
                </div>
                <strong>{formatPrice(item.line_total ?? ((Number(item.unit_price) || 0) * (Number(item.quantity) || 1)))}</strong>
              </div>
            )) : (
              <p className="public-invoice-receipt-no-items">Item details are unavailable for this bill.</p>
            )}
          </div>

          <div className="public-invoice-receipt-totals">
            {Number(invoice.subtotal_amount) > 0 && <div><span>Items subtotal</span><strong>{formatPrice(invoice.subtotal_amount)}</strong></div>}
            {Number(invoice.discount_amount) > 0 && <div><span>Discount</span><strong>−{formatPrice(invoice.discount_amount)}</strong></div>}
            {Number(invoice.taxable_amount) > 0 && <div><span>Taxable value</span><strong>{formatPrice(invoice.taxable_amount)}</strong></div>}
            {Number(invoice.cgst_amount) > 0 && <div><span>CGST ({invoice.cgst_rate}%)</span><strong>{formatPrice(invoice.cgst_amount)}</strong></div>}
            {Number(invoice.sgst_amount) > 0 && <div><span>SGST ({invoice.sgst_rate}%)</span><strong>{formatPrice(invoice.sgst_amount)}</strong></div>}
            {Number(invoice.igst_amount) > 0 && <div><span>IGST ({invoice.igst_rate}%)</span><strong>{formatPrice(invoice.igst_amount)}</strong></div>}
            {Number(invoice.tax_amount) > 0 && <div><span>GST total {invoice.gst_inclusive ? "(included)" : ""}</span><strong>{formatPrice(invoice.tax_amount)}</strong></div>}
            <div className="public-invoice-receipt-grand-total"><span>TOTAL PAID</span><strong>{formatPrice(invoice.total_amount)}</strong></div>
          </div>

          <footer className="public-invoice-receipt-footer">
            <strong>Thank you for dining with us!</strong>
            <span>Powered by Khaavio</span>
          </footer>
        </section>
      </>
    );
  }

  if (!invoiceUnpaid) return null;

  const selectedMethodUnavailable =
    (selectedMethod === "upi" && !upiEnabled)
    || (selectedMethod === "counter" && !counterEnabled);
  const showMethodChoices = !selectedMethod || selectedMethodUnavailable;

  return (
    <section className="public-invoice-payment">
      <div className="public-invoice-payment-heading">
        <span className="public-invoice-payment-eyebrow">PAYMENT OPTIONS</span>
        <h3>Pay {formatPrice(invoice.total_amount)}</h3>
        <p>Choose how you want to pay. Payment goes directly to the restaurant; Khaavio does not collect it.</p>
      </div>

      {showMethodChoices ? (
        <div className="public-invoice-payment-choices" aria-label="Choose payment method">
          {upiEnabled && (
            <button
              type="button"
              className="public-invoice-payment-choice"
              aria-pressed={selectedMethod === "upi"}
              onClick={() => choosePaymentMethod("upi")}
              disabled={selectingMethod || submissionPending}
            >
              <QrCode size={19} />
              <span><strong>Pay via UPI</strong><small>Scan QR or open a UPI app</small></span>
              {selectingMethod && <LoaderCircle size={16} className="public-invoice-payment-spin" />}
            </button>
          )}
          {counterEnabled && (
            <button
              type="button"
              className="public-invoice-payment-choice"
              aria-pressed={selectedMethod === "counter"}
              onClick={() => choosePaymentMethod("counter")}
              disabled={selectingMethod || submissionPending}
            >
              <Banknote size={19} />
              <span><strong>Pay at counter</strong><small>Cash or method accepted by the restaurant</small></span>
              {selectingMethod && <LoaderCircle size={16} className="public-invoice-payment-spin" />}
            </button>
          )}
        </div>
      ) : (
        <div className="public-invoice-selected-method">
          <span>Selected payment method</span>
          <strong>{selectedMethod === "upi" ? "UPI payment" : "Pay at counter"}</strong>
          {!submissionPending && (
            <button type="button" onClick={() => setLocalPaymentChoice({ invoiceId: invoice.id, method: "" })}>Change method</button>
          )}
        </div>
      )}

      {selectedMethod === "upi" && upiEnabled && (
        <div className="public-invoice-upi-card">
          <div className="public-invoice-payment-method-title">
            <QrCode size={18} />
            <strong>Pay with UPI</strong>
          </div>
          <p className="public-invoice-upi-exact-amount">Exact bill amount: <strong>{formatPrice(invoice.total_amount)}</strong></p>
          {qrData?.dataUrl ? (
            <img className="public-invoice-upi-qr" src={qrData.dataUrl} alt={"UPI QR code for " + formatPrice(invoice.total_amount)} />
          ) : (
            <div className="public-invoice-upi-qr-placeholder">
              {qrData?.error || <LoaderCircle size={22} className="public-invoice-payment-spin" />}
            </div>
          )}
          <div className="public-invoice-upi-payee">
            <span>Pay to</span>
            <strong>{paymentSettings.payee_name || "Restaurant"}</strong>
            <code>{paymentSettings.upi_id}</code>
          </div>
          <div className="public-invoice-upi-actions">
            {qrData?.intent && (
              <a className="public-invoice-upi-open" href={qrData.intent}>
                <ExternalLink size={15} /> Open UPI app
              </a>
            )}
            <button type="button" className="public-invoice-upi-copy" onClick={copyUpiId}>
              <Copy size={14} /> {copied ? "Copied" : "Copy UPI ID"}
            </button>
          </div>
          <p className="public-invoice-upi-hint">Scan the QR from another device, or open your UPI app. Confirm the payee and amount in your UPI app before paying.</p>
          {submissionPending ? (
            <div className="public-invoice-submission-pending" role="status">
              <ShieldCheck size={17} />
              <span><strong>Reference submitted</strong><small>Awaiting verification by restaurant staff · {paymentSubmission.submitted_at ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(paymentSubmission.submitted_at)) : "Pending"}</small></span>
            </div>
          ) : (
            <form className="public-invoice-upi-reference-form" onSubmit={submitReference}>
              <label htmlFor="public-invoice-upi-reference">
                {paymentSubmission?.status === "rejected" ? "Submit a new UPI reference" : "Already paid? Enter UPI transaction reference"}
              </label>
              {paymentSubmission?.status === "rejected" && <p className="public-invoice-payment-error">The previous reference could not be confirmed. Check with restaurant staff or submit the correct reference.</p>}
              <input
                id="public-invoice-upi-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="e.g. 426512345678"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={80}
                required
              />
              <button type="submit" disabled={submitting || !reference.trim()}>
                {submitting ? <LoaderCircle size={16} className="public-invoice-payment-spin" /> : <ShieldCheck size={16} />}
                Submit for verification
              </button>
              <small>Submitting a reference does not mark the bill as paid. Staff will check the credit in the restaurant's bank / UPI account.</small>
            </form>
          )}
        </div>
      )}

      {selectedMethod === "counter" && counterEnabled && (
        <div className="public-invoice-counter-card">
          <strong>Pay at counter</strong>
          <p>Show this bill to restaurant staff and pay directly by cash or another method accepted at the counter. Staff will update the bill after receiving payment.</p>
        </div>
      )}

      {!upiEnabled && !counterEnabled && (
        <div className="public-invoice-no-methods">
          Online payment options are not enabled. Please ask restaurant staff for payment instructions.
        </div>
      )}

      {notice && <p className="public-invoice-payment-notice" role="status">{notice}</p>}
      {error && <p className="public-invoice-payment-error" role="alert">{error}</p>}
    </section>
  );
}
