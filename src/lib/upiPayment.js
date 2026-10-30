export function normalizeUpiId(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidUpiId(value) {
  const upiId = normalizeUpiId(value);
  return /^[a-z0-9][a-z0-9._-]{0,255}@[a-z0-9][a-z0-9.-]{1,63}$/.test(upiId);
}

export function isValidUpiTransactionReference(value) {
  return /^[a-zA-Z0-9-]{6,80}$/.test(String(value || "").trim());
}

export function buildUpiIntentUrl({ upiId, payeeName, amount, invoiceNumber }) {
  const normalizedUpiId = normalizeUpiId(upiId);
  const numericAmount = Number(amount);
  const normalizedPayee = String(payeeName || "").trim();
  const normalizedInvoice = String(invoiceNumber || "").trim();

  if (!isValidUpiId(normalizedUpiId)) {
    throw new Error("This restaurant has not configured a valid UPI ID.");
  }
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("A valid bill amount is required for UPI payment.");
  }
  if (!normalizedInvoice) {
    throw new Error("The invoice number is missing.");
  }

  const params = new URLSearchParams({
    pa: normalizedUpiId,
    pn: normalizedPayee || "Restaurant",
    am: numericAmount.toFixed(2),
    cu: "INR",
    tn: "Khaavio " + normalizedInvoice,
  });

  return "upi://pay?" + params.toString();
}
