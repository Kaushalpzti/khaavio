import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://khaavio.in";
const SOCIAL_IMAGE = `${SITE_URL}/khaavio-social-preview.png`;

const STATIC_PAGES = {
  "/": {
    title: "Khaavio | QR Menus, Table Ordering & Restaurant Bookings",
    description:
      "Give your restaurant a branded digital menu, table-wise QR ordering, kitchen updates and table bookings in one simple workspace. Start with a 7-day free trial.",
    indexable: true,
  },
  "/privacy": {
    title: "Privacy Policy | Khaavio",
    description:
      "Learn how Khaavio handles restaurant account information, guest order and booking details, subscription records and privacy requests.",
    indexable: true,
  },
  "/terms": {
    title: "Terms & Conditions | Khaavio",
    description:
      "Read the terms for using Khaavio restaurant software, digital menus, QR ordering, bookings and subscription services.",
    indexable: true,
  },
  "/refund-policy": {
    title: "Refund & Cancellation Policy | Khaavio",
    description:
      "Understand Khaavio subscription cancellations, manual payment verification and how to request a refund.",
    indexable: true,
  },
};

function upsertMeta(selector, attribute, key, content) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attribute, key);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function upsertCanonical(href) {
  let node = document.head.querySelector('link[rel="canonical"]');
  if (!node) {
    node = document.createElement("link");
    node.rel = "canonical";
    document.head.appendChild(node);
  }
  node.href = href;
}

function resolvePage(pathname) {
  if (STATIC_PAGES[pathname]) return STATIC_PAGES[pathname];

  if (pathname.startsWith("/menu/")) {
    return {
      title: "Digital Restaurant Menu | Khaavio",
      description:
        "Browse a restaurant's digital menu on Khaavio. Explore available dishes, prices and table ordering options.",
      indexable: true,
    };
  }

  if (pathname.startsWith("/book/")) {
    return {
      title: "Restaurant Table Booking | Khaavio",
      description:
        "Send a table booking request to a restaurant using its Khaavio booking page.",
      indexable: false,
    };
  }

  return {
    title: "Khaavio | Restaurant Workspace",
    description:
      "Manage restaurant menus, orders, bookings and table operations with Khaavio.",
    indexable: false,
  };
}

export default function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const normalizedPath = pathname === "/" ? "/" : pathname.replace(/\/$/, "");
    const page = resolvePage(normalizedPath);
    const canonical = `${SITE_URL}${normalizedPath}`;

    document.title = page.title;
    upsertMeta('meta[name="description"]', "name", "description", page.description);
    upsertMeta(
      'meta[name="robots"]',
      "name",
      "robots",
      page.indexable ? "index,follow,max-image-preview:large" : "noindex,follow",
    );
    upsertMeta('meta[property="og:title"]', "property", "og:title", page.title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", page.description);
    upsertMeta('meta[property="og:url"]', "property", "og:url", canonical);
    upsertMeta('meta[property="og:image"]', "property", "og:image", SOCIAL_IMAGE);
    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", page.title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", page.description);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", SOCIAL_IMAGE);

    if (page.indexable) {
      upsertCanonical(canonical);
    } else {
      document.head.querySelector('link[rel="canonical"]')?.remove();
    }
  }, [pathname]);

  return null;
}
