export const GST_REGISTRATION_TYPES = Object.freeze({
  NEEDS_REVIEW: "needs_review",
  REGULAR: "regular",
  COMPOSITION: "composition",
  UNREGISTERED: "unregistered",
});

const GST_STATE_CODES = new Map([
  ["JAMMU AND KASHMIR", "01"], ["JAMMU & KASHMIR", "01"], ["JAMMU KASHMIR", "01"], ["J&K", "01"],
  ["HIMACHAL PRADESH", "02"], ["PUNJAB", "03"], ["CHANDIGARH", "04"],
  ["UTTARAKHAND", "05"], ["UTTARANCHAL", "05"], ["HARYANA", "06"], ["DELHI", "07"], ["NCT OF DELHI", "07"],
  ["RAJASTHAN", "08"], ["UTTAR PRADESH", "09"], ["BIHAR", "10"], ["SIKKIM", "11"],
  ["ARUNACHAL PRADESH", "12"], ["NAGALAND", "13"], ["MANIPUR", "14"], ["MIZORAM", "15"],
  ["TRIPURA", "16"], ["MEGHALAYA", "17"], ["ASSAM", "18"], ["WEST BENGAL", "19"],
  ["JHARKHAND", "20"], ["ODISHA", "21"], ["ORISSA", "21"], ["CHHATTISGARH", "22"],
  ["MADHYA PRADESH", "23"], ["GUJARAT", "24"], ["DAMAN AND DIU", "25"],
  ["DADRA AND NAGAR HAVELI", "26"], ["DADRA NAGAR HAVELI AND DAMAN DIU", "26"],
  ["DADRA & NAGAR HAVELI AND DAMAN & DIU", "26"], ["MAHARASHTRA", "27"],
  ["ANDHRA PRADESH", "37"], ["KARNATAKA", "29"], ["GOA", "30"], ["LAKSHADWEEP", "31"],
  ["KERALA", "32"], ["TAMIL NADU", "33"], ["PUDUCHERRY", "34"], ["PONDICHERRY", "34"],
  ["ANDAMAN AND NICOBAR ISLANDS", "35"], ["TELANGANA", "36"], ["LADAKH", "38"],
  ["OTHER TERRITORY", "97"],
]);

function normalizeStateName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\b(STATE OF|UNION TERRITORY OF)\b/g, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getIndianGstStateCode(state) {
  const normalized = normalizeStateName(state);
  if (/^\d{2}$/.test(normalized)) return normalized;
  return GST_STATE_CODES.get(normalized) || null;
}

export function getGstTaxType({ gstin, placeOfSupplyState }) {
  const supplierStateCode = String(gstin || "").trim().slice(0, 2);
  const placeOfSupplyStateCode = getIndianGstStateCode(placeOfSupplyState);
  if (!/^\d{2}$/.test(supplierStateCode) || !placeOfSupplyStateCode) return null;
  return supplierStateCode === placeOfSupplyStateCode ? "cgst_sgst" : "igst";
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateGstBreakdown({
  amount,
  totalRate,
  inclusive = false,
  taxType = "cgst_sgst",
}) {
  const baseAmount = Math.max(0, Number(amount) || 0);
  const rate = Number(totalRate);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100 || !["cgst_sgst", "igst"].includes(taxType)) {
    return {
      taxableAmount: money(baseAmount),
      taxAmount: 0,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: 0,
      igstAmount: 0,
      grandTotal: money(baseAmount),
      inclusive: false,
    };
  }

  const taxAmount = inclusive
    ? money(baseAmount * rate / (100 + rate))
    : money(baseAmount * rate / 100);
  const taxableAmount = inclusive ? money(baseAmount - taxAmount) : money(baseAmount);
  const grandTotal = inclusive ? money(baseAmount) : money(baseAmount + taxAmount);

  if (taxType === "igst") {
    return {
      taxableAmount,
      taxAmount,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: rate,
      igstAmount: taxAmount,
      grandTotal,
      inclusive: Boolean(inclusive),
    };
  }

  const cgstAmount = money(taxAmount / 2);
  const sgstAmount = money(taxAmount - cgstAmount);
  return {
    taxableAmount,
    taxAmount,
    cgstRate: rate / 2,
    cgstAmount,
    sgstRate: rate / 2,
    sgstAmount,
    igstRate: 0,
    igstAmount: 0,
    grandTotal,
    inclusive: Boolean(inclusive),
  };
}
