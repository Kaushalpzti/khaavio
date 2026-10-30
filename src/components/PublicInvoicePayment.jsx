import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, Copy, ExternalLink, LoaderCircle, QrCode, ShieldCheck } from "lucide-react";
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
  onRefresh,
}) {
  const [upiQr, setUpiQr] = useState("");
  const [upiIntent, setUpiIntent] = useState("");
  const [qrError, setQrError] = useState("");
  const [reference, setReference] = useState("");
  const [selectedMethod, setSelectedMethod] = useState(invoice?.payment_choice || "");
  const [selectingMethod, setSelectingMethod] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const upiEnabled = paymentSettings?.upi_enabled === true && Boolean(paymentSettings?.upi_id);
  const counterEnabled = paymentSettings?.counter_payment_enabled !== false;
  const invoiceUnpaid = invoice?.payment_status === "unpaid";
  const submissionPending = paymentSubmission?.status === "pending";

  useEffect(() => {
    setSelectedMethod(invoice?.payment_choice || "");
  }, [invoice?.id, invoice?.payment_choice]);

  useEffect(() => {
    let active = true;
    setUpiQr("");
    setUpiIntent("");
    setQrError("");

    if (!upiEnabled || !invoiceUnpaid || selectedMethod !== "upi" || !invoice?.invoice_number) {
      return () => { active = false; };
    }

    try {
      const intent = buildUpiIntentUrl({
        upiId: paymentSettings.upi_id,
        payeeName: paymentSettings.payee_name,
        amount: invoice.total_amount,
        invoiceNumber: invoice.invoice_number,
      });
      setUpiIntent(intent);
      QRCode.toDataURL(intent, {
        width: 224,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#183b2a", light: "#ffffff" },
      }).then((dataUrl) => {
        if (active) setUpiQr(dataUrl);
      }).catch(() => {
        if (active) setQrError("The UPI QR could not be prepared. You can still open your UPI app or copy the UPI ID.");
      });
    } catch (qrBuildError) {
      setQrError(qrBuildError?.message || "The restaurant UPI details are not valid.");
    }

    return () => { active = false; };
  }, [
    upiEnabled,
    invoiceUnpaid,
    selectedMethod,
    invoice?.invoice_number,
    invoice?.total_amount,
    paymentSettings?.upi_id,
    paymentSettings?.payee_name,
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
      setSelectedMethod(method);
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
    return (
      <section className="public-invoice-payment public-invoice-payment-paid" aria-live="polite">
        <div className="public-invoice-payment-status-icon"><CheckCircle2 size={20} /></div>
        <div>
          <strong>Payment received</strong>
          <p>This bill is marked paid by the restaurant.</p>
        </div>
      </section>
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
          <span>{selectedMethod === "upi" ? "Selected payment method" : "Selected payment method"}</span>
          <strong>{selectedMethod === "upi" ? "UPI payment" : "Pay at counter"}</strong>
          {!submissionPending && (
            <button type="button" onClick={() => setSelectedMethod("")}>Change method</button>
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
          {upiQr ? (
            <img className="public-invoice-upi-qr" src={upiQr} alt={"UPI QR code for " + formatPrice(invoice.total_amount)} />
          ) : (
            <div className="public-invoice-upi-qr-placeholder">
              {qrError ? <span>{qrError}</span> : <LoaderCircle size={22} className="public-invoice-payment-spin" />}
            </div>
          )}
          <div className="public-invoice-upi-payee">
            <span>Pay to</span>
            <strong>{paymentSettings.payee_name || "Restaurant"}</strong>
            <code>{paymentSettings.upi_id}</code>
          </div>
          <div className="public-invoice-upi-actions">
            {upiIntent && (
              <a className="public-invoice-upi-open" href={upiIntent}>
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
