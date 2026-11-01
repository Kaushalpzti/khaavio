export function normalizeReceiptWidth(value) {
  return value === "58" || value === 58 ? "58" : "80";
}

export function formatThermalPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatThermalDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getOrderReference(order) {
  return String(order?.id || "")
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase() || "UNKNOWN";
}

function getFulfillmentLabel(order) {
  if (order?.service_mode === "pickup") {
    return "Pickup" + (order.pickup_eta_minutes === 0 ? " · ASAP" : order.pickup_eta_minutes ? " · " + order.pickup_eta_minutes + " min" : "");
  }
  const table = order?.tableNumber ?? order?.table_number ?? order?.tableNumberLabel;
  return table ? "Table " + table : "Dine-in";
}

function getSelectedOptions(item) {
  if (!Array.isArray(item?.selected_options)) return [];
  return item.selected_options
    .map((option) => [option.group_name, option.name].filter(Boolean).join(": "))
    .filter(Boolean);
}

function openThermalPrintWindow(title, widthValue, bodyHtml) {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const width = normalizeReceiptWidth(widthValue);
  const paperWidth = width + "mm";
  const printWindow = window.open("", "_blank", "popup,width=420,height=760");
  if (!printWindow) return false;

  const documentHtml = [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>", escapeHtml(title), "</title>",
    "<style>",
    "@page{size:", paperWidth, " auto;margin:0}",
    "*{box-sizing:border-box}",
    "html,body{width:", paperWidth, ";min-width:", paperWidth, ";margin:0;padding:0;background:#fff;color:#111}",
    "body{font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    ".thermal-paper{width:", paperWidth, ";padding:", width === "58" ? "3mm" : "4mm", ";margin:0 auto}",
    ".center{text-align:center}",
    ".brand{font-size:15px;font-weight:800;line-height:1.2;overflow-wrap:anywhere}",
    ".muted{color:#444;font-size:9px;overflow-wrap:anywhere}",
    ".subtitle{font-size:11px;font-weight:800;letter-spacing:.6px;margin-top:5px}",
    ".rule{border:0;border-top:1px dashed #333;margin:8px 0}",
    ".meta{display:flex;justify-content:space-between;gap:8px;margin:3px 0}",
    ".meta span:first-child{color:#444}",
    ".meta span:last-child{text-align:right;overflow-wrap:anywhere}",
    ".item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;margin:6px 0;align-items:start}",
    ".item-main{min-width:0;overflow-wrap:anywhere}",
    ".item-name{font-weight:700;overflow-wrap:anywhere}",
    ".item-sub{font-size:9px;color:#444;margin-top:2px;overflow-wrap:anywhere}",
    ".item-amount{font-weight:700;text-align:right;white-space:nowrap}",
    ".qty{font-weight:800;white-space:nowrap}",
    ".options{font-size:9px;color:#333;margin:3px 0 0 16px;overflow-wrap:anywhere}",
    ".notes{border:1px solid #222;padding:6px;margin:8px 0;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere}",
    ".total{display:flex;justify-content:space-between;gap:8px;font-size:13px;font-weight:800;margin-top:7px}",
    ".footer{font-size:8px;text-align:center;color:#444;margin-top:10px}",
    ".keep{break-inside:avoid;page-break-inside:avoid}",
    "@media print{html,body{width:", paperWidth, "!important;margin:0!important;padding:0!important}.thermal-paper{width:", paperWidth, "!important;margin:0!important}}",
    "</style></head><body><main class='thermal-paper'>",
    bodyHtml,
    "</main></body></html>",
  ].join("");

  let printStarted = false;
  const startPrint = () => {
    if (printStarted || printWindow.closed) return;
    printStarted = true;
    printWindow.focus();
    printWindow.print();
  };

  printWindow.addEventListener("afterprint", () => {
    printWindow.close();
  }, { once: true });

  printWindow.document.open();
  printWindow.document.write(documentHtml);
  printWindow.document.close();
  printWindow.addEventListener("load", startPrint, { once: true });
  window.setTimeout(startPrint, 500);
  return true;
}

export function printKitchenOrderTicket({ restaurantName, order, widthMm = "80" }) {
  if (!order) return false;

  const reference = getOrderReference(order);
  const fulfillment = getFulfillmentLabel(order);
  const items = Array.isArray(order.items) ? order.items : [];
  const itemHtml = items.length
    ? items.map((item) => {
      const options = getSelectedOptions(item);
      return [
        "<div class='keep'>",
        "<div class='item'>",
        "<span class='item-main'><span class='qty'>", escapeHtml(item.quantity || 1), " × </span>",
        "<span class='item-name'>", escapeHtml(item.item_name || "Menu item"), "</span></span>",
        "</div>",
        options.length ? "<div class='options'>" + options.map(escapeHtml).join("<br>") + "</div>" : "",
        "</div>",
      ].join("");
    }).join("")
    : "<p>No item details found.</p>";

  const html = [
    "<header class='center'>",
    "<div class='brand'>", escapeHtml(restaurantName || "Restaurant"), "</div>",
    "<div class='subtitle'>KITCHEN ORDER TICKET</div>",
    "</header>",
    "<hr class='rule'>",
    "<div class='meta'><span>Order</span><strong>#", escapeHtml(reference), "</strong></div>",
    documentType !== "receipt" ? "<div class='meta'><span>Document number</span><strong>" + escapeHtml(order.gst_document_number || reference) + "</strong></div>" : "",
    "<div class='meta'><span>Service</span><strong>", escapeHtml(fulfillment), "</strong></div>",
    "<div class='meta'><span>Time</span><strong>", escapeHtml(formatThermalDate(order.created_at)), "</strong></div>",
    "<div class='meta'><span>Customer</span><strong>", escapeHtml(order.customer_name || "Guest"), "</strong></div>",
    order.guestTabName || order.guest_tab_name
      ? "<div class='meta'><span>Guest</span><strong>" + escapeHtml(order.guestTabName || order.guest_tab_name) + "</strong></div>"
      : "",
    "<hr class='rule'>",
    "<div class='subtitle'>ITEMS · ", String(items.length), "</div>",
    itemHtml,
    order.notes ? "<div class='notes'>SPECIAL INSTRUCTIONS<br>" + escapeHtml(order.notes) + "</div>" : "",
    "<hr class='rule'>",
    "<div class='footer'>KOT · Powered by Khaavio</div>",
  ].join("");

  return openThermalPrintWindow("KOT " + reference, widthMm, html);
}

export function printCustomerOrderReceipt({ restaurant, order, widthMm = "80" }) {
  if (!order) return false;

  const reference = getOrderReference(order);
  const items = Array.isArray(order.items) ? order.items : [];
  const address = [
    restaurant?.address,
    [restaurant?.city, restaurant?.state, restaurant?.postal_code].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");

  const itemHtml = items.length
    ? items.map((item) => {
      const options = getSelectedOptions(item);
      return [
        "<div class='item keep'>",
        "<div class='item-main'><div class='item-name'>", escapeHtml(item.item_name || "Menu item"), "</div>",
        "<div class='item-sub'>", escapeHtml(formatThermalPrice(item.unit_price)), " × ", escapeHtml(item.quantity || 1), "</div>",
        options.length ? "<div class='item-sub'>" + options.map(escapeHtml).join(" · ") + "</div>" : "",
        "</div><strong class='item-amount'>", escapeHtml(formatThermalPrice(item.line_total)), "</strong></div>",
      ].join("");
    }).join("")
    : "<p class='muted'>Item details unavailable.</p>";

  const documentType = order.gst_document_type_snapshot || "receipt";
  const payableTotal = Number(order.grand_total ?? order.total_amount) || 0;
  const gstDocumentHtml = documentType === "tax_invoice" || documentType === "bill_of_supply"
    ? [
      "<div class='gst-document'>",
      "<div class='meta'><strong>", documentType === "tax_invoice" ? "TAX INVOICE" : "BILL OF SUPPLY", "</strong><strong>", escapeHtml(order.gst_document_number || reference), "</strong></div>",
      order.gst_supplier_name_snapshot ? "<div class='muted'>" + escapeHtml(order.gst_supplier_name_snapshot) + "</div>" : "",
      order.gst_supplier_address_snapshot ? "<div class='muted'>" + escapeHtml(order.gst_supplier_address_snapshot) + "</div>" : "",
      [order.gst_supplier_city_snapshot, order.gst_supplier_state_snapshot, order.gst_supplier_postal_code_snapshot].filter(Boolean).length
        ? "<div class='muted'>" + escapeHtml([order.gst_supplier_city_snapshot, order.gst_supplier_state_snapshot, order.gst_supplier_postal_code_snapshot].filter(Boolean).join(", ")) + "</div>"
        : "",
      order.gst_supplier_phone_snapshot ? "<div class='muted'>Phone: " + escapeHtml(order.gst_supplier_phone_snapshot) + "</div>" : "",
      order.gstin_snapshot ? "<div class='meta'><span>GSTIN</span><strong>" + escapeHtml(order.gstin_snapshot) + "</strong></div>" : "",
      Number(order.gst_taxable_amount) > 0 ? "<div class='meta'><span>Taxable value</span><strong>" + escapeHtml(formatThermalPrice(order.gst_taxable_amount)) + "</strong></div>" : "",
      Number(order.gst_cgst_amount_snapshot) > 0 ? "<div class='meta'><span>CGST (" + escapeHtml(order.gst_cgst_rate_snapshot) + "%)</span><strong>" + escapeHtml(formatThermalPrice(order.gst_cgst_amount_snapshot)) + "</strong></div>" : "",
      Number(order.gst_sgst_amount_snapshot) > 0 ? "<div class='meta'><span>SGST (" + escapeHtml(order.gst_sgst_rate_snapshot) + "%)</span><strong>" + escapeHtml(formatThermalPrice(order.gst_sgst_amount_snapshot)) + "</strong></div>" : "",
      Number(order.gst_igst_amount_snapshot) > 0 ? "<div class='meta'><span>IGST (" + escapeHtml(order.gst_igst_rate_snapshot) + "%)</span><strong>" + escapeHtml(formatThermalPrice(order.gst_igst_amount_snapshot)) + "</strong></div>" : "",
      Number(order.gst_amount) > 0 ? "<div class='meta'><span>GST total" + (order.gst_inclusive_snapshot ? " (included)" : "") + "</span><strong>" + escapeHtml(formatThermalPrice(order.gst_amount)) + "</strong></div>" : "",
      order.gst_place_of_supply_state_snapshot ? "<div class='muted'>Place of supply: " + escapeHtml(order.gst_place_of_supply_state_snapshot) + "</div>" : "",
      order.gst_sac_code_snapshot ? "<div class='muted'>SAC: " + escapeHtml(order.gst_sac_code_snapshot) + "</div>" : "",
      "</div>",
    ].join("")
    : "";

  const html = [
    "<header class='center'>",
    "<div class='brand'>", escapeHtml(restaurant?.name || "Restaurant"), "</div>",
    address ? "<div class='muted'>" + escapeHtml(address) + "</div>" : "",
    restaurant?.phone ? "<div class='muted'>Phone: " + escapeHtml(restaurant.phone) + "</div>" : "",
    restaurant?.contact_email ? "<div class='muted'>" + escapeHtml(restaurant.contact_email) + "</div>" : "",
    "<div class='subtitle'>", documentType === "tax_invoice" ? "TAX INVOICE" : documentType === "bill_of_supply" ? "BILL OF SUPPLY" : "ORDER RECEIPT", "</div>",
    "</header>",
    "<hr class='rule'>",
    "<div class='meta'><span>Order</span><strong>#", escapeHtml(reference), "</strong></div>",
    "<div class='meta'><span>Date</span><span>", escapeHtml(formatThermalDate(order.created_at)), "</span></div>",
    "<div class='meta'><span>Status</span><span>", escapeHtml(order.status || "received"), "</span></div>",
    "<div class='meta'><span>Service</span><span>", escapeHtml(getFulfillmentLabel(order)), "</span></div>",
    "<div class='meta'><span>Customer</span><span>", escapeHtml(order.customer_name || "Walk-in customer"), "</span></div>",
    order.customer_phone ? "<div class='meta'><span>Phone</span><span>" + escapeHtml(order.customer_phone) + "</span></div>" : "",
    "<hr class='rule'>",
    "<div class='meta'><strong>ITEM</strong><strong>AMOUNT</strong></div>",
    itemHtml,
    "<hr class='rule'>",
    Number(order.discount_amount) > 0
      ? "<div class='meta'><span>Discount" + (order.coupon_code ? " (" + escapeHtml(order.coupon_code) + ")" : "") + "</span><strong>−" + escapeHtml(formatThermalPrice(order.discount_amount)) + "</strong></div>"
      : "",
    gstDocumentHtml,
    "<div class='total'><span>", documentType === "tax_invoice" ? "AMOUNT PAYABLE" : "TOTAL", "</span><strong>", escapeHtml(formatThermalPrice(payableTotal)), "</strong></div>",
    order.notes ? "<div class='notes'>ORDER NOTES<br>" + escapeHtml(order.notes) + "</div>" : "",
    "<hr class='rule'>",
    "<div class='center' style='font-weight:700;margin-top:8px'>Thank you for dining with us!</div>",
    "<div class='footer'>Powered by Khaavio · Every Table, Digitally Connected.</div>",
  ].join("");

  return openThermalPrintWindow("Order Receipt " + reference, widthMm, html);
}

export function buildOrderReceiptShareText({ restaurant, order }) {
  if (!order) return "";
  const items = Array.isArray(order.items) ? order.items : [];
  const lines = [
    "*" + (restaurant?.name || "Restaurant") + " — Order Receipt*",
    "Order #" + getOrderReference(order),
    "Date: " + formatThermalDate(order.created_at),
    "Customer: " + (order.customer_name || "Walk-in customer"),
    "Service: " + getFulfillmentLabel(order),
    "",
    "*Items*",
    ...items.map((item) =>
      (Number(item.quantity) || 1) + " × " + (item.item_name || "Menu item") + " — " + formatThermalPrice(item.line_total),
    ),
    "",
    ...(order.gst_document_type_snapshot && order.gst_document_type_snapshot !== "receipt"
      ? [
        (order.gst_document_type_snapshot === "tax_invoice" ? "Tax Invoice: " : "Bill of Supply: ") + (order.gst_document_number || getOrderReference(order)),
        order.gst_supplier_name_snapshot || "",
        order.gstin_snapshot ? "GSTIN: " + order.gstin_snapshot : "",
        Number(order.gst_taxable_amount) > 0 ? "Taxable value: " + formatThermalPrice(order.gst_taxable_amount) : "",
        Number(order.gst_cgst_amount_snapshot) > 0 ? "CGST (" + order.gst_cgst_rate_snapshot + "%): " + formatThermalPrice(order.gst_cgst_amount_snapshot) : "",
        Number(order.gst_sgst_amount_snapshot) > 0 ? "SGST (" + order.gst_sgst_rate_snapshot + "%): " + formatThermalPrice(order.gst_sgst_amount_snapshot) : "",
        Number(order.gst_igst_amount_snapshot) > 0 ? "IGST (" + order.gst_igst_rate_snapshot + "%): " + formatThermalPrice(order.gst_igst_amount_snapshot) : "",
      ].filter(Boolean)
      : []),
    "Total: " + formatThermalPrice(order.grand_total ?? order.total_amount),
    "Status: " + (order.status || "received"),
    "",
    "Thank you for dining with " + (restaurant?.name || "us") + "!",
  ];
  return lines.join("\n");
}

export function getWhatsAppReceiptUrl(phone, message) {
  let normalized = String(phone || "").replace(/\D/g, "");
  if (normalized.startsWith("00")) normalized = normalized.slice(2);
  if (normalized.length === 11 && normalized.startsWith("0")) normalized = normalized.slice(1);
  if (normalized.length === 10) normalized = "91" + normalized;
  if (normalized.length < 10 || normalized.length > 15) return "";
  return "https://wa.me/" + normalized + "?text=" + encodeURIComponent(message || "");
}
