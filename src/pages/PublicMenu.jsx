import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Leaf,
  LoaderCircle,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Gift,
  Star,
  Tag,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { normalizeIndianMobilePhone } from "../lib/customerInsights";
import { normalizeTableNumber } from "../lib/tableNumber";
import { getOrCreateKhaavioLoyaltyToken } from "../lib/loyaltyToken";
import { getStoredKhaavioLoyaltyPhone, setStoredKhaavioLoyaltyPhone } from "../lib/loyaltyPhone";
import { DEFAULT_PUBLIC_FEATURES, normalizePublicFeatureFlags, shouldShowPublicReviewsTab } from "../lib/publicPlanFeatures";
import { hasSocialLinks } from "../lib/restaurantSocialLinks.js";
import PublicTableService from "../components/PublicTableService";
import PublicLoyaltyClub from "../components/PublicLoyaltyClub";
import PublicReviewsFeedback, { isValidGoogleReviewUrl } from "../components/PublicReviewsFeedback";
import PublicBooking from "./PublicBooking";
import AskKhaavio from "../components/AskKhaavio";
import khaavioIcon from "../assets/icon.png";
import "./PublicMenu.css";
import "./PublicMenuExperience.css";

function formatPrice(price) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(price) || 0);
}

const SMART_FILTERS = [
  { value: "all", label: "All dishes" },
  { value: "veg", label: "Veg" },
  { value: "non_veg", label: "Non-Veg" },
  { value: "egg", label: "Egg" },
  { value: "vegan", label: "Vegan" },
  { value: "jain", label: "Jain" },
  { value: "under_100", label: "Under ₹100" },
  { value: "under_200", label: "Under ₹200" },
  { value: "spicy", label: "Spicy" },
];

const FOOD_TYPE_LABELS = {
  vegetarian: "VEG",
  non_vegetarian: "NON-VEG",
  egg: "EGG",
  vegan: "VEGAN",
};

function getErrorMessage(error, fallback) {
  const message =
    typeof error?.message === "string" ? error.message.trim() : "";
  if (message.includes("KHAAVIO_PLAN_ACCESS_REQUIRED")) {
    return "Online ordering is temporarily unavailable at this restaurant. Please ask the restaurant team for help.";
  }
  return message || fallback;
}

function createGuestTabToken() {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("This browser cannot securely start a guest bill. Please use an updated browser or ask staff for help.");
  }
  return crypto.randomUUID();
}

function getGuestTabStorageKey(slug, tableToken) {
  return "khaavio-guest-tab:" + slug + ":" + tableToken;
}

function getPendingTableMenuCartKey(slug) {
  return "khaavio-table-menu-cart:" + slug;
}

function getGuestOrderRequestStorageKey(slug, tableToken, guestTabToken) {
  return "khaavio-guest-order-request:" + slug + ":" + tableToken + ":" + guestTabToken;
}

function getOrCreateGuestOrderRequest(slug, tableToken, guestTabToken, fingerprint) {
  const key = getGuestOrderRequestStorageKey(slug, tableToken, guestTabToken);
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        if (saved?.fingerprint === fingerprint && typeof saved?.token === "string" && saved.token) {
          return { key, token: saved.token };
        }
      } catch {
        // Replace a malformed/stale retry record with a new request ID.
      }
    }

    const token = createGuestTabToken();
    window.sessionStorage.setItem(key, JSON.stringify({ token, fingerprint }));
    return { key, token };
  } catch {
    throw new Error("Khaavio could not safely save this order's retry key in this browser. Enable session storage or ask restaurant staff for help.");
  }
}

function canStartFreshGuestBill(snapshot) {
  const tab = snapshot?.tab;
  if (tab?.status !== "closed") return false;
  if (snapshot?.invoice?.payment_status === "paid") return true;
  return !snapshot?.invoice && Number(tab?.order_count || 0) === 0;
}

function getRestaurantAvailability(restaurant, timestamp) {
  if (!restaurant) {
    return {
      canOrder: false,
      title: "Checking order availability",
      message: "Please wait while we check the restaurant's hours.",
    };
  }

  if (restaurant.is_accepting_orders === false) {
    return {
      canOrder: false,
      title: "Online orders are paused",
      message:
        "This restaurant is temporarily not accepting online orders. You can still browse the menu or ask the staff for assistance.",
    };
  }

  const schedule = restaurant.business_hours;
  if (!schedule || typeof schedule !== "object" || !timestamp) {
    return {
      canOrder: true,
      title: "Online ordering",
      message: "Online orders are available when the restaurant is open.",
    };
  }

  const timezone = restaurant.timezone || "Asia/Kolkata";
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
  }

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const dayKey = String(values.weekday || "").toLowerCase();
  const day = schedule[dayKey];

  if (!day || day.closed) {
    return {
      canOrder: false,
      title: "Restaurant is closed",
      message:
        "Online ordering is currently closed for today. Please check back during opening hours.",
    };
  }

  const parseMinutes = (value) => {
    if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return null;
    const [hour, minute] = value.split(":").map(Number);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  };

  const opens = parseMinutes(day.open);
  const closes = parseMinutes(day.close);
  const current = Number(values.hour) * 60 + Number(values.minute);

  if (opens === null || closes === null || opens >= closes) {
    return {
      canOrder: false,
      title: "Ordering hours unavailable",
      message:
        "The restaurant's opening hours need to be updated. Please ask staff for assistance.",
    };
  }

  const beforeOpen = current < opens;
  const afterClose = closes !== 1439 && current >= closes;
  if (beforeOpen || afterClose) {
    return {
      canOrder: false,
      title: "Restaurant is currently closed",
      message: `Online ordering is open from ${day.open} to ${day.close} IST today. Please try again during opening hours.`,
    };
  }

  return {
    canOrder: true,
    title: "Online ordering is open",
    message: "You can place an order while the restaurant is open.",
  };
}

export default function PublicMenu() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const hasTableParam = searchParams.has("table");
  const tableToken = searchParams.get("table");

  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [menuOptionGroups, setMenuOptionGroups] = useState([]);
  const [optionPickerItem, setOptionPickerItem] = useState(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState([]);
  const [menuBanners, setMenuBanners] = useState([]);
  const [publicOffers, setPublicOffers] = useState([]);
  const [tableContext, setTableContext] = useState(null);
  const [availableTables, setAvailableTables] = useState([]);
  const [selectedTableToken, setSelectedTableToken] = useState("");
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [tableListLoaded, setTableListLoaded] = useState(false);
  const [tableSelectionError, setTableSelectionError] = useState("");
  const [publicFeatures, setPublicFeatures] = useState({ ...DEFAULT_PUBLIC_FEATURES });

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [smartFilter, setSmartFilter] = useState("all");

  const [cart, setCart] = useState([]);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponFeedback, setCouponFeedback] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [guestTabToken, setGuestTabToken] = useState("");
  const [guestTabSnapshot, setGuestTabSnapshot] = useState(null);
  const [guestBillOpen, setGuestBillOpen] = useState(false);
  const [guestBillLoading, setGuestBillLoading] = useState(false);
  const [guestBillError, setGuestBillError] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState("menu");
  const [activePromoSlide, setActivePromoSlide] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loyaltyPhone, setLoyaltyPhone] = useState(() => getStoredKhaavioLoyaltyPhone(slug));
  const [orderNotes, setOrderNotes] = useState("");
  const [serviceMode, setServiceMode] = useState("dine_in");
  const [pickupEtaMinutes, setPickupEtaMinutes] = useState(30);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [orderResult, setOrderResult] = useState(null);
  const [availabilityNow, setAvailabilityNow] = useState(0);
  const [subscriptionAllowsTransactions, setSubscriptionAllowsTransactions] =
    useState(null);

  const canUseLoyaltyRewards = publicFeatures.loyalty_rewards === true;
  const canUsePrivateFeedback = publicFeatures.private_feedback === true;
  const canShowGoogleReviewLink = publicFeatures.google_review_link === true
    && isValidGoogleReviewUrl(restaurant?.google_review_url);
  const canShowReviewsTab = shouldShowPublicReviewsTab(
    publicFeatures,
    canShowGoogleReviewLink,
    hasSocialLinks(restaurant?.social_links),
  );
  const canUseAskKhaavio = publicFeatures.ai_menu_assistant === true;

  function handleLoyaltyPhoneChange(value) {
    setLoyaltyPhone(value);
    setStoredKhaavioLoyaltyPhone(slug, value);
  }

  function switchBottomTab(tab) {
    setIsCartOpen(false);
    setActiveBottomTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    if (activeBottomTab === "rewards" && !canUseLoyaltyRewards) {
      setActiveBottomTab("menu");
    } else if (activeBottomTab === "reviews" && !canShowReviewsTab) {
      setActiveBottomTab("menu");
    }
  }, [activeBottomTab, canUseLoyaltyRewards, canShowReviewsTab]);

  // Give each published restaurant menu a useful, restaurant-specific title.
  useEffect(() => {
    if (!restaurant?.name) return;

    const pageTitle = `${restaurant.name} Digital Menu | Khaavio`;
    const pageDescription = `Explore ${restaurant.name}'s digital menu on Khaavio. Browse available dishes and prices, and use table QR ordering where available.`;
    document.title = pageTitle;

    const setMeta = (selector, attribute, key, content) => {
      let node = document.head.querySelector(selector);
      if (!node) {
        node = document.createElement("meta");
        node.setAttribute(attribute, key);
        document.head.appendChild(node);
      }
      node.setAttribute("content", content);
    };

    setMeta('meta[name="description"]', "name", "description", pageDescription);
    setMeta('meta[name="robots"]', "name", "robots", "index,follow,max-image-preview:large");
    setMeta('meta[property="og:title"]', "property", "og:title", pageTitle);
    setMeta('meta[property="og:description"]', "property", "og:description", pageDescription);
    setMeta('meta[property="og:url"]', "property", "og:url", `https://khaavio.in/menu/${encodeURIComponent(restaurant.slug || slug)}`);
    setMeta('meta[property="og:image"]', "property", "og:image", "https://khaavio.in/khaavio-social-preview.png");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", pageTitle);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", pageDescription);
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", "https://khaavio.in/khaavio-social-preview.png");

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `https://khaavio.in/menu/${encodeURIComponent(restaurant.slug || slug)}`;
  }, [restaurant?.name, restaurant?.slug, slug]);

  useEffect(() => {
    let cancelled = false;

    let pendingCart = [];
    if (hasTableParam && tableToken) {
      try {
        const storageKey = getPendingTableMenuCartKey(slug);
        const pending = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
        if (
          pending?.tableToken === tableToken &&
          Date.now() - Number(pending.savedAt) < 30 * 60 * 1000 &&
          Array.isArray(pending.cart)
        ) {
          pendingCart = pending.cart
            .filter((entry) => entry && typeof entry.id === "string" && Number(entry.quantity) > 0)
            .slice(0, 50);
        }
        window.sessionStorage.removeItem(storageKey);
      } catch {
        pendingCart = [];
      }
    }

    async function loadMenu() {
      setLoading(true);
      setError("");
      setRestaurant(null);
      setCategories([]);
      setItems([]);
      setMenuOptionGroups([]);
      setOptionPickerItem(null);
      setMenuBanners([]);
      setPublicOffers([]);
      setTableContext(null);
      setAvailableTables([]);
      setSelectedTableToken("");
      setIsTablePickerOpen(false);
      setTableListLoaded(false);
      setTableSelectionError("");
      setCategoryId("all");
      setSmartFilter("all");
      setCart(pendingCart);
      setCouponInput("");
      setAppliedCoupon(null);
      setCouponFeedback("");
      setGuestTabToken("");
      setGuestTabSnapshot(null);
      setGuestBillOpen(false);
      setGuestBillError("");
      setIsCartOpen(false);
      setOrderResult(null);
      setCheckoutError("");
      setSubscriptionAllowsTransactions(null);
      setPublicFeatures({ ...DEFAULT_PUBLIC_FEATURES });
      setActiveBottomTab("menu");
      setActivePromoSlide(0);

      try {
        const { data: menuSnapshot, error: restaurantError } = await supabase.rpc(
          "khaavio_public_restaurant_menu",
          { p_slug: slug },
        );
        if (restaurantError) throw restaurantError;
        const restaurantRecord = menuSnapshot?.restaurant;

        if (!restaurantRecord) {
          throw new Error(
            "This menu is not published yet, or the link is incorrect.",
          );
        }

        let effectiveBillingMode = "combined";
        if (hasTableParam && tableToken) {
          try {
            const { data: billingMode, error: billingModeError } = await supabase.rpc(
              "khaavio_public_table_billing_mode",
              { p_slug: slug, p_table_token: tableToken },
            );
            if (!billingModeError && (billingMode === "combined" || billingMode === "per_guest")) {
              effectiveBillingMode = billingMode;
            }
          } catch {
            effectiveBillingMode = "combined";
          }
        }
        const restaurantData = { ...restaurantRecord, table_billing_mode: effectiveBillingMode };

        // Public menus receive only a small, non-sensitive set of plan entitlements.
        // If the RPC is unavailable, Growth-only public features fail closed while
        // core menu browsing remains available.
        let resolvedPublicFeatures = { ...DEFAULT_PUBLIC_FEATURES };
        try {
          const { data: featureData, error: featureError } = await supabase.rpc(
            "khaavio_public_restaurant_feature_flags",
            { p_slug: slug },
          );
          if (!featureError) {
            resolvedPublicFeatures = normalizePublicFeatureFlags(featureData);
          }
        } catch {
          resolvedPublicFeatures = { ...DEFAULT_PUBLIC_FEATURES };
        }

        // Branding is included in the least-privilege public menu snapshot.
        // The transaction-access RPC below returns only a boolean; order RPCs
        // continue to enforce transaction access independently on the server.
        let transactionAccess = null;
        const { data: accessData, error: accessError } = await supabase.rpc(
          "khaavio_public_restaurant_can_transact",
          { p_slug: slug },
        );
        if (!accessError) transactionAccess = accessData === true;

        let resolvedTable = null;
        let resolvedGuestTabToken = "";
        let guestTokenInitError = "";

        // A table-specific QR must resolve to a valid active table.
        if (hasTableParam) {
          const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

          if (!tableToken || !uuidPattern.test(tableToken)) {
            throw new Error(
              "This table QR code is invalid. Please ask staff for a new code.",
            );
          }

          const { data: tableData, error: validationError } =
            await supabase.rpc("resolve_public_table", {
              p_slug: slug,
              p_token: tableToken,
            });

          if (validationError) throw validationError;

          resolvedTable = Array.isArray(tableData) ? tableData[0] : tableData;

          if (
            !resolvedTable ||
            resolvedTable.restaurant_id !== restaurantData.id
          ) {
            throw new Error(
              "This table QR is inactive or invalid. Please ask staff for assistance.",
            );
          }
        }

        if (effectiveBillingMode === "per_guest" && resolvedTable && tableToken) {
          try {
            const key = getGuestTabStorageKey(slug, tableToken);
            const storedToken = window.localStorage.getItem(key);
            resolvedGuestTabToken = storedToken || createGuestTabToken();
            if (!storedToken) window.localStorage.setItem(key, resolvedGuestTabToken);
          } catch (tokenError) {
            guestTokenInitError = tokenError?.message || "Could not prepare your guest bill on this device.";
          }
        }

        const publicCategories = Array.isArray(menuSnapshot?.categories)
          ? menuSnapshot.categories
          : [];
        const publicItems = Array.isArray(menuSnapshot?.items)
          ? menuSnapshot.items
          : [];
        let resolvedOptionGroups = [];
        try {
          const { data: optionData, error: optionError } = await supabase.rpc(
            "khaavio_public_menu_item_options",
            { p_slug: slug },
          );
          if (!optionError && Array.isArray(optionData)) resolvedOptionGroups = optionData;
        } catch {
          resolvedOptionGroups = [];
        }

        // Public offer details are limited to active coupons on a published menu.
        // If the optional RPC is unavailable, menu browsing remains unaffected.
        let resolvedPublicOffers = [];
        try {
          const { data: offersData, error: offersError } = await supabase.rpc(
            "khaavio_public_restaurant_coupons",
            { p_slug: slug },
          );
          if (!offersError && Array.isArray(offersData)) resolvedPublicOffers = offersData;
        } catch {
          resolvedPublicOffers = [];
        }

        let resolvedMenuBanners = [];
        try {
          const { data: bannerData, error: bannerError } = await supabase.rpc(
            "khaavio_public_restaurant_menu_banners",
            { p_slug: slug },
          );
          if (!bannerError && Array.isArray(bannerData)) resolvedMenuBanners = bannerData;
        } catch {
          resolvedMenuBanners = [];
        }

        if (cancelled) return;

        const resolvedTables = Array.isArray(menuSnapshot?.tables)
          ? menuSnapshot.tables.filter((table) => table?.table_number && table?.qr_token)
          : [];
        setRestaurant(restaurantData);
        setAvailableTables(resolvedTables);
        setTableListLoaded(true);
        setMenuBanners(resolvedMenuBanners);
        setPublicOffers(resolvedPublicOffers);
        setPublicFeatures(resolvedPublicFeatures);
        setSubscriptionAllowsTransactions(transactionAccess);
        setAvailabilityNow(Date.now());

        setCategories(
          [...publicCategories].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );

        setItems(
          [...publicItems].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );
        setMenuOptionGroups(resolvedOptionGroups);
        setServiceMode(resolvedTable ? "dine_in" : restaurantData.pickup_enabled ? "pickup" : "dine_in");

        setTableContext(resolvedTable);
        setGuestTabToken(resolvedGuestTabToken);
        if (guestTokenInitError) setGuestBillError(guestTokenInitError);
      } catch (err) {
        if (!cancelled) {
          setError(
            getErrorMessage(err, "Unable to load this menu. Please try again."),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMenu();

    return () => {
      cancelled = true;
    };
  }, [slug, tableToken, hasTableParam]);

  function continueToSelectedTable() {
    const selectedTable = availableTables.find((table) => table.qr_token === selectedTableToken);
    if (!selectedTable?.qr_token || !slug) return;
    setTableSelectionError("");
    try {
      window.sessionStorage.setItem(getPendingTableMenuCartKey(slug), JSON.stringify({
        tableToken: selectedTable.qr_token,
        savedAt: Date.now(),
        cart,
      }));
    } catch {
      if (cart.length) {
        setTableSelectionError("Your cart could not be saved on this device. Please try again or clear your cart before continuing.");
        return;
      }
    }
    navigate(`/menu/${encodeURIComponent(slug)}?table=${encodeURIComponent(selectedTable.qr_token)}`);
  }

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setAvailabilityNow(Date.now());
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Keep the compact food-highlight slider moving only while the Menu tab is visible.
  useEffect(() => {
    if (activeBottomTab !== "menu") return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const slideCount = menuBanners.length || 3;
      setActivePromoSlide((current) => (current + 1) % slideCount);
    }, 5200);

    return () => window.clearInterval(intervalId);
  }, [activeBottomTab, menuBanners.length]);

  // The table QR has already been validated by resolve_public_table.
  // Do not depend on a particular ID field name in that RPC's result shape:
  // the validated table context plus its QR token is the reliable table scope.
  const isGuestBilling =
    restaurant?.table_billing_mode === "per_guest" && Boolean(tableContext && tableToken);

  async function refreshGuestBillSnapshot(token = guestTabToken) {
    if (!token || !slug || !tableToken) return;
    setGuestBillLoading(true);
    setGuestBillError("");
    try {
      const { data, error: snapshotError } = await supabase.rpc(
        "khaavio_public_guest_tab_snapshot",
        { p_slug: slug, p_table_token: tableToken, p_guest_tab_token: token },
      );
      if (snapshotError) throw snapshotError;
      setGuestTabSnapshot(data || null);
    } catch (snapshotError) {
      setGuestBillError(getErrorMessage(snapshotError, "Could not load your bill. Please refresh the menu or ask staff for help."));
    } finally {
      setGuestBillLoading(false);
    }
  }

  async function requestGuestBill() {
    if (!guestTabToken || !isGuestBilling || guestBillLoading) return;
    setGuestBillLoading(true);
    setGuestBillError("");
    try {
      const { data, error: requestError } = await supabase.rpc(
        "finalize_public_guest_tab",
        { p_slug: slug, p_table_token: tableToken, p_guest_tab_token: guestTabToken },
      );
      if (requestError) throw requestError;
      const invoice = Array.isArray(data) ? data[0] : data;
      if (!invoice?.invoice_id) throw new Error("The bill could not be confirmed. Please refresh My Bill before retrying.");
      await refreshGuestBillSnapshot(guestTabToken);
    } catch (requestError) {
      setGuestBillError(getErrorMessage(requestError, "Could not request your bill. Please ask staff for assistance."));
    } finally {
      setGuestBillLoading(false);
    }
  }

  function startNewGuestBill() {
    try {
      const nextToken = createGuestTabToken();
      window.localStorage.setItem(getGuestTabStorageKey(slug, tableToken), nextToken);
      setGuestTabToken(nextToken);
      setGuestTabSnapshot(null);
      setGuestBillError("");
      setOrderResult(null);
      setGuestBillOpen(false);
    } catch (tokenError) {
      setGuestBillError(tokenError?.message || "Could not start a new guest bill.");
    }
  }

  useEffect(() => {
    if (!isGuestBilling || !guestTabToken) return undefined;
    let active = true;
    async function loadSnapshot() {
      try {
        const { data, error: snapshotError } = await supabase.rpc(
          "khaavio_public_guest_tab_snapshot",
          { p_slug: slug, p_table_token: tableToken, p_guest_tab_token: guestTabToken },
        );
        if (snapshotError) throw snapshotError;
        if (active) setGuestTabSnapshot(data || null);
      } catch (snapshotError) {
        if (active) setGuestBillError(getErrorMessage(snapshotError, "Could not load your bill."));
      }
    }
    loadSnapshot();
    return () => { active = false; };
  }, [slug, tableToken, guestTabToken, isGuestBilling]);

  useEffect(() => {
    if (!isCartOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event) {
      if (event.key === "Escape" && !submitting) setIsCartOpen(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isCartOpen, submitting]);



  const visibleItems = items.filter((item) => {
    const matchesCategory =
      categoryId === "all" || item.category_id === categoryId;

    const searchableText =
      `${item.name || ""} ${item.description || ""}`.toLowerCase();
    const foodType = item.food_type || "unspecified";
    const price = Number(item.price) || 0;
    const spiceLevel = item.spice_level || "unspecified";
    const matchesSmartFilter =
      smartFilter === "all" ||
      (smartFilter === "veg" && ["vegetarian", "vegan"].includes(foodType)) ||
      (smartFilter === "non_veg" && foodType === "non_vegetarian") ||
      (smartFilter === "egg" && foodType === "egg") ||
      (smartFilter === "vegan" && foodType === "vegan") ||
      (smartFilter === "jain" && item.is_jain_friendly === true) ||
      (smartFilter === "under_100" && price <= 100) ||
      (smartFilter === "under_200" && price <= 200) ||
      (smartFilter === "spicy" && ["medium", "hot"].includes(spiceLevel));

    return (
      matchesCategory &&
      matchesSmartFilter &&
      searchableText.includes(search.trim().toLowerCase())
    );
  });

  const promoImageItems = items.filter((item) => Boolean(item.image_url));
  const fallbackPromoSlides = [
    {
      eyebrow: "FRESH FAVOURITES",
      titleStart: "Good food,",
      titleAccent: "better moments.",
      description: "Fresh favourites, right at your table.",
      imageItem: promoImageItems[0],
    },
    {
      eyebrow: "FROM OUR KITCHEN",
      titleStart: "Find your next",
      titleAccent: "favourite.",
      description: "Explore the dishes made for your table.",
      imageItem: promoImageItems[1] || promoImageItems[0],
    },
    {
      eyebrow: "ORDER WITH EASE",
      titleStart: "Your favourites,",
      titleAccent: "just a tap away.",
      description: "Browse the menu and add dishes to your order.",
      imageItem: promoImageItems[2] || promoImageItems[0],
    },
  ];
  const uploadedPromoSlides = menuBanners.map((banner) => ({
    displayMode: banner.display_mode || "text_overlay",
    eyebrow: banner.eyebrow,
    titleStart: banner.title,
    titleAccent: "",
    description: banner.description,
    imageItem: {
      id: banner.id,
      image_url: supabase.storage.from("menu-images").getPublicUrl(banner.image_path).data.publicUrl,
    },
  }));
  const promoSlides = uploadedPromoSlides.length ? uploadedPromoSlides : fallbackPromoSlides;
  const activePromoIndex = activePromoSlide % promoSlides.length;
  const currentPromoSlide = promoSlides[activePromoIndex] || promoSlides[0];

  const cartTotal = cart.reduce(
    (total, entry) => total + Number(entry.unitPrice ?? entry.price) * entry.quantity,
    0,
  );

  const cartQuantity = cart.reduce((total, entry) => total + entry.quantity, 0);
  const cartFingerprint = JSON.stringify(cart.map((entry) => [entry.id, entry.optionIds || [], entry.quantity]));
  const activeCoupon = appliedCoupon?.fingerprint === cartFingerprint ? appliedCoupon : null;
  const cartDiscount = Number(activeCoupon?.discountAmount) || 0;
  const cartFinalTotal = Math.max(0, cartTotal - cartDiscount);

  const baseOrderingAvailability = getRestaurantAvailability(
    restaurant,
    availabilityNow,
  );
  const orderingAvailability =
    subscriptionAllowsTransactions !== true
      ? {
          canOrder: false,
          title: "Online ordering is temporarily unavailable",
          message:
            "This restaurant is not currently accepting online orders. Please contact the restaurant team for assistance.",
        }
      : baseOrderingAvailability;

  function addToCart(item) {
    const groups = menuOptionGroups.filter((group) => group.menu_item_id === item.id);
    if (groups.length) {
      setOptionPickerItem(item);
      setSelectedOptionIds([]);
      return;
    }
    addConfiguredItem(item, []);
  }

  function addConfiguredItem(item, optionIds) {
    setCheckoutError("");
    setOrderResult(null);
    setAppliedCoupon(null);
    setCouponFeedback("");

    const sortedOptionIds = [...optionIds].sort();
    const cartKey = `${item.id}:${sortedOptionIds.join(",")}`;
    const existingDishQuantity = cart.filter((entry) => entry.id === item.id).reduce((sum, entry) => sum + entry.quantity, 0);

    if (existingDishQuantity >= 20) {
      setCheckoutError(
        "You can order up to 20 units of a single dish per order.",
      );
      return;
    }

    setCart((current) => {
      const entry = current.find((row) => row.cartKey === cartKey);

      if (entry) {
        return current.map((row) =>
          row.cartKey === cartKey ? { ...row, quantity: row.quantity + 1 } : row,
        );
      }

      const options = menuOptionGroups.filter((group) => group.menu_item_id === item.id)
        .flatMap((group) => group.options.filter((option) => sortedOptionIds.includes(option.id)));
      return [...current, {
        ...item,
        cartKey,
        optionIds: sortedOptionIds,
        selectedOptions: options.map((option) => ({ ...option, group_name: menuOptionGroups.find((group) => group.menu_item_id === item.id && group.options.some((candidate) => candidate.id === option.id))?.name })),
        unitPrice: Number(item.price) + options.reduce((sum, option) => sum + Number(option.price_delta || 0), 0),
        quantity: 1,
      }];
    });
  }

  function confirmOptionSelection() {
    if (!optionPickerItem) return;
    const groups = menuOptionGroups.filter((group) => group.menu_item_id === optionPickerItem.id);
    for (const group of groups) {
      const selectedCount = group.options.filter((option) => selectedOptionIds.includes(option.id)).length;
      if (selectedCount < group.min_selections || selectedCount > group.max_selections) {
        setCheckoutError(`Choose ${group.min_selections === group.max_selections ? group.min_selections : `${group.min_selections} to ${group.max_selections}`} options for ${group.name}.`);
        return;
      }
    }
    addConfiguredItem(optionPickerItem, selectedOptionIds);
    setOptionPickerItem(null);
    setSelectedOptionIds([]);
    setCheckoutError("");
  }

  function choosePublicOffer(offer) {
    setCouponInput(offer.code);
    setAppliedCoupon(null);
    setCouponFeedback(
      cart.length > 0
        ? `${offer.code} added. Apply it in your cart.`
        : `${offer.code} saved. Add dishes, then apply it in your cart.`,
    );
    if (tableContext && cart.length > 0) {
      setIsCartOpen(true);
    } else {
      document.getElementById("menu")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function changeQuantity(cartKey, difference) {
    setCheckoutError("");
    setOrderResult(null);
    setAppliedCoupon(null);
    setCouponFeedback("");

    const existing = cart.find((entry) => entry.cartKey === cartKey);

    if (!existing) return;

    if (existing.quantity + difference > 20) {
      setCheckoutError(
        "You can order up to 20 units of a single dish per order.",
      );
      return;
    }

    setCart((current) =>
      current.flatMap((entry) => {
        if (entry.cartKey !== cartKey) return [entry];

        const nextQuantity = entry.quantity + difference;

        return nextQuantity > 0 ? [{ ...entry, quantity: nextQuantity }] : [];
      }),
    );
  }

  function removeFromCart(cartKey) {
    setCart((current) => current.filter((entry) => entry.cartKey !== cartKey));
    setCheckoutError("");
    setOrderResult(null);
    setAppliedCoupon(null);
    setCouponFeedback("");
  }

  async function validateCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCouponFeedback("Enter a coupon code.");
      setAppliedCoupon(null);
      return;
    }
    if (cart.length === 0) {
      setCouponFeedback("Add items before applying a coupon.");
      setAppliedCoupon(null);
      return;
    }
    setValidatingCoupon(true);
    setCouponFeedback("");
    setAppliedCoupon(null);
    try {
      const { data, error: quoteError } = await supabase.rpc("khaavio_validate_coupon", {
        p_slug: slug,
        p_table_token: tableContext ? tableToken : null,
        p_code: code,
        p_items: cart.map((entry) => ({ item_id: entry.id, quantity: entry.quantity, option_ids: entry.optionIds || [] })),
      });
      if (quoteError) throw quoteError;
      const quote = Array.isArray(data) ? data[0] : data;
      if (!quote?.is_valid) {
        setCouponFeedback(quote?.message || "This coupon cannot be used for your cart.");
        return;
      }
      const discountAmount = Number(quote.discount_amount) || 0;
      setAppliedCoupon({ code, discountAmount, fingerprint: cartFingerprint });
      setCouponInput(code);
      setCouponFeedback(`${code} applied — you save ${formatPrice(discountAmount)}.`);
    } catch (couponError) {
      setCouponFeedback(getErrorMessage(couponError, "Could not check that coupon. Please try again."));
    } finally {
      setValidatingCoupon(false);
    }
  }

  function resetOrderForm() {
    setOrderResult(null);
    setCheckoutError("");
    setCart([]);
    setCouponInput("");
    setAppliedCoupon(null);
    setCouponFeedback("");
  }

  async function placeOrder(event) {
    event.preventDefault();
    setCheckoutError("");

    if (submitting) return;

    if (subscriptionAllowsTransactions !== true) {
      setCheckoutError(
        "Online ordering is temporarily unavailable at this restaurant. Please contact the restaurant team.",
      );
      return;
    }

    const currentAvailability = getRestaurantAvailability(
      restaurant,
      Date.now(),
    );
    if (!currentAvailability.canOrder) {
      setCheckoutError(currentAvailability.message);
      return;
    }

    if (tableToken && !tableContext) {
      setCheckoutError("This table QR is unavailable. Please ask staff for help.");
      return;
    }
    const selectedMode = tableContext ? "dine_in" : serviceMode;
    if (!tableContext && selectedMode === "dine_in") {
      setCheckoutError("Choose your table and continue to its menu before placing a dine-in order.");
      return;
    }
    if (selectedMode === "pickup" && restaurant?.pickup_enabled !== true) {
      setCheckoutError("Pickup is not available at this restaurant.");
      return;
    }
    if (selectedMode === "dine_in" && restaurant?.dine_in_enabled !== true) {
      setCheckoutError("Dine-in is not available at this restaurant.");
      return;
    }

    if (cart.length === 0) {
      setCheckoutError("Add at least one dish to your cart.");
      return;
    }

    const name = customerName.trim();

    if (!name || name.length > 80) {
      setCheckoutError("Enter your name (maximum 80 characters).");
      return;
    }

    const phone = normalizeIndianMobilePhone(customerPhone);
    if (!phone) {
      setCheckoutError("Enter a valid 10-digit Indian mobile number (with optional +91).");
      return;
    }

    if (orderNotes.trim().length > 500) {
      setCheckoutError("Order notes must be 500 characters or fewer.");
      return;
    }

    setSubmitting(true);

    try {
      // Recheck the effective mode at submission time. An older combined session
      // may have just closed, and the next session must use the current setting.
      let useGuestBilling = isGuestBilling;
      let activeGuestToken = guestTabToken;
      try {
        const { data: currentMode, error: modeError } = await supabase.rpc(
          "khaavio_public_table_billing_mode",
          { p_slug: slug, p_table_token: tableToken },
        );
        if (!modeError && (currentMode === "combined" || currentMode === "per_guest")) {
          useGuestBilling = currentMode === "per_guest";
          setRestaurant((current) => current ? { ...current, table_billing_mode: currentMode } : current);
          if (useGuestBilling) {
            const key = getGuestTabStorageKey(slug, tableToken);
            let storedToken = window.localStorage.getItem(key);
            if (canStartFreshGuestBill(guestTabSnapshot)) {
              storedToken = null;
            }
            if (!storedToken) {
              storedToken = createGuestTabToken();
              window.localStorage.setItem(key, storedToken);
            }
            activeGuestToken = storedToken;
            setGuestTabToken(activeGuestToken);
          }
        }
      } catch {
        if (isGuestBilling) useGuestBilling = true;
      }

      const payload = {
        p_slug: slug,
        p_table_token: tableToken,
        p_customer_name: name,
        p_customer_phone: phone,
        p_notes: orderNotes.trim() || null,
        p_items: cart.map((entry) => ({
          item_id: entry.id,
          quantity: entry.quantity,
          option_ids: entry.optionIds || [],
        })),
        p_loyalty_member_token: getOrCreateKhaavioLoyaltyToken(slug),
        p_loyalty_phone: loyaltyPhone || null,
        p_coupon_code: activeCoupon?.code || null,
      };

      if (!tableContext) {
        const { data, error: orderError } = await supabase.rpc("place_public_order_for_service_mode", {
          p_slug: slug,
          p_customer_name: name,
          p_customer_phone: phone,
          p_notes: orderNotes.trim() || null,
          p_items: payload.p_items,
          p_service_mode: selectedMode,
          p_pickup_eta_minutes: selectedMode === "pickup" ? pickupEtaMinutes : null,
          p_coupon_code: activeCoupon?.code || null,
          p_loyalty_phone: loyaltyPhone || null,
        });
        if (orderError) throw orderError;
        const result = Array.isArray(data) ? data[0] : data;
        if (!result?.order_id) throw new Error("We couldn't confirm the order reference. Please contact the restaurant before trying again.");
        setOrderResult({ id: result.order_id, reference: result.order_reference, total: Number(result.total_amount) || 0, trackingToken: result.tracking_token || null, couponCode: activeCoupon?.code || null, discountAmount: cartDiscount, serviceMode: selectedMode, pickupEtaMinutes: selectedMode === "pickup" ? pickupEtaMinutes : null });
        setCart([]);
        setOrderNotes("");
        setCouponInput("");
        setAppliedCoupon(null);
        setCouponFeedback("");
        return;
      }

      if (useGuestBilling && !activeGuestToken) {
        throw new Error("Your guest bill is still being prepared. Please wait a moment and try again.");
      }

      const guestOrderRequest = useGuestBilling
        ? getOrCreateGuestOrderRequest(
            slug,
            tableToken,
            activeGuestToken,
            JSON.stringify({
              name,
              phone: payload.p_customer_phone,
              notes: payload.p_notes,
              items: payload.p_items,
              loyaltyMemberToken: payload.p_loyalty_member_token,
              loyaltyPhone: payload.p_loyalty_phone,
              couponCode: payload.p_coupon_code,
            }),
          )
        : null;

      const couponAwareRpc = useGuestBilling
        ? "place_public_order_for_guest_with_coupon"
        : "place_public_order_with_coupon_and_loyalty";
      const legacyRpc = useGuestBilling
        ? "place_public_order_for_guest_with_loyalty"
        : "place_public_order_with_loyalty";
      const rpcPayload = useGuestBilling
        ? {
            ...payload,
            p_guest_tab_token: activeGuestToken,
            p_guest_display_name: name,
            p_guest_order_request_token: guestOrderRequest.token,
          }
        : payload;
      let { data, error: orderError } = await supabase.rpc(couponAwareRpc, rpcPayload);
      const couponRpcNotInstalled = orderError && !payload.p_coupon_code
        && (orderError.code === "PGRST202" || orderError.code === "42883");
      if (couponRpcNotInstalled) {
        // Keep current ordering available while an administrator applies the new migration.
        ({ data, error: orderError } = await supabase.rpc(legacyRpc, rpcPayload));
      }

      if (orderError) throw orderError;

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.order_id) {
        throw new Error(
          "We couldn't confirm the order reference. Please check with restaurant staff before submitting again.",
        );
      }

      setOrderResult({
        id: result.order_id,
        reference: result.order_reference,
        total: Number(result.total_amount) || 0,
        trackingToken: result.tracking_token || null,
        couponCode: activeCoupon?.code || null,
        discountAmount: cartDiscount,
        serviceMode: "dine_in",
      });

      if (guestOrderRequest) {
        try {
          window.sessionStorage.removeItem(guestOrderRequest.key);
        } catch {
          // The order is already committed; storage cleanup failure must not report an order failure.
        }
      }
      setCart([]);
      setOrderNotes("");
      setCouponInput("");
      setAppliedCoupon(null);
      setCouponFeedback("");
      if (useGuestBilling) void refreshGuestBillSnapshot(activeGuestToken);
    } catch (err) {
      setCheckoutError(
        getErrorMessage(
          err,
          "We couldn't place your order. Please review your cart and try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="public-menu-page public-menu-loading">
        <div className="public-menu-loader-mark" aria-hidden="true">
          <UtensilsCrossed size={24} />
        </div>
        <LoaderCircle className="public-menu-spinner" size={28} />
        <p>Preparing your menu...</p>
      </main>
    );
  }

  return (
    <main className="public-menu-page">
      <header className="public-menu-header">
        <div
          className="public-menu-brand"
          aria-label={`${restaurant?.name || "Restaurant"} menu`}
        >
          <span className="public-menu-brand-mark" aria-hidden="true">
            <span className="public-menu-brand-initial">
              {(restaurant?.name || "R").trim().charAt(0).toUpperCase()}
            </span>
            {restaurant?.logo_url && (
              <img
                src={restaurant.logo_url}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.opacity = "0";
                }}
              />
            )}
          </span>
          <span className="public-menu-brand-copy">
            <strong>{restaurant?.name || "Restaurant"}</strong>
            <small>
              {restaurant?.restaurant_type
                ? restaurant.restaurant_type.replace(/_/g, " ")
                : "Restaurant menu"}
            </small>
          </span>
        </div>

        <div className="public-menu-header-actions">
          {tableContext && (
            <span
              className="public-menu-table-badge"
              aria-label={`Ordering at table ${normalizeTableNumber(tableContext.table_number)}`}
            >
              <UtensilsCrossed size={17} aria-hidden="true" />
              <span>Table {normalizeTableNumber(tableContext.table_number)}</span>
            </span>
          )}
          {isGuestBilling ? (
            <button
              type="button"
              className="public-menu-header-bill"
              onClick={() => {
                setGuestBillOpen(true);
                void refreshGuestBillSnapshot();
              }}
              aria-label="Open My Bill"
            >
              <ReceiptText size={17} aria-hidden="true" />
              <span>My Bill</span>
              <b>{formatPrice(Number(guestTabSnapshot?.invoice?.total_amount ?? guestTabSnapshot?.tab?.total_amount) || 0)}</b>
            </button>
          ) : (
            <button
              type="button"
              className="public-menu-header-cart"
              aria-label={`View cart with ${cartQuantity} items`}
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag size={17} />
              <span>View cart</span>
              <b>{cartQuantity}</b>
            </button>
          )}
        </div>
      </header>

      {guestBillOpen && isGuestBilling && (
        <div
          className="public-cart-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !guestBillLoading) setGuestBillOpen(false);
          }}
        >
          <section
            className="public-order-section public-cart-drawer public-guest-bill-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-guest-bill-heading"
            tabIndex={-1}
          >
            <div className="public-cart-drawer-topbar">
              <span className="public-menu-eyebrow">TABLE {normalizeTableNumber(tableContext?.table_number)}</span>
              <button
                type="button"
                className="public-cart-drawer-close"
                aria-label="Close my bill"
                onClick={() => setGuestBillOpen(false)}
                disabled={guestBillLoading}
              ><X size={19} /></button>
            </div>
            <div className="public-order-heading">
              <div>
                <span className="public-menu-eyebrow">YOUR PERSONAL TAB</span>
                <h2 id="public-guest-bill-heading">My Bill</h2>
                <p>Every order you place from this device is collected here.</p>
              </div>
              {guestTabSnapshot?.tab?.status && (
                <span className="public-guest-bill-status">{guestTabSnapshot.tab.status.replace(/_/g, " ")}</span>
              )}
            </div>
            {guestBillError && <div className="public-order-error" role="alert">{guestBillError}</div>}
            {guestBillLoading && (
              <p className="public-guest-bill-loading">
                <LoaderCircle className="public-menu-spinner" size={17} /> Updating your bill…
              </p>
            )}
            {!guestTabSnapshot?.exists ? (
              <div className="public-order-empty">
                <div className="public-menu-empty-icon"><ShoppingBag size={24} /></div>
                <h3>Your personal bill starts with your first order</h3>
                <p>Place an order from this menu. Your next orders from this browser will be added to the same bill.</p>
                <button type="button" className="public-order-submit" onClick={() => setGuestBillOpen(false)}>Browse menu</button>
              </div>
            ) : (
              <>
                <div className="public-guest-bill-orders">
                  {(guestTabSnapshot.orders || []).map((order) => (
                    <article className="public-guest-bill-order" key={order.id}>
                      <div className="public-guest-bill-order-heading">
                        <div>
                          <strong>Order #{order.reference}</strong>
                          <small>{new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(order.created_at))}</small>
                        </div>
                        <span>{formatPrice(order.total_amount)}</span>
                      </div>
                      <div className="public-guest-bill-item-list">
                        {(order.items || []).map((item) => (
                          <div key={item.id}>
                            <span>{item.quantity}× {item.item_name}</span>
                            <strong>{formatPrice(item.line_total)}</strong>
                          </div>
                        ))}
                      </div>
                      <small className="public-guest-bill-order-status">{order.status.replace(/_/g, " ")}</small>
                    </article>
                  ))}
                </div>
                <div className="public-guest-bill-total">
                  <span>{guestTabSnapshot.invoice ? "Final bill" : "Running total"}</span>
                  <strong>{formatPrice(guestTabSnapshot.invoice?.total_amount ?? guestTabSnapshot.tab?.total_amount)}</strong>
                </div>
                {guestTabSnapshot.invoice ? (
                  <div className="public-guest-bill-invoice">
                    <strong>{guestTabSnapshot.invoice.invoice_number}</strong>
                    {guestTabSnapshot.invoice.gstin_snapshot && <span>GSTIN: {guestTabSnapshot.invoice.gstin_snapshot}</span>}
                    {Number(guestTabSnapshot.invoice.tax_amount) > 0 && <span>GST {guestTabSnapshot.invoice.gst_inclusive ? "included" : "added"}: {formatPrice(guestTabSnapshot.invoice.tax_amount)}</span>}
                    <span>Status: {guestTabSnapshot.invoice.payment_status}</span>
                    {guestTabSnapshot.invoice.payment_status === "paid" ? (
                      <p>Your bill is paid. Thank you for dining with us!</p>
                    ) : (
                      <p>Your final bill has been requested. Please pay with restaurant staff.</p>
                    )}
                  </div>
                ) : guestTabSnapshot.tab?.status === "open" ? (
                  <button
                    type="button"
                    className="public-order-submit"
                    onClick={requestGuestBill}
                    disabled={guestBillLoading || Number(guestTabSnapshot.tab?.order_count || 0) < 1}
                  >
                    {guestBillLoading ? <LoaderCircle className="public-menu-spinner" size={17} /> : <CheckCircle2 size={17} />}
                    Request final bill
                  </button>
                ) : null}
                {canStartFreshGuestBill(guestTabSnapshot) && (
                  <button type="button" className="public-order-submit" onClick={startNewGuestBill}>Start a new bill</button>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {error ? (
        <section className="public-menu-state">
          <div className="public-menu-state-icon">
            <UtensilsCrossed size={28} />
          </div>
          <span className="public-menu-eyebrow">MENU UNAVAILABLE</span>
          <h1>Menu unavailable</h1>
          <p>{error}</p>
          <Link to="/" className="public-menu-button">
            <ArrowLeft size={16} />
            Return home
          </Link>
        </section>
      ) : restaurant ? (
        <>
          {activeBottomTab === "menu" && (
            <>
          <section className="public-menu-promo-slider" data-display-mode={currentPromoSlide.displayMode || "text_overlay"} aria-label="Restaurant food highlights">
            <div className="public-menu-promo-image" aria-hidden="true">
              {currentPromoSlide.imageItem?.image_url ? (
                <img
                  key={currentPromoSlide.imageItem.id}
                  src={currentPromoSlide.imageItem.image_url}
                  alt=""
                  fetchPriority={activePromoIndex === 0 ? "high" : "auto"}
                />
              ) : (
                <div className="public-menu-promo-image-placeholder">
                  <UtensilsCrossed size={38} aria-hidden="true" />
                </div>
              )}
            </div>

            {currentPromoSlide.displayMode !== "image_only" && <div className="public-menu-promo-copy" key={activePromoSlide}>
              <span className="public-menu-promo-eyebrow">
                <span aria-hidden="true" />
                {currentPromoSlide.eyebrow}
              </span>
              <h1>
                <span>{currentPromoSlide.titleStart}</span>
                  {currentPromoSlide.titleAccent && <strong>{currentPromoSlide.titleAccent}</strong>}
              </h1>
              <p>{currentPromoSlide.description}</p>
            </div>}

            <div className="public-menu-promo-dots" aria-label="Choose banner">
              {promoSlides.map((slide, index) => (
                <button
                  key={slide.eyebrow}
                  type="button"
                  className={index === activePromoIndex ? "is-active" : ""}
                  aria-label={`Show banner ${index + 1}`}
                  aria-pressed={index === activePromoIndex}
                  onClick={() => setActivePromoSlide(index)}
                />
              ))}
            </div>
          </section>

          {!tableContext && <section className="public-menu-fulfillment" id="public-menu-fulfillment" aria-label="Order mode">
            <div className="public-menu-fulfillment-heading">
              <span className="public-menu-eyebrow">ORDER MODE</span>
              <h2>How would you like your order?</h2>
            </div>
            {(restaurant?.pickup_enabled || restaurant?.dine_in_enabled) ? (
              <>
                <fieldset className="public-menu-fulfillment-options">
                  <legend className="sr-only">Choose pickup or dine in</legend>
                  {restaurant?.pickup_enabled && (
                    <label className={serviceMode === "pickup" ? "is-selected" : ""}>
                      <input type="radio" name="public_menu_service_mode" value="pickup" checked={serviceMode === "pickup"} onChange={() => setServiceMode("pickup")} />
                      <span><strong>Pickup</strong><small>Order ahead and collect</small></span>
                    </label>
                  )}
                  {restaurant?.dine_in_enabled && (
                    <label className={serviceMode === "dine_in" ? "is-selected" : ""}>
                      <input type="radio" name="public_menu_service_mode" value="dine_in" checked={serviceMode === "dine_in"} onChange={() => setServiceMode("dine_in")} />
                      <span><strong>Dine in</strong><small>Enjoy your order here</small></span>
                    </label>
                  )}
                </fieldset>
                {serviceMode === "pickup" && restaurant?.pickup_enabled && (
                  <label className="public-menu-fulfillment-time">
                    <span>Pickup time</span>
                    <select value={pickupEtaMinutes} onChange={(event) => setPickupEtaMinutes(Number(event.target.value))}>
                      <option value={0}>As soon as possible</option>
                      <option value={15}>In 15 minutes</option>
                      <option value={30}>In 30 minutes</option>
                      <option value={45}>In 45 minutes</option>
                      <option value={60}>In 60 minutes</option>
                    </select>
                  </label>
                )}
                {serviceMode === "dine_in" && restaurant?.dine_in_enabled && (
                  <div className="public-menu-table-chooser">
                    {tableSelectionError && <p className="public-menu-table-chooser-error" role="alert">{tableSelectionError}</p>}
                    {tableListLoaded && availableTables.length === 0 && (
                      <p role="status">No active tables are available. Please ask staff or choose Pickup.</p>
                    )}
                    {availableTables.length > 0 && (
                      <>
                        <div
                          className="public-menu-table-picker"
                          onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) setIsTablePickerOpen(false);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setIsTablePickerOpen(false);
                          }}
                        >
                          <span>Select your table</span>
                          <button
                            type="button"
                            className="public-menu-table-picker-trigger"
                            aria-haspopup="listbox"
                            aria-expanded={isTablePickerOpen}
                            aria-label={selectedTableToken ? `Table ${normalizeTableNumber(availableTables.find((table) => table.qr_token === selectedTableToken)?.table_number)}` : "Choose a table"}
                            onClick={() => setIsTablePickerOpen((open) => !open)}
                          >
                            <span>{selectedTableToken
                              ? `Table ${normalizeTableNumber(availableTables.find((table) => table.qr_token === selectedTableToken)?.table_number)}`
                              : "Choose a table"}</span>
                            <ChevronDown size={16} aria-hidden="true" />
                          </button>
                          {isTablePickerOpen && (
                            <div className="public-menu-table-picker-options" role="listbox" aria-label="Available tables">
                              {availableTables.map((table) => {
                                const isSelected = selectedTableToken === table.qr_token;
                                return (
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    className={isSelected ? "is-selected" : ""}
                                    key={table.qr_token}
                                    onClick={() => {
                                      setSelectedTableToken(table.qr_token);
                                      setIsTablePickerOpen(false);
                                      setTableSelectionError("");
                                    }}
                                  >
                                    <span className="public-menu-table-picker-indicator" aria-hidden="true">{isSelected ? "✓" : ""}</span>
                                    <span>Table {normalizeTableNumber(table.table_number)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="public-menu-table-chooser-continue"
                          disabled={!selectedTableToken}
                          onClick={continueToSelectedTable}
                        >
                          Continue with table
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : <p className="public-menu-fulfillment-disabled">Online ordering is currently unavailable.</p>}
          </section>}

          {publicOffers.length > 0 && (
            <section className="public-menu-offers" aria-label="Current restaurant offers">
              <div className="public-menu-offers-heading">
                <span><Tag size={14} /> OFFERS FOR YOU</span>
                <p>Use a code at checkout</p>
              </div>
              <div className="public-menu-offers-list">
                {publicOffers.slice(0, 3).map((offer) => (
                  <article className="public-menu-offer-card" key={offer.code}>
                    <div className="public-menu-offer-copy">
                      <strong>{offer.title}</strong>
                      <span className="public-menu-offer-discount">
                        {offer.discount_type === "percent"
                          ? `${Number(offer.discount_value)}% off`
                          : `${formatPrice(offer.discount_value)} off`}
                      </span>
                      <span className="public-menu-offer-details">
                        Code <code>{offer.code}</code>
                        {Number(offer.minimum_order_amount) > 0 && ` · Min. ${formatPrice(offer.minimum_order_amount)}`}
                        {offer.maximum_discount_amount != null && ` · Up to ${formatPrice(offer.maximum_discount_amount)}`}
                      </span>
                    </div>
                    <button type="button" onClick={() => choosePublicOffer(offer)}>Use code</button>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="public-menu-content" id="menu">
            <div className="public-menu-tools">
              <label className="public-menu-search">
                <Search size={18} />
                <input
                  type="search"
                  placeholder="Search dishes, cuisine..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search menu items"
                />
                {search && (
                  <button
                    type="button"
                    className="public-menu-clear-search"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </label>
              <span className="public-menu-tools-note">
                <Leaf size={14} />
                Freshly listed by the restaurant
              </span>
            </div>

            <div className="public-menu-smart-filters" aria-label="Quick menu filters">
              {SMART_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={smartFilter === filter.value ? "is-active" : ""}
                  aria-pressed={smartFilter === filter.value}
                  onClick={() => setSmartFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div
              className="public-menu-categories"
              aria-label="Menu categories"
            >
              <button
                type="button"
                className={categoryId === "all" ? "active" : ""}
                onClick={() => setCategoryId("all")}
                aria-pressed={categoryId === "all"}
              >
                All
              </button>

              {categories.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  className={categoryId === category.id ? "active" : ""}
                  onClick={() => setCategoryId(category.id)}
                  aria-pressed={categoryId === category.id}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <div className="public-menu-section-heading">
              <h2>Popular dishes</h2>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategoryId("all");
                  setSmartFilter("all");
                }}
                aria-label="See all dishes"
              >
                See all <ChevronRight size={17} aria-hidden="true" />
              </button>
            </div>

            {visibleItems.length > 0 ? (
              <div className="public-menu-grid">
                {visibleItems.map((item) => {
                  const category = categories.find(
                    (entry) => entry.id === item.category_id,
                  );
                  const cartEntries = cart.filter((entry) => entry.id === item.id);
                  const itemQuantity = cartEntries.reduce((sum, entry) => sum + entry.quantity, 0);

                  return (
                    <article className="public-menu-card" key={item.id}>
                      <div className="public-menu-card-media">
                        {item.image_url ? (
                          <img
                            className="public-menu-image"
                            src={item.image_url}
                            alt={item.name}
                            loading="lazy"
                          />
                        ) : (
                          <div className="public-menu-image-empty">
                            <UtensilsCrossed size={25} />
                            <span>Made with care</span>
                          </div>
                        )}
                        <span className="public-menu-item-available">
                          <span />
                          Available
                        </span>
                      </div>

                      <div className="public-menu-card-body">
                        <span className="public-menu-item-category">
                          {category?.name || "From our kitchen"}
                        </span>
                        {(FOOD_TYPE_LABELS[item.food_type] || item.is_jain_friendly || item.spice_level && item.spice_level !== "unspecified") && (
                          <div className="public-menu-item-tags" aria-label="Dish attributes">
                            {FOOD_TYPE_LABELS[item.food_type] && (
                              <span className={`public-menu-food-tag is-${item.food_type}`}>
                                {FOOD_TYPE_LABELS[item.food_type]}
                              </span>
                            )}
                            {item.is_jain_friendly === true && <span className="public-menu-food-tag is-jain">JAIN FRIENDLY</span>}
                            {item.spice_level && item.spice_level !== "unspecified" && (
                              <span className={`public-menu-food-tag is-spice-${item.spice_level}`}>
                                {item.spice_level === "hot" ? "HOT" : item.spice_level.toUpperCase()}
                              </span>
                            )}
                          </div>
                        )}
                        {Array.isArray(item.allergens) && item.allergens.length > 0 && (
                          <p className="public-menu-allergens">
                            Contains: {item.allergens.map((allergen) => String(allergen).replace(/_/g, " ")).join(" · ")}
                          </p>
                        )}
                        <h3>{item.name}</h3>

                        {item.description && (
                          <p className="public-menu-description">
                            {item.description}
                          </p>
                        )}

                        <div className="public-menu-item-footer">
                          <strong>{formatPrice(item.price)}</strong>
                          {itemQuantity > 0 ? (
                            <div className="public-menu-add-controls">
                              <button
                                type="button"
                                aria-label={`Remove one ${item.name}`}
                                onClick={() => changeQuantity(cartEntries[0].cartKey, -1)}
                              >
                                <Minus size={14} />
                              </button>
                              <strong>{itemQuantity}</strong>
                              <button
                                type="button"
                                aria-label={`Add one ${item.name}`}
                                onClick={() => addToCart(item)}
                                disabled={itemQuantity >= 20}
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="public-menu-add-button"
                              onClick={() => addToCart(item)}
                              aria-label={`Add ${item.name} to order`}
                            >
                              <Plus size={16} />
                              Add
                            </button>
                          )}
                        </div>
                        {itemQuantity > 0 && (
                          <span className="public-menu-quantity-hint">
                            {itemQuantity} in your cart
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="public-menu-empty">
                <div className="public-menu-empty-icon">
                  <Search size={24} />
                </div>
                <h3>No dishes found</h3>
                <p>
                  {items.length
                    ? "Try another search or choose a different category."
                    : "This restaurant has no available dishes yet."}
                </p>
                {(search || categoryId !== "all" || smartFilter !== "all") && (
                  <button
                    type="button"
                    className="public-menu-reset-filters"
                    onClick={() => {
                      setSearch("");
                      setCategoryId("all");
                      setSmartFilter("all");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </section>
            </>
          )}

          {activeBottomTab === "rewards" && canUseLoyaltyRewards && (
            <section className="public-menu-tab-view public-menu-rewards-view" aria-labelledby="public-menu-rewards-title">
              <div className="public-menu-tab-hero public-menu-tab-hero-rewards">
                <span className="public-menu-tab-eyebrow"><Gift size={15} /> YOUR REWARDS</span>
                <h1 id="public-menu-rewards-title">Dine more, get rewarded.</h1>
                <p>Collect stamps on eligible orders and unlock treats from {restaurant.name}.</p>
              </div>
              <div className="public-menu-tab-content">
                <PublicLoyaltyClub
                  slug={slug}
                  phone={loyaltyPhone}
                  onPhoneChange={handleLoyaltyPhoneChange}
                />
              </div>
            </section>
          )}

          {activeBottomTab === "book" && (
            <div className="public-menu-tab-view public-menu-booking-view">
              <PublicBooking
                slugOverride={slug}
                embedded
                onReturnToMenu={() => switchBottomTab("menu")}
              />
            </div>
          )}

          {activeBottomTab === "reviews" && canShowReviewsTab && (
            <section className="public-menu-tab-view public-menu-reviews-view" aria-labelledby="public-menu-reviews-heading">
              <div className="public-menu-tab-hero public-menu-tab-hero-reviews">
                <span className="public-menu-tab-eyebrow"><Star size={15} /> RATINGS & REVIEW</span>
                <h1 id="public-menu-reviews-heading">{canUsePrivateFeedback ? "Your feedback means a lot." : "Enjoyed your visit?"}</h1>
                <p>{canUsePrivateFeedback
                  ? `Tell ${restaurant.name} how your experience went, or leave an honest Google review.`
                  : `Leave an honest Google review to help other guests discover ${restaurant.name}.`}</p>
              </div>
              <div className="public-menu-tab-content">
                <PublicReviewsFeedback
                  restaurantSlug={slug}
                  restaurantName={restaurant.name}
                  googleReviewUrl={restaurant.google_review_url}
                  socialLinks={restaurant.social_links}
                  allowGoogleReviewLink={publicFeatures.google_review_link}
                  allowPrivateFeedback={canUsePrivateFeedback}
                />
              </div>
            </section>
          )}

          {isCartOpen && (
            <div
              className="public-cart-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !submitting) {
                  setIsCartOpen(false);
                }
              }}
            >
              <section
                className="public-order-section public-cart-drawer"
                id="your-order"
                role="dialog"
                aria-modal="true"
                aria-labelledby="public-cart-heading"
                tabIndex={-1}
              >
                <div className="public-cart-drawer-topbar">
                  <span className="public-menu-eyebrow">YOUR SELECTION</span>
                  <button
                    type="button"
                    className="public-cart-drawer-close"
                    aria-label="Close cart"
                    onClick={() => setIsCartOpen(false)}
                    disabled={submitting}
                  >
                    <X size={19} />
                  </button>
                </div>
                <div className="public-order-heading">
                  <div>
                    <span className="public-menu-eyebrow">
                      READY WHEN YOU ARE
                    </span>
                    <h2 id="public-cart-heading">Your order</h2>
                    <p>
                      Review your selection before sending it to the kitchen.
                    </p>
                  </div>

                  <span className="public-order-count">
                    <ShoppingBag size={15} />
                    {cartQuantity} {cartQuantity === 1 ? "item" : "items"}
                  </span>
                </div>

                {orderResult ? (
                  <div className="public-order-success" role="status">
                    <div className="public-order-success-icon">
                      <CheckCircle2 size={30} />
                    </div>

                    <span className="public-menu-eyebrow">ORDER SUBMITTED</span>
                    <h3>Thank you, {customerName.trim()}!</h3>
                    <p>
                      Your order was saved successfully. Please share the
                      reference below with restaurant staff.
                    </p>
                    <p className="public-order-fulfillment-confirmed">{orderResult.serviceMode === "pickup" ? `Pickup · ${orderResult.pickupEtaMinutes === 0 ? "as soon as possible" : `in ${orderResult.pickupEtaMinutes} minutes`}` : tableContext ? `Dine in · Table ${normalizeTableNumber(tableContext.table_number)}` : "Dine-in order"}</p>

                    <div className="public-order-reference">
                      <span>Order reference</span>
                      <strong>{orderResult.reference}</strong>
                    </div>

                    {orderResult.discountAmount > 0 && <p className="public-order-confirmed-discount">Coupon {orderResult.couponCode} saved {formatPrice(orderResult.discountAmount)}</p>}
                    <div className="public-order-confirmed-total">
                      <span>Confirmed total</span>
                      <strong>{formatPrice(orderResult.total)}</strong>
                    </div>

                    {orderResult.trackingToken ? (
                      <>
                        <p className="public-order-pending-note">
                          Your order is pending. Follow its progress using the
                          secure tracking link below. Online payment has not
                          been collected for this order.
                        </p>

                        <Link
                          className="public-order-track-link"
                          to={`/track/${encodeURIComponent(slug)}/${encodeURIComponent(
                            orderResult.id,
                          )}?token=${encodeURIComponent(orderResult.trackingToken)}`}
                        >
                          Track my order
                          <ChevronRight size={17} />
                        </Link>
                      </>
                    ) : (
                      <p className="public-order-pending-note">
                        Your order was submitted, but a tracking link could not
                        be generated. Please share your order reference with
                        restaurant staff and avoid placing the same order again.
                      </p>
                    )}

                    <button
                      type="button"
                      className="public-order-submit public-order-secondary-submit"
                      onClick={() => {
                        resetOrderForm();
                        setIsCartOpen(false);
                      }}
                    >
                      Place another order
                    </button>
                  </div>
                ) : cart.length === 0 ? (
                  <div className="public-order-empty">
                    <div className="public-menu-empty-icon">
                      <ShoppingBag size={24} />
                    </div>
                    <h3>Your cart is waiting</h3>
                    <p>
                      Add a dish from the menu above and it will show up here.
                    </p>
                    <a
                      href="#menu"
                      className="public-menu-secondary-link"
                      onClick={() => setIsCartOpen(false)}
                    >
                      Browse menu
                      <ChevronRight size={16} />
                    </a>
                  </div>
                ) : (
                  <div className="public-order-layout">
                    <div className="public-order-cart">
                      <div className="public-order-cart-heading">
                        <h3>Items in your cart</h3>
                        <button
                          type="button"
                          className="public-order-clear"
                          onClick={() => {
                            setCart([]);
                            setCouponInput("");
                            setAppliedCoupon(null);
                            setCouponFeedback("");
                            setCheckoutError("");
                            setOrderResult(null);
                          }}
                        >
                          Clear cart
                        </button>
                      </div>

                      {cart.map((entry) => (
                        <div className="public-order-line" key={entry.cartKey}>
                          <div className="public-order-line-info">
                            <strong>{entry.name}</strong>
                            <span>{formatPrice(entry.unitPrice ?? entry.price)} each</span>
                            {entry.selectedOptions?.map((option) => <small key={option.id}>{option.group_name}: {option.name}{Number(option.price_delta) ? ` (+${formatPrice(option.price_delta)})` : ""}</small>)}
                          </div>

                          <div className="public-order-line-controls">
                            <button
                              type="button"
                              aria-label={`Decrease ${entry.name} quantity`}
                              onClick={() => changeQuantity(entry.cartKey, -1)}
                            >
                              <Minus size={14} />
                            </button>
                            <span>{entry.quantity}</span>
                            <button
                              type="button"
                              aria-label={`Increase ${entry.name} quantity`}
                              onClick={() => changeQuantity(entry.cartKey, 1)}
                              disabled={entry.quantity >= 20}
                            >
                              <Plus size={14} />
                            </button>
                          </div>

                          <strong className="public-order-line-total">
                            {formatPrice(Number(entry.unitPrice ?? entry.price) * entry.quantity)}
                          </strong>

                          <button
                            className="public-order-remove"
                            type="button"
                            aria-label={`Remove ${entry.name} from cart`}
                            onClick={() => removeFromCart(entry.cartKey)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}

                      <div className="public-order-total">
                        <span>Subtotal</span>
                        <strong>{formatPrice(cartTotal)}</strong>
                      </div>
                      {activeCoupon && <div className="public-order-discount-row"><span>Coupon {activeCoupon.code}</span><strong>−{formatPrice(cartDiscount)}</strong></div>}
                      <div className="public-order-final-total"><span>Estimated total</span><strong>{formatPrice(cartFinalTotal)}</strong></div>
                      <p className="public-order-estimate-note">
                        Coupon eligibility and the final order total are checked again when you submit. GST, if enabled, is calculated on the final bill.
                      </p>
                    </div>

                    <form className="public-order-form" onSubmit={placeOrder}>
                      <h3>Customer details</h3>

                      {tableContext ? (
                        <div className="public-order-table-info">
                          <CheckCircle2 size={16} />
                          <span>
                            Ordering for table{" "}
                            <strong>{normalizeTableNumber(tableContext.table_number)}</strong>
                          </span>
                        </div>
                      ) : (restaurant?.pickup_enabled || restaurant?.dine_in_enabled) ? (
                        <div className="public-order-fulfillment-summary">
                          <span>{serviceMode === "pickup" ? `Pickup · ${pickupEtaMinutes === 0 ? "As soon as possible" : `in ${pickupEtaMinutes} minutes`}` : "Dine in"}</span>
                          <button type="button" onClick={() => document.getElementById("public-menu-fulfillment")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Change</button>
                        </div>
                      ) : <div className="public-order-table-warning">Online pickup and dine-in ordering are currently disabled.</div>}

                      <div className="public-order-coupon">
                        <label htmlFor="public-order-coupon-code"><span>Coupon code</span></label>
                        <div className="public-order-coupon-entry">
                          <input
                            id="public-order-coupon-code"
                            value={couponInput}
                            onChange={(event) => {
                              setCouponInput(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24));
                              setAppliedCoupon(null);
                              setCouponFeedback("");
                            }}
                            maxLength={24}
                            autoCapitalize="characters"
                            placeholder="Enter coupon code"
                            aria-describedby="public-order-coupon-feedback"
                          />
                          {activeCoupon ? (
                            <button type="button" onClick={() => { setAppliedCoupon(null); setCouponFeedback("Coupon removed."); }} disabled={validatingCoupon}>Remove</button>
                          ) : (
                            <button type="button" onClick={() => void validateCoupon()} disabled={validatingCoupon || !couponInput.trim() || cart.length === 0}>
                              {validatingCoupon ? <LoaderCircle size={14} className="public-menu-spinner" /> : "Apply"}
                            </button>
                          )}
                        </div>
                        {couponFeedback && <p className={`public-order-coupon-feedback${activeCoupon ? " is-success" : ""}`} id="public-order-coupon-feedback" role="status">{couponFeedback}</p>}
                      </div>

                      <label>
                        <span>Your name *</span>
                        <input
                          value={customerName}
                          onChange={(event) =>
                            setCustomerName(event.target.value)
                          }
                          maxLength={80}
                          autoComplete="name"
                          placeholder="Enter your name"
                          required
                        />
                      </label>

                      <label>
                        <span>Mobile number *</span>
                        <input
                          type="tel"
                          value={customerPhone}
                          onChange={(event) => {
                            setCustomerPhone(event.target.value);
                            setCheckoutError("");
                          }}
                          maxLength={25}
                          autoComplete="tel"
                          inputMode="tel"
                          aria-describedby="public-order-phone-help"
                          placeholder="10-digit mobile number"
                          required
                        />
                      </label>
                      <p className="public-order-field-help" id="public-order-phone-help">
                        Required to identify your order and help the restaurant with service. Promotional messages require separate consent.
                      </p>

                      <label>
                        <span>Special instructions (optional)</span>
                        <textarea
                          value={orderNotes}
                          onChange={(event) =>
                            setOrderNotes(event.target.value)
                          }
                          maxLength={500}
                          rows={3}
                          placeholder="e.g. Less spicy, no onion..."
                        />
                      </label>

                      {checkoutError && (
                        <div className="public-order-error" role="alert">
                          {checkoutError}
                        </div>
                      )}

                      <button
                        type="submit"
                        className="public-order-submit"
                        disabled={
                          submitting ||
                          subscriptionAllowsTransactions !== true ||
                          cart.length === 0 ||
                          (tableToken && !tableContext) ||
                          (!tableContext && serviceMode === "dine_in") ||
                          (!restaurant?.pickup_enabled && !restaurant?.dine_in_enabled) ||
                          !orderingAvailability.canOrder
                        }
                      >
                        {submitting ? (
                          <LoaderCircle
                            className="public-menu-spinner"
                            size={17}
                          />
                        ) : (
                          <ShoppingBag size={17} />
                        )}
                        {submitting
                          ? "Submitting order..."
                          : `Place order - ${formatPrice(cartFinalTotal)}`}
                      </button>

                      <p className="public-order-disclaimer">
                        {!orderingAvailability.canOrder
                          ? orderingAvailability.message
                          : "No online payment is collected. The restaurant receives this order as pending."}
                      </p>
                    </form>
                  </div>
                )}
              </section>
            </div>
          )}

          {activeBottomTab === "menu" && (
          <footer className="public-menu-footer">
            <a
              className="public-menu-footer-brand"
              href="https://khaavio.in/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Khaavio â€” restaurant ordering platform"
            >
              <img src={khaavioIcon} alt="" />
              <div>
                <span>
                  Powered by <strong>Khaavio</strong>
                </span>
                <small>A better way to order</small>
              </div>
            </a>
          </footer>
          )}

          <nav className="public-menu-bottom-navigation" aria-label="Public menu navigation">
            <button
              type="button"
              className={activeBottomTab === "menu" ? "is-active" : ""}
              aria-pressed={activeBottomTab === "menu"}
              onClick={() => switchBottomTab("menu")}
            >
              <UtensilsCrossed size={19} strokeWidth={2.1} />
              <span>Menu</span>
            </button>
            {canUseLoyaltyRewards && (
              <button
                type="button"
                className={activeBottomTab === "rewards" ? "is-active" : ""}
                aria-pressed={activeBottomTab === "rewards"}
                onClick={() => switchBottomTab("rewards")}
              >
                <Gift size={19} strokeWidth={2.1} />
                <span>Rewards</span>
              </button>
            )}
            <button
              type="button"
              className={activeBottomTab === "book" ? "is-active" : ""}
              aria-pressed={activeBottomTab === "book"}
              onClick={() => switchBottomTab("book")}
            >
              <CalendarDays size={19} strokeWidth={2.1} />
              <span>Book table</span>
            </button>
            {canShowReviewsTab && (
              <button
                type="button"
                className={activeBottomTab === "reviews" ? "is-active" : ""}
                aria-pressed={activeBottomTab === "reviews"}
                onClick={() => switchBottomTab("reviews")}
              >
                <Star size={19} strokeWidth={2.1} />
                <span>Ratings & Review</span>
              </button>
            )}
          </nav>

          {optionPickerItem && (
            <div className="public-option-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOptionPickerItem(null); }}>
              <section className="public-option-modal" role="dialog" aria-modal="true" aria-labelledby="public-option-title">
                <button type="button" className="public-option-modal-close" aria-label="Close choices" onClick={() => setOptionPickerItem(null)}><X size={19} /></button>
                <h2 id="public-option-title">Customize {optionPickerItem.name}</h2>
                <p>Choose the options for this dish.</p>
                {menuOptionGroups.filter((group) => group.menu_item_id === optionPickerItem.id).map((group) => {
                  const selectedInGroup = group.options.filter((option) => selectedOptionIds.includes(option.id)).length;
                  const singleChoice = group.max_selections === 1;
                  return <fieldset className="public-option-group" key={group.id}>
                    <legend>{group.name} <small>{group.min_selections ? `Required · choose ${group.min_selections === group.max_selections ? group.min_selections : `${group.min_selections}–${group.max_selections}`}` : `Optional · choose up to ${group.max_selections}`}</small></legend>
                    {group.options.map((option) => {
                      const checked = selectedOptionIds.includes(option.id);
                      const canSelect = singleChoice || checked || selectedInGroup < group.max_selections;
                      return <label key={option.id} className="public-option-choice">
                        <input type={singleChoice ? "radio" : "checkbox"} name={`option-${group.id}`} checked={checked} disabled={!canSelect} onChange={() => setSelectedOptionIds((current) => {
                          if (singleChoice) return checked ? current.filter((id) => !group.options.some((entry) => entry.id === id)) : [...current.filter((id) => !group.options.some((entry) => entry.id === id)), option.id];
                          return checked ? current.filter((id) => id !== option.id) : [...current, option.id];
                        })} />
                        <span>{option.name}</span>
                        <strong>{Number(option.price_delta) > 0 ? `+${formatPrice(option.price_delta)}` : Number(option.price_delta) < 0 ? `−${formatPrice(Math.abs(Number(option.price_delta)))}` : "Included"}</strong>
                      </label>;
                    })}
                  </fieldset>;
                })}
                {checkoutError && <p className="public-order-error" role="alert">{checkoutError}</p>}
                <button type="button" className="public-order-submit" onClick={confirmOptionSelection}>Add to order</button>
              </section>
            </div>
          )}

          <PublicTableService
            slug={slug}
            tableToken={tableToken}
            tableContext={tableContext}
            hasStickyCart={activeBottomTab === "menu" && cart.length > 0 && !orderResult && !isCartOpen}
          />

          {canUseAskKhaavio && (
            <AskKhaavio
              restaurant={restaurant}
              menuItems={items}
              categories={categories}
              onAddToCart={addToCart}
              hasStickyCart={activeBottomTab === "menu" && cart.length > 0 && !orderResult && !isCartOpen}
            />
          )}

          {activeBottomTab === "menu" && cart.length > 0 && !orderResult && !isCartOpen && (
            <button
              type="button"
              className="public-menu-sticky-cart"
              aria-label={`View cart with ${cartQuantity} items, total ${formatPrice(cartFinalTotal)}`}
              onClick={() => setIsCartOpen(true)}
            >
              <span className="public-menu-sticky-cart-count">
                <ShoppingBag size={17} />
                {cartQuantity}
              </span>
              <span className="public-menu-sticky-cart-label">
                <small>
                  {cartQuantity === 1
                    ? "1 ITEM ADDED"
                    : `${cartQuantity} ITEMS ADDED`}
                </small>
                <strong>{formatPrice(cartFinalTotal)}</strong>
              </span>
              <span className="public-menu-sticky-cart-action">
                View cart
                <ChevronRight size={17} />
              </span>
            </button>
          )}
        </>
      ) : null}
    </main>
  );
}

