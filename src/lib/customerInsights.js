const INDIA_MOBILE_PATTERN = /^[6-9]\d{9}$/;

export function normalizeIndianMobilePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const nationalNumber = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return INDIA_MOBILE_PATTERN.test(nationalNumber) ? `+91${nationalNumber}` : "";
}

export function summarizeCustomerOrders(orders = []) {
  const customersByPhone = new Map();
  for (const order of orders) {
    if (!order || order.status === "cancelled") continue;
    const phone = normalizeIndianMobilePhone(order.customer_phone);
    if (!phone) continue;
    const existing = customersByPhone.get(phone) || {
      phone, name: String(order.customer_name || "").trim() || "Customer",
      orderCount: 0, completedSpend: 0, lastOrderAt: "", lastOrderTimestamp: -Infinity,
    };
    existing.orderCount += 1;
    if (order.status === "completed") existing.completedSpend += Number(order.total_amount) || 0;
    const timestamp = Date.parse(order.created_at);
    if (Number.isFinite(timestamp) && timestamp > existing.lastOrderTimestamp) {
      existing.name = String(order.customer_name || "").trim() || existing.name;
      existing.lastOrderAt = new Date(timestamp).toISOString();
      existing.lastOrderTimestamp = timestamp;
    }
    customersByPhone.set(phone, existing);
  }
  return [...customersByPhone.values()]
    .map(({ lastOrderTimestamp: _timestamp, ...customer }) => ({ ...customer, isRepeatCustomer: customer.orderCount > 1 }))
    .sort((a, b) => {
      const aTime = a.lastOrderAt ? Date.parse(a.lastOrderAt) : 0;
      const bTime = b.lastOrderAt ? Date.parse(b.lastOrderAt) : 0;
      return bTime - aTime || b.orderCount - a.orderCount;
    });
}
