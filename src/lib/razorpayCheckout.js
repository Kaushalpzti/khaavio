let razorpayCheckoutPromise;

export function loadRazorpayCheckout() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(false);
  }
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayCheckoutPromise) return razorpayCheckoutPromise;

  razorpayCheckoutPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-khaavio-razorpay="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener("error", () => {
        razorpayCheckoutPromise = undefined;
        resolve(false);
      }, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.khaavioRazorpay = "true";
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      razorpayCheckoutPromise = undefined;
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return razorpayCheckoutPromise;
}
