export const SITE_URL = "https://khaavio.in";
export const SOCIAL_IMAGE = SITE_URL + "/khaavio-social-preview.png";

const HOME_DESCRIPTION =
  "Manage digital menus, table QR orders, bookings, kitchen workflows, table billing, loyalty rewards, guest feedback and AI menu help in one workspace.";

const STATIC_PAGES = {
  "/": {
    title: "Khaavio | QR Ordering, Menus & Restaurant Operations",
    description: HOME_DESCRIPTION,
    indexable: true,
    canonicalPath: "/",
    keywords: "Khaavio, restaurant management, digital menus, QR ordering, restaurant operations",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Khaavio",
      url: SITE_URL + "/",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: HOME_DESCRIPTION,
      image: SOCIAL_IMAGE,
      publisher: {
        "@type": "Organization",
        name: "Khaavio",
        url: SITE_URL + "/",
        logo: SITE_URL + "/icon.png",
      },
    },
  },
  "/privacy": {
    title: "Privacy Policy | Khaavio",
    description: "Learn how Khaavio handles restaurant account information, guest order and booking details, subscription records and privacy requests.",
    indexable: true,
    canonicalPath: "/privacy",
  },
  "/terms": {
    title: "Terms & Conditions | Khaavio",
    description: "Read the terms for using Khaavio restaurant software, digital menus, QR ordering, bookings and subscription services.",
    indexable: true,
    canonicalPath: "/terms",
  },
  "/refund-policy": {
    title: "Refund & Cancellation Policy | Khaavio",
    description: "Understand Khaavio subscription cancellations, manual payment verification and how to request a refund.",
    indexable: true,
    canonicalPath: "/refund-policy",
  },
  "/refunds": {
    title: "Refund & Cancellation Policy | Khaavio",
    description: "Understand Khaavio subscription cancellations, manual payment verification and how to request a refund.",
    indexable: true,
    canonicalPath: "/refund-policy",
  },
};

const PRIVATE_PAGE_TITLES = {
  "/login": ["Sign in to Khaavio", "Sign in to your Khaavio restaurant workspace."],
  "/signup": ["Create a Khaavio Account", "Create a restaurant workspace on Khaavio."],
  "/reset-password": ["Reset Your Password | Khaavio", "Securely reset your Khaavio account password."],
  "/onboarding": ["Restaurant Setup | Khaavio", "Set up your Khaavio restaurant workspace."],
  "/dashboard": ["Restaurant Dashboard | Khaavio", "Manage your restaurant workspace with Khaavio."],
  "/dashboard/menu": ["Menu Manager | Khaavio", "Manage dishes, prices and availability in your restaurant menu."],
  "/dashboard/qr": ["Menu QR Studio | Khaavio", "Generate and download the QR code for your restaurant's digital menu."],
  "/dashboard/table-qr": ["Table QR Studio | Khaavio", "Create and manage branded QR codes for restaurant tables."],
  "/dashboard/orders": ["Orders Dashboard | Khaavio", "Manage restaurant order activity in Khaavio."],
  "/dashboard/bookings": ["Bookings Dashboard | Khaavio", "Manage restaurant table booking requests."],
  "/dashboard/kitchen": ["Kitchen Display | Khaavio", "View and manage restaurant kitchen orders."],
  "/dashboard/analytics": ["Restaurant Analytics | Khaavio", "Review restaurant activity and performance."],
  "/dashboard/receipts": ["Order Receipts | Khaavio", "Review restaurant order receipts."],
  "/dashboard/table-sessions": ["Table Sessions & Billing | Khaavio", "Manage restaurant table sessions and billing."],
  "/dashboard/settings": ["Restaurant Settings | Khaavio", "Manage restaurant workspace settings."],
  "/dashboard/subscription": ["Subscription | Khaavio", "Manage your Khaavio subscription."],
  "/dashboard/help": ["Help & Support | Khaavio", "Get help with your Khaavio restaurant workspace."],
  "/dashboard/service-requests": ["Table Service Requests | Khaavio", "Review guest service requests."],
  "/dashboard/feedback": ["Guest Feedback | Khaavio", "Review guest feedback for your restaurant."],
  "/dashboard/loyalty": ["Loyalty & Rewards | Khaavio", "Manage restaurant guest loyalty and rewards."],
  "/platform-admin/subscriptions": ["Platform Administration | Khaavio", "Restricted Khaavio platform administration."],
};

export function normalizeMetadataPath(value) {
  let path = String(value || "/").split("?")[0].trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("\0")) {
    return "/";
  }
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path || "/";
}

export function isSafeRestaurantSlug(value) {
  return /^[a-z0-9][a-z0-9-]{0,159}$/i.test(String(value || ""));
}

export function isSafeTableToken(value) {
  return /^[a-z0-9_-]{1,160}$/i.test(String(value || ""));
}

export function createPublicQrDestination(type, slug, tableToken = "") {
  const kind = type === "book" ? "book" : type === "menu" ? "menu" : "";
  const safeSlug = String(slug || "");
  if (!kind || !isSafeRestaurantSlug(safeSlug)) return "";
  const url = new URL("/" + kind + "/" + encodeURIComponent(safeSlug), SITE_URL);
  if (kind === "menu" && tableToken && isSafeTableToken(tableToken)) {
    url.searchParams.set("table", tableToken);
  }
  return url.toString();
}

export function createSocialQrImageUrl(type, slug, tableToken = "") {
  if (!isSafeRestaurantSlug(slug)) return SOCIAL_IMAGE;
  const params = new URLSearchParams();
  params.set("type", type === "book" ? "book" : "menu");
  params.set("slug", slug);
  if (type === "menu" && tableToken && isSafeTableToken(tableToken)) {
    params.set("table", tableToken);
  }
  return SITE_URL + "/api/social-qr?" + params.toString();
}

function cleanText(value, maxLength = 180) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeImageUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function getRestaurantForSlug(restaurant, slug) {
  if (!restaurant || !isSafeRestaurantSlug(slug)) return null;
  if (String(restaurant.slug || "").toLowerCase() !== String(slug).toLowerCase()) return null;
  const name = cleanText(restaurant.name, 100);
  if (!name) return null;
  return {
    name,
    slug: String(restaurant.slug),
    cuisine: cleanText(String(restaurant.restaurant_type || "").replace(/_/g, " "), 70),
    logoUrl: safeImageUrl(restaurant.logo_url),
  };
}

function makeBaseMetadata(pathname, title, description, indexable = false) {
  const path = normalizeMetadataPath(pathname);
  return {
    title,
    description: cleanText(description, 220),
    indexable,
    canonical: indexable ? SITE_URL + path : "",
    ogUrl: SITE_URL + path,
    image: SOCIAL_IMAGE,
    imageAlt: "Khaavio restaurant management, digital menus and QR ordering.",
    imageType: "image/png",
    imageWidth: 1200,
    imageHeight: 630,
    keywords: "",
    structuredData: null,
  };
}

export function buildPageMetadata(pathname, options = {}) {
  const path = normalizeMetadataPath(pathname);
  const restaurant = options.restaurant || null;
  const tableToken = isSafeTableToken(options.tableToken) ? options.tableToken : "";

  if (STATIC_PAGES[path]) {
    const page = STATIC_PAGES[path];
    const result = makeBaseMetadata(path, page.title, page.description, page.indexable);
    result.canonical = SITE_URL + (page.canonicalPath || path);
    result.ogUrl = result.canonical;
    result.keywords = page.keywords || "";
    result.structuredData = page.structuredData || {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.title,
      description: page.description,
      url: result.canonical,
      publisher: { "@type": "Organization", name: "Khaavio", url: SITE_URL + "/" },
    };
    return result;
  }

  const menuMatch = path.match(/^\/menu\/([^/]+)$/);
  if (menuMatch) {
    let slug = "";
    try { slug = decodeURIComponent(menuMatch[1]); } catch { slug = ""; }
    const publicRestaurant = getRestaurantForSlug(restaurant, slug);
    if (!publicRestaurant) {
      return makeBaseMetadata(path, "Restaurant Menu | Khaavio", "Browse a restaurant's published digital menu on Khaavio. Explore dishes, prices and availability.", false);
    }
    const cuisineText = publicRestaurant.cuisine ? " featuring " + publicRestaurant.cuisine : "";
    const title = cleanText(publicRestaurant.name + " Menu | Digital Menu & Online Ordering | Khaavio", 100);
    const description = "Explore " + publicRestaurant.name + "'s digital menu" + cuisineText +
      ". View dishes and prices, check availability, and order online with Khaavio.";
    const result = makeBaseMetadata(path, title, description, true);
    result.canonical = SITE_URL + "/menu/" + encodeURIComponent(publicRestaurant.slug);
    result.ogUrl = result.canonical + (tableToken ? "?table=" + encodeURIComponent(tableToken) : "");
    result.image = createSocialQrImageUrl("menu", publicRestaurant.slug, tableToken);
    result.imageAlt = "Scannable QR code for " + publicRestaurant.name + "'s digital menu.";
    result.imageWidth = 1200;
    result.imageHeight = 1200;
    result.keywords = [
      publicRestaurant.name,
      publicRestaurant.name + " menu",
      publicRestaurant.cuisine ? publicRestaurant.cuisine + " menu" : "",
      "digital restaurant menu",
      "online food ordering",
      "Khaavio",
    ].filter(Boolean).join(", ");
    result.structuredData = {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name: publicRestaurant.name,
      url: result.canonical,
      menu: result.canonical,
      servesCuisine: publicRestaurant.cuisine || undefined,
      image: publicRestaurant.logoUrl || SOCIAL_IMAGE,
      publisher: { "@type": "Organization", name: "Khaavio", url: SITE_URL + "/" },
    };
    return result;
  }

  const bookingMatch = path.match(/^\/book\/([^/]+)$/);
  if (bookingMatch) {
    let slug = "";
    try { slug = decodeURIComponent(bookingMatch[1]); } catch { slug = ""; }
    const publicRestaurant = getRestaurantForSlug(restaurant, slug);
    if (!publicRestaurant) {
      return makeBaseMetadata(path, "Restaurant Table Booking | Khaavio", "Send a table booking request to a restaurant using its Khaavio booking page.", false);
    }
    const title = cleanText("Book a Table at " + publicRestaurant.name + " | Khaavio", 100);
    const description = "Request a table at " + publicRestaurant.name +
      (publicRestaurant.cuisine ? ", " + publicRestaurant.cuisine : "") +
      ". Check booking details and send a reservation request through Khaavio.";
    const result = makeBaseMetadata(path, title, description, false);
    result.ogUrl = SITE_URL + "/book/" + encodeURIComponent(publicRestaurant.slug);
    result.image = createSocialQrImageUrl("book", publicRestaurant.slug);
    result.imageAlt = "Scannable QR code for booking a table at " + publicRestaurant.name + ".";
    result.imageWidth = 1200;
    result.imageHeight = 1200;
    result.keywords = [publicRestaurant.name, "table booking", "restaurant reservation", publicRestaurant.cuisine, "Khaavio"].filter(Boolean).join(", ");
    result.structuredData = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description: result.description,
      url: result.ogUrl,
      about: { "@type": "Restaurant", name: publicRestaurant.name, servesCuisine: publicRestaurant.cuisine || undefined },
    };
    return result;
  }

  if (/^\/track\/[^/]+\/[^/]+$/.test(path)) {
    return makeBaseMetadata(path, "Track Your Order | Khaavio", "Check the latest status of your restaurant order using the secure tracking link provided with your order confirmation.", false);
  }

  if (PRIVATE_PAGE_TITLES[path]) {
    const values = PRIVATE_PAGE_TITLES[path];
    return makeBaseMetadata(path, values[0], values[1], false);
  }
  if (path.startsWith("/dashboard/")) {
    const section = path.split("/").filter(Boolean).pop().replace(/-/g, " ");
    return makeBaseMetadata(path, cleanText(section.replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }) + " | Khaavio", 100), "Manage " + section + " in your Khaavio restaurant workspace.", false);
  }
  if (path.startsWith("/platform-admin/")) {
    return makeBaseMetadata(path, "Platform Administration | Khaavio", "Restricted Khaavio platform administration.", false);
  }
  return makeBaseMetadata(path, "Page Not Found | Khaavio", "The page may have moved, or the link may be incorrect. Visit Khaavio to explore restaurant menus and tools.", false);
}
